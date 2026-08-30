/**
 * Electron main process.
 *
 * Thin on purpose. It opens a window, owns the store, and forwards calls to the
 * same service layer the MCP server uses. Nothing here reimplements a query -
 * if the app and an agent could disagree about what the data says, this is the
 * file where that would start.
 */

import { BrowserWindow, app, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { registerWindowControls } from "keel/window";

// electron-updater is CommonJS, so a named ESM import does not work - the
// default import is the whole module object.
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

import { resolveModeDir } from "../domain/paths.js";
import { readMode, windowTitle, writeMode } from "./mode.js";
import * as api from "../service/api.js";
import * as model from "../service/model.js";
import * as knowledge from "../service/knowledge.js";
import * as nib from "../service/nib.js";
import { describeSync, startNibSync } from "../service/nibsync.js";
import { seedRoleMap } from "../service/seed.js";
import { openStore } from "../storage/store.js";
import { watchEvents } from "../storage/watch.js";

const here = dirname(fileURLToPath(import.meta.url));

/*
 * Which store this window is looking at.
 *
 * Read before anything else opens, because everything else depends on it. The
 * remembered mode lives in the app's own configuration directory rather than in
 * either store - see main/mode.js for why a file saying "you were last in
 * private mode" must not be carried along by a backup of the work directory.
 *
 * Chosen once per launch and never changed in place. Switching relaunches the
 * app, which is a deliberate choice over swapping the store underneath a running
 * window: the store, the change watcher, the Nib sync and every cached answer in
 * the renderer would all have to be rebuilt in the right order, and getting that
 * wrong once means private words written into the work store. A relaunch cannot
 * be half-done.
 */
const mode = readMode(app.getPath("userData"));
const { dir, source } = resolveModeDir(mode);

/**
 * The private half's window icon, built by scripts/generate-icon.mjs.
 *
 * Resolved relative to this file so it works both from source and from inside
 * the packaged asar, where `resources/` sits beside `src/`.
 */
const privateIcon = join(here, "..", "..", "resources", "icon-private.ico");

/** @type {string[]} */
const warnings = [];

/** Last thing the updater said, so Settings can show it. */
let updateStatus = "No update check has run yet.";
let updateListenersAttached = false;

/**
 * The job that keeps Tend's copy of Nib current. See service/nibsync.js.
 *
 * One per process rather than one per window: it is a property of the store,
 * and two windows syncing the same notebook twice as often would buy nothing.
 */
/** @type {ReturnType<typeof startNibSync> | null} */
let nibSync = null;

/**
 * Tell every open window something changed.
 *
 * The events watcher in `createWindow` deliberately ignores this process's own
 * appends, which is right for its job and wrong for this one: an automatic
 * import writes as the app's own writer, so without this the rows land and no
 * window has any reason to ask for them.
 *
 * @param {string} channel
 */
function broadcast(channel) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel);
    }
  }
}

const store = openStore({
  dataDir: dir,
  role: "app",
  // The store IS the half. Everything downstream asks it rather than being told.
  half: mode,
  onWarning: (msg) => {
    warnings.push(msg);
    console.warn(`[tend] ${msg}`);
  }
});

/**
 * Operations the renderer may call.
 *
 * A whitelist rather than a generic bridge: the renderer should not be able to
 * reach into the store and write arbitrary rows. Note that `decideDuty` is here
 * and deliberately absent from the MCP surface - accepting a duty is the user's
 * decision, made in this window.
 */
