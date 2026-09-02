/**
 * Pointing at material that lives outside Tend.
 *
 * Two things are worth testing here and one of them is not obvious.
 *
 * The age, because it is the whole mechanism against a stale reading being
 * read as current advice, and it is the kind of thing that gets dropped from a
 * row to make it fit.
 *
 * And the scheme check, because these open through `shell.openExternal`, which
 * hands the address to whatever the operating system has registered for its
 * scheme - and the field is writable over the agent surface. An unchecked URL
 * there is a way to launch arbitrary handlers.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import * as api from "../src/service/api.js";
import { callTool } from "../src/mcp/tools.js";
import { hostOf, webAddress } from "../src/domain/links.js";
import { openStore } from "../src/storage/store.js";
import { DAY_MS } from "../src/domain/time.js";
import { failed, ok } from "./helpers.mjs";

const NOW = 1_800_000_000_000;
/** @param {number} n */
const daysAgo = (n) => NOW - n * DAY_MS;

/** @type {string} */
let dir;
/** @type {import("../src/storage/store.js").TendStore} */
let store;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tend-links-"));
  let t = NOW - 1_000_000;
  store = openStore({ dataDir: dir, role: "app", host: "test", now: () => t++ });
  store.create("people", { id: "vidar", name: "Vidar Lund", relation: "manage-remotely", since: daysAgo(300) });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("what counts as a web address", () => {
  it("takes http and https", () => {
    assert.equal(webAddress("https://example.com/a").ok, true);
    assert.equal(webAddress("http://example.com").ok, true);
  });

  it("refuses every other scheme, and says why rather than just no", () => {
    /*
     * The one with teeth. These open through the operating system's handler for
     * the scheme, so a stored `javascript:` or `file:` is not a broken link -
     * it is a launcher, reachable from a field an agent can write.
     */
    for (const bad of ["javascript:alert(1)", "file:///C:/Windows/System32/cmd.exe", "data:text/html,<h1>x", "ms-msdt:/id"]) {
      const why = webAddress(bad);
      assert.equal(why.ok, false, `${bad} was accepted`);
      assert.match(String(why.why), /https/, `the refusal for ${bad} does not say what is allowed`);
    }
  });

  it("refuses something that is not an address at all", () => {
    assert.equal(webAddress("prep for the next 1-1").ok, false);
    assert.equal(webAddress("").ok, false);
    assert.equal(webAddress(null).ok, false);
  });

  it("names a link by its host when nothing was typed, not by its whole path", () => {
    // A row reading the full address with a uuid in it pushes everything else
    // off the line.
    assert.equal(hostOf("https://claude.ai/code/artifact/08b7783e-a9a0"), "claude.ai");
    assert.equal(hostOf("https://www.example.com/x"), "example.com");
  });
});

describe("linking something to a person", () => {
  it("stores the address and the date, never a copy", () => {
    const made = ok(
      api.linkTo(store, {
        person: "Vidar",
        url: "https://claude.ai/code/artifact/abc",
        title: "Prep for the next 1-1",
        now: NOW
      })
    );
    assert.match(String(made.linked), /Vidar Lund/);

    const [row] = store.rows("links");
    assert.equal(String(row.url), "https://claude.ai/code/artifact/abc");
    assert.equal(Number(row.at), NOW);
    assert.equal(String(row.subjectKind), "person");
  });

  it("falls back to the host as the title", () => {
    ok(api.linkTo(store, { person: "Vidar", url: "https://claude.ai/code/artifact/abc", now: NOW }));
    assert.equal(String(store.rows("links")[0].title), "claude.ai");
  });

  it("refuses a scheme that would launch something", () => {
    failed(api.linkTo(store, { person: "Vidar", url: "file:///C:/Windows/System32/cmd.exe", now: NOW }));
    assert.equal(store.rows("links").length, 0);
  });

  it("refuses a person it cannot resolve rather than filing it against nobody", () => {
    failed(api.linkTo(store, { person: "Nobody At All", url: "https://example.com", now: NOW }));
  });

  it("refuses the same address twice on one person, and says when the first went on", () => {
    // Almost always a second press rather than a second thing, and two
    // identical rows on a page is the kind of small mess nobody cleans up.
    ok(api.linkTo(store, { person: "Vidar", url: "https://example.com/a", now: daysAgo(3) }));
    const why = failed(api.linkTo(store, { person: "Vidar", url: "https://example.com/a", now: NOW }));
    assert.match(why, /already/);
    assert.match(why, /3 days/);
  });

  it("allows the same address on two different people", () => {
    store.create("people", { id: "nea", name: "Nea Ferm", relation: "manage-remotely", since: daysAgo(100) });
    ok(api.linkTo(store, { person: "Vidar", url: "https://example.com/shared", now: NOW }));
    ok(api.linkTo(store, { person: "Nea", url: "https://example.com/shared", now: NOW }));
    assert.equal(store.rows("links").length, 2);
  });
});

