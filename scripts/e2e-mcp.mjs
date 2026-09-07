#!/usr/bin/env node
/**
 * End-to-end check of the MCP server.
 *
 * Starts the real server as a child process over stdio and drives it with a
 * real MCP client. Unit tests prove the tools behave; this proves the process
 * starts, speaks the protocol, finds its data directory and writes to disk.
 *
 * Runs entirely against a scratch directory, so it never touches real data.
 *
 *   node scripts/e2e-mcp.mjs
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "src", "mcp", "server.js");
const scratch = mkdtempSync(join(tmpdir(), "tend-e2e-"));

/*
 * One thing has to be seeded before the server starts rather than through it,
 * and the reason is the boundary itself: a feedback round cannot be written over
 * MCP by design, so the only honest way to prove an agent can READ one is to
 * put it there some other way first. Written through the service, into the same
 * scratch directory the server is about to open.
 */
const seeded = await (async () => {
  const { openStore } = await import("../src/storage/store.js");
  const api = await import("../src/service/api.js");
  // Role "app", not an invented one - the store refuses those, and correctly:
  // the claim under test is that a round entered in the WINDOW can be read
  // over the protocol, so the window is who should have written it.
  const store = openStore({ dataDir: scratch, role: "app", host: "e2e" });
  const now = Date.now();
  const who = api.addPerson(store, { name: "Testkodare", relation: "lead-and-manage", now });
  api.recordAssessment(store, {
    person: String(who.id),
    assessor: "Testproducent",
    assessorRole: "producent på projektet",
    assessorWeight: "low",
    weighWhy: "slarvig, toppbetyg utan att skriva något",
    set: "producentrond",
    setName: "Producentrond",
    scores: [
      { axis: "Leverans och ägarskap", score: 5 },
      { axis: "Kommunikation", score: 4 }
    ],
    note: "",
    now
  });
  return { person: "Testkodare" };
})();

let failures = 0;

/** @param {string} label @param {() => void} fn */
function check(label, fn) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL ${label}`);
    console.error(`       ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** @param {any} result */
function payload(result) {
  return JSON.parse(result.content[0].text);
}

console.log(`Scratch data directory: ${scratch}\n`);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: { ...process.env, TEND_DATA_DIR: scratch },
  stderr: "pipe"
});

const client = new Client({ name: "tend-e2e", version: "1.0.0" }, { capabilities: {} });

