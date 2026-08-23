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
    for (const name of ["tend_attention", "tend_person", "tend_log_promise", "tend_propose_duty"]) {
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

  console.log("");
} finally {
  await client.close().catch(() => {});
  rmSync(scratch, { recursive: true, force: true });
}

console.log(failures === 0 ? "All end-to-end checks passed." : `${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