describe("reading links back", () => {
  it("carries the age, because that is what stops a stale reading looking current", () => {
    ok(api.linkTo(store, { person: "Vidar", url: "https://example.com/old", title: "Spring prep", now: daysAgo(200) }));
    ok(api.linkTo(store, { person: "Vidar", url: "https://example.com/new", title: "Today", now: NOW }));

    const rows = ok(api.links(store, { person: "Vidar", now: NOW }));
    assert.equal(rows.length, 2);
    // Newest first: the useful question is what the latest reading was.
    assert.equal(rows[0].title, "Today");
    assert.equal(rows[0].added, "today");
    // Weeks, which is what the app counts in everywhere. The number is the
    // point: "28 weeks ago" cannot be mistaken for current advice.
    assert.equal(rows[1].added, "28 weeks ago");
  });

  it("does not expire anything on its own", () => {
    /*
     * Deciding a reading is spent is a judgement. A page that quietly hid
     * material would be worse than one showing something plainly marked as
     * months old - the second is honest, the first loses the record.
     */
    ok(api.linkTo(store, { person: "Vidar", url: "https://example.com/ancient", now: daysAgo(900) }));
    assert.equal(ok(api.links(store, { person: "Vidar", now: NOW })).length, 1);
  });

  it("reaches the person's own page", () => {
    ok(api.linkTo(store, { person: "Vidar", url: "https://example.com/a", title: "Prep", now: NOW }));
    const page = ok(api.person(store, "Vidar", NOW));
    assert.equal(page.links.length, 1);
    assert.equal(page.links[0].title, "Prep");
  });

  it("goes when unlinked, and says so rather than failing silently", () => {
    const made = ok(api.linkTo(store, { person: "Vidar", url: "https://example.com/a", now: NOW }));
    ok(api.unlink(store, String(made.id)));
    assert.equal(ok(api.links(store, { person: "Vidar", now: NOW })).length, 0);
    failed(api.unlink(store, String(made.id)));
  });
});

describe("through the agent surface", () => {
  it("links, reads back and removes without touching the app", () => {
    callTool(store, "tend_link_to", { person: "Vidar", url: "https://claude.ai/x", title: "Prep" }, NOW);
    const read = ok(callTool(store, "tend_links", { person: "Vidar" }, NOW));
    assert.equal(read.length, 1);
    assert.equal(read[0].added, "today");

    callTool(store, "tend_unlink", { id: read[0].id }, NOW);
    assert.equal(ok(callTool(store, "tend_links", { person: "Vidar" }, NOW)).length, 0);
  });

  it("refuses a launchable scheme over the agent surface too", () => {
    // The surface that matters for this check: the app has a form, an agent has
    // a string it was handed.
    const r = callTool(store, "tend_link_to", { person: "Vidar", url: "javascript:alert(1)" }, NOW);
    assert.ok(r && typeof r === "object" && "error" in r, "a javascript: URL was accepted");
    assert.equal(store.rows("links").length, 0);
  });
});