const OPERATIONS = {
  attention: (/** @type {any} */ a) => api.attention(store, a.now ?? Date.now()),
  person: (/** @type {any} */ a) => api.person(store, a.person, a.now ?? Date.now()),
  people: (/** @type {any} */ a) => api.people(store, a.now ?? Date.now(), a.relation),
  vocabulary: () => api.vocabulary(store),
  promises: (/** @type {any} */ a) => api.promises(store, a.now ?? Date.now()),
  roleMap: (/** @type {any} */ a) => api.roleMap(store, a.now ?? Date.now()),
  prep: (/** @type {any} */ a) => api.prep(store, a.now ?? Date.now()),
  decisions: (/** @type {any} */ a) => api.decisions(store, a.now ?? Date.now(), a.status),
  myAttention: (/** @type {any} */ a) => api.myAttentionSignals(store, a.now ?? Date.now()),
  focus: (/** @type {any} */ a) => api.focus(store, a.now ?? Date.now()),
  projects: (/** @type {any} */ a) => api.projects(store, a.now ?? Date.now()),

  // Archiving is a status flag on an existing row, not a decision about the
  // role map or the duties owed - so unlike decideDuty/decideTopic below it
  // is a plain operation here, and (see the MCP tool list) not exposed there
  // at all: an agent may add to a person's history, but taking them off the
  // roster is the user's call.
  archivedPeople: (/** @type {any} */ a) => api.archivedPeople(store, a.now ?? Date.now()),
  archivePerson: (/** @type {any} */ a) => api.archivePerson(store, a.id, { now: a.now ?? Date.now() }),
  unarchivePerson: (/** @type {any} */ a) => api.unarchivePerson(store, a.id),
  archivedProjects: (/** @type {any} */ a) => api.archivedProjects(store, a.now ?? Date.now()),
  archiveProject: (/** @type {any} */ a) => api.archiveProject(store, a.id, { now: a.now ?? Date.now() }),
  unarchiveProject: (/** @type {any} */ a) => api.unarchiveProject(store, a.id),
  archivedWorkstreams: (/** @type {any} */ a) => api.archivedWorkstreams(store, a.now ?? Date.now()),
  archiveWorkstream: (/** @type {any} */ a) => api.archiveWorkstream(store, a.id, { now: a.now ?? Date.now() }),
  unarchiveWorkstream: (/** @type {any} */ a) => api.unarchiveWorkstream(store, a.id),
  // The "I left this job" button in Settings. See api.archiveEverythingActive
  // for why this is a wrapper over the six operations above rather than its
  // own code path.
  archiveEverythingActive: (/** @type {any} */ a) => api.archiveEverythingActive(store, { now: a.now ?? Date.now() }),

  addPerson: (/** @type {any} */ a) => api.addPerson(store, { ...a, now: a.now ?? Date.now() }),
  setRelation: (/** @type {any} */ a) => api.setRelation(store, a.person, a.relation),
  updatePerson: (/** @type {any} */ a) => api.updatePerson(store, a.person, a.fields ?? {}),
  addProject: (/** @type {any} */ a) => api.addProject(store, { ...a, now: a.now ?? Date.now() }),
  logPromise: (/** @type {any} */ a) => api.logPromise(store, { ...a, now: a.now ?? Date.now() }),
  resolvePromise: (/** @type {any} */ a) => api.resolvePromise(store, a.id, a.as),
  logTouch: (/** @type {any} */ a) => api.logTouch(store, { ...a, now: a.now ?? Date.now() }),
  logEvidence: (/** @type {any} */ a) => api.logEvidence(store, { ...a, now: a.now ?? Date.now() }),
  proposeDuty: (/** @type {any} */ a) => api.proposeDuty(store, a),
  decideDuty: (/** @type {any} */ a) => api.decideDuty(store, a.id, a.status, a.overrides),
  logDecision: (/** @type {any} */ a) => api.logDecision(store, { ...a, now: a.now ?? Date.now() }),
  decideDecision: (/** @type {any} */ a) => api.decideDecision(store, a.id, a.fields ?? {}, a.now ?? Date.now()),
  stillHolds: (/** @type {any} */ a) => api.stillHolds(store, a.id, a.now ?? Date.now(), a.days),

  topics: (/** @type {any} */ a) => api.topics(store, a.person, a.now ?? Date.now()),
  allTopics: () => api.allTopics(store),
  proposeTopic: (/** @type {any} */ a) => api.proposeTopic(store, a),
  decideTopic: (/** @type {any} */ a) => api.decideTopic(store, a.id, a.status, a.overrides),
  markRaised: (/** @type {any} */ a) => api.markRaised(store, { ...a, now: a.now ?? Date.now() }),

  growth: (/** @type {any} */ a) => api.growth(store, a.person, a.now ?? Date.now()),
  thread: (/** @type {any} */ a) => api.thread(store, a.id, a.now ?? Date.now()),
  growthQuestions: (/** @type {any} */ a) => api.growthQuestions(store, a.now ?? Date.now()),
  openThread: (/** @type {any} */ a) => api.openThread(store, { ...a, now: a.now ?? Date.now() }),
  updateThread: (/** @type {any} */ a) => api.updateThread(store, a.id, a.fields ?? {}),
  endThread: (/** @type {any} */ a) => api.endThread(store, a.id, a),
  logGrowthNote: (/** @type {any} */ a) => api.logGrowthNote(store, { ...a, now: a.now ?? Date.now() }),

  waits: (/** @type {any} */ a) => api.waits(store, a.now ?? Date.now(), a.person),
  waitsOnNow: (/** @type {any} */ a) => api.waitsOnNow(store, a.now ?? Date.now()),
  waitFor: (/** @type {any} */ a) => api.waitFor(store, { ...a, now: a.now ?? Date.now() }),
  chase: (/** @type {any} */ a) => api.chase(store, { ...a, now: a.now ?? Date.now() }),
  stopWaiting: (/** @type {any} */ a) => api.stopWaiting(store, a.id, a),

  journal: (/** @type {any} */ a) => api.journal(store, a.now ?? Date.now(), a.days),
  logEntry: (/** @type {any} */ a) => api.logEntry(store, { ...a, now: a.now ?? Date.now() }),
  logMoment: (/** @type {any} */ a) => api.logMoment(store, { ...a, now: a.now ?? Date.now() }),
  momentsFor: (/** @type {any} */ a) => api.momentsFor(store, a.person, a.now ?? Date.now()),
  moments: (/** @type {any} */ a) => api.moments(store, a.now ?? Date.now()),
  logReflection: (/** @type {any} */ a) => api.logReflection(store, { ...a, now: a.now ?? Date.now() }),
  reflections: (/** @type {any} */ a) =>
    api.reflections(store, a.now ?? Date.now(), { limit: a.limit, since: a.since }),
  reviews: () => api.reviews(store),
  journalMaterial: (/** @type {any} */ a) => api.journalMaterial(store, a.now ?? Date.now(), a.days),
  keepReview: (/** @type {any} */ a) => api.keepReview(store, a.review ?? {}),

  logSkip: (/** @type {any} */ a) => api.logSkip(store, { ...a, now: a.now ?? Date.now() }),
  skips: (/** @type {any} */ a) => api.skips(store, a.person, a.now ?? Date.now()),

  stakeholders: (/** @type {any} */ a) => api.stakeholders(store, a.now ?? Date.now(), a.project),
  addStake: (/** @type {any} */ a) => api.addStake(store, a),
  updateStake: (/** @type {any} */ a) => api.updateStake(store, a.id, a),

  signals: (/** @type {any} */ a) => api.signals(store, a.now ?? Date.now()),
  answerSignal: (/** @type {any} */ a) => api.answerSignal(store, { ...a, now: a.now ?? Date.now() }),
  workstreams: (/** @type {any} */ a) => api.workstreams(store, a.now ?? Date.now()),
  addWorkstream: (/** @type {any} */ a) => api.addWorkstream(store, { ...a, now: a.now ?? Date.now() }),
  setDelegationLevel: (/** @type {any} */ a) => api.setDelegationLevel(store, a.id, a.level),

  // The model layer. Every entry here is reached by a button somebody pressed
  // or by a scheduled job - never from startup. See src/service/model.js.
  modelStatus: () => model.modelStatus(),
  draftBrief: (/** @type {any} */ a) => model.draftBrief(store, { ...a, now: a.now ?? Date.now() }),
  extractPromises: (/** @type {any} */ a) => model.extractPromises(store, a),
  detectThemes: (/** @type {any} */ a) => model.detectThemes(store, { ...a, now: a.now ?? Date.now() }),
  answerQuestion: (/** @type {any} */ a) => model.answerQuestion(store, { ...a, now: a.now ?? Date.now() }),
  reviewJournal: (/** @type {any} */ a) => model.reviewJournal(store, { ...a, now: a.now ?? Date.now() }),
  checkOwnPart: (/** @type {any} */ a) => model.checkOwnPart({ text: a.text }),

  searchKnowledge: (/** @type {any} */ a) => knowledge.search(a.situation, undefined, mode),
  considerKnowledge: (/** @type {any} */ a) => knowledge.consider(a),

  nibFolders: () => nib.listNibFolders(undefined, mode),
  nibTags: () => nib.listNibTags(undefined, mode),
  nibTagsInFolder: (/** @type {any} */ a) => nib.tagsInFolder(a.categoryId, a.subId ?? null, undefined, mode),
  setSourceRules: (/** @type {any} */ a) => api.setSourceRules(store, a),
  bindSource: (/** @type {any} */ a) => api.bindSource(store, a),
  sources: (/** @type {any} */ a) => api.sources(store, a.person),
  unbindSource: (/** @type {any} */ a) => api.unbindSource(store, a.id),
  indexNib: (/** @type {any} */ a) => nib.indexNib(store, { dry: Boolean(a.dry) }),

  setFocus: (/** @type {any} */ a) => api.setFocus(store, { ...a, now: a.now ?? Date.now() }),
  endFocus: () => api.endFocus(store),
  updateDuty: (/** @type {any} */ a) => api.updateDuty(store, a.id, a.fields ?? {}),
  removeRow: (/** @type {any} */ a) => api.removeRow(store, a.collection, a.id),
  seed: () => seedRoleMap(store),

  /**
   * Switch which store the app is looking at.
   *
   * Remembers the choice, then relaunches. The relaunch is the feature: see the
   * note beside `readMode` above.
   */
  setMode: (/** @type {any} */ a) => {
    const wanted = String(a.mode ?? "");
    if (wanted === mode) {
      return { mode, unchanged: true };
    }
    const saved = writeMode(app.getPath("userData"), /** @type {any} */ (wanted));
    if (!saved.ok) {
      return { error: saved.why };
    }
    // Relaunch rather than reload. Everything below the window - the store, the
    // watcher, the Nib sync - was opened for the old mode and there is no safe
    // order in which to swap them all while a view is drawing.
    app.relaunch();
    app.quit();
    return { mode: wanted, relaunching: true };
  },

  openDataDir: async () => {
    const problem = await shell.openPath(dir);
    return problem ? { error: problem } : { opened: dir };
  },

  checkForUpdates: () => {
    if (!app.isPackaged) {
      return { error: "Running from source, so there is no installed copy to update." };
    }
    checkForUpdates();
    return { checking: true };
  },

  // The three window buttons used to live here, in this whitelist, and they
  // reached for BrowserWindow.getFocusedWindow() - the window that happens to
  // have focus rather than the one that asked. keel/window answers them on
  // their own channels and acts on event.sender instead. See DECISIONS.md.

  status: () => ({
    mode,
    dataDir: dir,
    dataDirFrom: source,
    warnings: warnings.slice(-5),
    version: app.getVersion(),
    packaged: app.isPackaged,
    updateStatus,
    // Said out loud on the one screen somebody visits to ask whether the import
    // is working. A background job with no visible state is one you end up
    // pressing the manual button beside anyway, which defeats the point of it.
    nibSync: nibSync === null ? "Importing from Nib has not started." : describeSync(nibSync.state()),
    nibWatching: nibSync?.state().watching ?? false
  })
};