try {
  await client.connect(transport);
  console.log("Connected.\n");

  const { tools } = await client.listTools();
  check("server advertises its tools", () => {
    assert.ok(tools.length >= 12, `expected at least 12 tools, saw ${tools.length}`);
    for (const name of [
      "tend_attention",
      "tend_person",
      "tend_log_promise",
      "tend_propose_duty",
      "tend_assessments"
    ]) {
      assert.ok(tools.some((t) => t.name === name), `missing ${name}`);
    }
  });

  check("no tool can change a duty's status", () => {
    const offender = tools.find((t) => /decide|accept|activate/i.test(t.name));
    assert.equal(offender, undefined, `found ${offender?.name}`);
  });

  const empty = payload(await client.callTool({ name: "tend_attention", arguments: {} }));
  check("an empty store says everything is in step rather than erroring", () => {
    assert.equal(empty.allInStep, true);
    assert.deepEqual(empty.needsYou, []);
  });

  const missing = await client.callTool({ name: "tend_person", arguments: { person: "Nobody" } });
  check("an unknown person comes back as a correctable message", () => {
    assert.equal(missing.isError, true);
    assert.match(payload(missing).error, /No person matching/);
  });

  // Seed just enough to exercise a real write-then-read cycle.
  const proposed = payload(
    await client.callTool({
      name: "tend_propose_duty",
      arguments: {
        name: "Second-hand read",
        means: "A standing exchange with the other team's lead about this person.",
        source: "The Manager's Path, ch. 5-6",
        subjectKind: "person",
        cadenceDays: 30,
        evidenceKinds: ["second-hand"],
        relations: ["manage-remotely"]
      }
    })
  );
  const map = payload(await client.callTool({ name: "tend_role_map", arguments: {} }));
  check("a duty proposed over MCP lands as a proposal", () => {
    assert.ok(proposed.id);
    assert.equal(map.proposed.length, 1);
    assert.equal(map.active.length, 0, "an agent must not be able to activate a duty");
  });

  const afterProposal = payload(await client.callTool({ name: "tend_attention", arguments: {} }));
  check("a proposal does not start nagging on its own", () => {
    assert.equal(afterProposal.allInStep, true);
  });

  const badRelation = await client.callTool({
    name: "tend_propose_duty",
    arguments: { name: "x", means: "y", source: "z", subjectKind: "person", cadenceDays: 7, relations: ["skip-level"] }
  });
  check("an invented relationship type is rejected", () => {
    assert.equal(badRelation.isError, true);
    assert.match(payload(badRelation).error, /Unknown relationship type/);
  });

  const noPerson = await client.callTool({
    name: "tend_log_promise",
    arguments: { person: "Ghost", text: "something" }
  });
  check("a promise against an unknown person is refused, not silently dropped", () => {
    assert.equal(noPerson.isError, true);
  });

  /*
   * A round entered in the window, read back over the protocol.
   *
   * The gap this exists for: a colleague session entered two people's answers in
   * the app and had no way to confirm the rows had landed. Preparing a review
   * from a different picture of the same person is worse than preparing from
   * nothing, because it reads as agreement.
   */
  const rounds = payload(
    await client.callTool({ name: "tend_assessments", arguments: { person: seeded.person } })
  );
  check("an agent can read a round entered in the window", () => {
    assert.equal(rounds.answers.length, 1, JSON.stringify(rounds).slice(0, 200));
    assert.equal(rounds.answers[0].assessor, "Testproducent");
    assert.equal(rounds.answers[0].assessorWeight, "low");
    assert.match(rounds.answers[0].weighWhy, /slarvig/);
    assert.equal(rounds.answers[0].saidAnything, false);
  });

  check("and gets the aggregate per axis, with no figure for the person", () => {
    // The defect this feature was ported without. Two assessors answering
    // different questions must never meet in one number, so there is nothing
    // for one to be reported as.
    assert.equal(rounds.byAxis.length, 2);
    assert.ok(rounds.byAxis.every((/** @type {any} */ a) => a.n === 1));
    const named = Object.keys(rounds).filter((k) => /average|mean|overall|total/i.test(k));
    assert.deepEqual(named, [], `a figure for the person came over the wire: ${named.join(", ")}`);
  });

  const onPage = payload(
    await client.callTool({ name: "tend_person", arguments: { person: seeded.person } })
  );
  check("a person's page carries how their rounds stand", () => {
    assert.ok(onPage.assessments, "tend_person still says nothing about a person's rounds");
    assert.equal(onPage.assessments.answers, 1);
    assert.equal(onPage.assessments.saidNothing, 1);
  });

  check("but not who said it, nor what they wrote, nor why they are weighed low", () => {
    /*
     * The split, checked over the wire rather than only in a unit test. An
     * aggregate is about the subject; an answer is about the assessor as much as
     * about them, so it is asked for through its own tool.
     */
    const json = JSON.stringify(onPage.assessments);
    assert.doesNotMatch(json, /Testproducent/);
    assert.doesNotMatch(json, /slarvig/);
  });

  const writers = tools.filter(
    (t) => /(record|log|add|set|write|remove|delete|update)/i.test(t.name) && /assess/i.test(t.name)
  );
  check("and nothing over the protocol can write one", () => {
    // Parked rather than settled - see DECISIONS.md. A number about a named
    // colleague produced by anything but the colleague who gave it is the
    // highest-consequence row this app holds.
    assert.deepEqual(writers.map((t) => t.name), []);
  });

  console.log("");
} finally {
  await client.close().catch(() => {});
  rmSync(scratch, { recursive: true, force: true });
}

console.log(failures === 0 ? "All end-to-end checks passed." : `${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
