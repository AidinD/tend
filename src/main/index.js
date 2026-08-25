/**
 * Electron main process.
 *
 * Thin on purpose. It opens a window, owns the store, and forwards calls to the
 * same service layer the MCP server uses. Nothing here reimplements a query -
 * if the app and an agent could disagree about what the data says, this is the
 * file where that would start.
 */

import { BrowserWindow, app, ipcMain, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { registerWindowControls } from "keel/window";

// electron-updater is CommonJS, so a named ESM import does not work - the
// default import is the whole module object.
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

import { resolveDataDir } from "../domain/paths.js";
import * as api from "../service/api.js";
import * as model from "../service/model.js";
import * as knowledge from "../service/knowledge.js";
import * as nib from "../service/nib.js";
import { seedRoleMap } from "../service/seed.js";
import { openStore } from "../storage/store.js";
import { watchEvents } from "../storage/watch.js";

const here = dirname(fileURLToPath(import.meta.url));
const { dir, source } = resolveDataDir();

/** @type {string[]} */
const warnings = [];

/** Last thing the updater said, so Settings can show it. */
let updateStatus = "No update check has run yet.";
let updateListenersAttached = false;

const store = openStore({
  dataDir: dir,
  role: "app",
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
  promises: (/** @type {any} */ a) => api.promises(store, a.now ?? Date.now()),
  roleMap: (/** @type {any} */ a) => api.roleMap(store, a.now ?? Date.now()),
  prep: (/** @type {any} */ a) => api.prep(store, a.now ?? Date.now()),
  decisions: (/** @type {any} */ a) => api.decisions(store, a.now ?? Date.now(), a.status),
  myAttention: (/** @type {any} */ a) => api.myAttentionSignals(store, a.now ?? Date.now()),
  focus: (/** @type {any} */ a) => api.focus(store, a.now ?? Date.now()),
  projects: (/** @type {any} */ a) => api.projects(store, a.now ?? Date.now()),

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

  journal: (/** @type {any} */ a) => api.journal(store, a.now ?? Date.now(), a.days),
  logEntry: (/** @type {any} */ a) => api.logEntry(store, { ...a, now: a.now ?? Date.now() }),

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

  searchKnowledge: (/** @type {any} */ a) => knowledge.search(a.situation),
  considerKnowledge: (/** @type {any} */ a) => knowledge.consider(a),

  nibFolders: () => nib.listNibFolders(),
  nibTags: () => nib.listNibTags(),
  nibTagsInFolder: (/** @type {any} */ a) => nib.tagsInFolder(a.categoryId, a.subId ?? null),
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
    dataDir: dir,
    dataDirFrom: source,
    warnings: warnings.slice(-5),
    version: app.getVersion(),
    packaged: app.isPackaged,
    updateStatus
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
    title: "Tend",
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
  console.log(`[tend] data directory: ${dir} (${source})`);
  createWindow();
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