ipcMain.handle("tend:invoke", (_event, name, args) => {
  const op = /** @type {Record<string, (a: any) => any>} */ (OPERATIONS)[name];
  if (!op) {
    return { error: `Unknown operation "${name}".` };
  }
  try {
    return op(args ?? {});
  } catch (err) {
    return { error: `${name} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
});

// Minimize, maximize and close for the frameless header. Electron is passed in
// rather than imported by keel, which is what keeps that package free of an
// electron dependency of its own.
registerWindowControls({ ipcMain, BrowserWindow });

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 720,
    minHeight: 520,
    show: false,
    // Frameless, like Jot and Nib: the header row is the wordmark and the drag
    // handle, and carries its own window buttons.
    frame: false,
    backgroundColor: "#1b1c1f",
    autoHideMenuBar: true,
    /*
     * The private half's own icon.
     *
     * The one marking of the two halves that is visible when the app is not
     * focused: a title needs the window fronted to be read, a taskbar shows an
     * icon. With both halves open at once it is what tells them apart at a
     * glance, which is the same job the accent colour does inside the window.
     *
     * Passed only when the file is there. An `icon` pointing at nothing gives a
     * window with no icon at all, which is worse than the packaged default -
     * and in development there is no packaged default to fall back to.
     */
    ...(mode === "private" && existsSync(privateIcon) ? { icon: privateIcon } : {}),
    // The one label that is readable when the app is not focused, in the taskbar
    // and in a window switcher. A window whose mode you cannot see without
    // bringing it forward is a window you can type the wrong thing into.
    title: windowTitle(mode),
    webPreferences: {
      // .mjs, not .js: Electron loads a preload as CommonJS unless the
      // extension says otherwise, regardless of package.json type.
      preload: join(here, "..", "preload", "index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.once("ready-to-show", () => window.show());

  // Links to anything outside the app open in the real browser, not in here.
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.loadFile(join(here, "..", "renderer", "index.html"));

  // Somebody else writing to the log is news for this window. The store already
  // re-reads from disk on demand; what was missing was a reason to ask. Without
  // this, a contact logged over MCP stays invisible until the user navigates,
  // which reads as the app having lost the data rather than the screen being
  // old.
  const stopWatching = watchEvents({
    dir: join(dir, "events"),
    self: store.w,
    onWarning: (msg) => {
      warnings.push(msg);
      console.warn(`[tend] ${msg}`);
    },
    onChange: () => {
      if (!window.isDestroyed()) {
        window.webContents.send("tend:changed");
      }
    }
  });
  window.on("closed", stopWatching);

  return window;
}

/**
 * Check GitHub for a newer release, once, at startup.
 *
 * Tend is unsigned, which does not stop electron-updater on Windows: the first
 * install trips SmartScreen and updates after that are silent. The download
 * installs on quit rather than mid-session, which is the library's default and
 * the right one for something left open all day.
 *
 * Never in development. There is no packaged app to replace, and the check only
 * produces a confusing error in the log.
 */
function checkForUpdates() {
  if (!app.isPackaged) {
    return;
  }

  if (!updateListenersAttached) {
    updateListenersAttached = true;
    autoUpdater.on("update-available", (info) => {
      updateStatus = `Version ${info.version} is available and downloading.`;
      console.log(`[tend] update available: ${info.version}`);
    });
    autoUpdater.on("update-not-available", () => {
      updateStatus = "You are on the latest version.";
    });
    autoUpdater.on("update-downloaded", (info) => {
      updateStatus = `Version ${info.version} is ready and installs when you quit.`;
      console.log(`[tend] update ${info.version} downloaded; it installs on quit`);
    });
    autoUpdater.on("error", (error) => {
      // Being offline is the common case and is not worth a dialog.
      updateStatus = "Could not reach the update server. Probably offline.";
      console.error("[tend] update check failed", error);
    });
  }

  updateStatus = "Checking...";
  void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    updateStatus = "The update check could not start.";
    console.error("[tend] update check could not start", error);
  });
}

app.whenReady().then(() => {
  console.log(`[tend] ${mode} mode, data directory: ${dir} (${source})`);
  createWindow();

  // Before the update check and before anything slow: its first pass is
  // synchronous, so starting it here means the window's first query already
  // sees this morning's notes rather than last week's.
  nibSync = startNibSync({
    store,
    onChange: () => broadcast("tend:changed"),
    onWarning: (msg) => {
      warnings.push(msg);
      console.warn(`[tend] ${msg}`);
    }
  });

  checkForUpdates();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  nibSync?.stop();
  nibSync = null;
});
