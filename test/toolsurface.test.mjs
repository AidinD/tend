/**
 * What an MCP tool actually accepts, as against what it says it accepts.
 *
 * ## The hole this closes
 *
 * `callTool` does not validate arguments against a tool's `inputSchema`. So a
 * tool whose `run` spreads `{ ...args }` hands the service every key the caller
 * sent, declared or not - and `additionalProperties: false` in the schema is
 * documentation rather than a gate.
 *
 * Fourteen of the tools spread. That was found while closing a duplication bug
 * on 2026-09-10: a window-only refusal was about to be guarded by a field the
 * schema did not declare, which an agent could therefore have set. The fix there
 * was to pin the field off AFTER the spread, which is the shape
 * `tend_propose_decision` had already been using for its status.
 *
 * ## Why this is a source-reading test
 *
 * The thing being checked is a mismatch between two declarations - the schema's
 * properties and the service function's destructured parameters - and neither is
 * introspectable at runtime. Reading the source is what makes the claim
 * checkable at all, and this repo already tests that way where it has to: the
 * palette tests parse the stylesheet, and the vocabulary test greps the views
 * for unread keys.
 *
 * ## What it does NOT claim
 *
 * That every reachable field is dangerous. Some are inert by construction, and
 * those are listed below with the reason. What it claims is that no field
 * becomes reachable WITHOUT somebody deciding it should be - which is the part
 * that went wrong.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Fields a tool passes on purpose that its schema does not declare, with why
 * each is harmless. Anything not on this list has to be declared or pinned.
 *
 * Keeping the reasons here rather than in a comment is the point: a field added
 * to this list is a decision somebody wrote down.
 */
/** @type {Record<string, Record<string, string>>} */
const ALLOWED = {
  tend_propose_decision: {
    /*
     * Both are inert for a proposal, in two places rather than one.
     * `logDecision` sets `revisitAt: null` when the status is proposed, and
     * `revisitStatus` returns not-due for a proposal regardless - so an agent
     * cannot manufacture an overdue revisit. And `decideDecision` overwrites
     * `decidedAt` with the moment of acceptance, so a backdated proposal cannot
     * pre-start the clock either.
     */
    decidedAt: "overwritten with now when the proposal is accepted",
    revisitDays: "ignored while proposed; revisitAt is null until accepted"
  }
};

/** Every exported service function, with the names it destructures. */
function serviceFields() {
  /** @type {Map<string, string[] | null>} */
  const found = new Map();
  const dir = join(root, "src/service");
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js")) {
      continue;
    }
    const src = readFileSync(join(dir, file), "utf8");
    for (const m of src.matchAll(/export function (\w+)\s*\(([^)]*)\)/g)) {
      const [, name, args] = m;
      const brace = args.indexOf("{");
      if (brace < 0) {
        found.set(name, null);
        continue;
      }
      found.set(
        name,
        args
          .slice(brace + 1, args.lastIndexOf("}"))
          .split(",")
          .map((piece) => piece.split("=")[0].split(":")[0].trim())
          .filter((piece) => /^\w+$/.test(piece))
      );
    }
  }
  return found;
}

/** The tools that spread, with what they declare and what they pin. */
function spreadingTools() {
  const src = readFileSync(join(root, "src/mcp/tools.js"), "utf8");
  const out = [];
  for (const block of src.split(/\n  \{\n    name: "/).slice(1)) {
    const name = block.slice(0, block.indexOf('"'));
    if (!/run:[^\n]*\{ \.\.\.args/.test(block)) {
      continue;
    }
    const call = block.match(/api\.(\w+)\(store/);

    /*
     * The schema region, then every `name: {` inside it.
     *
     * Not a match on the `properties` block alone: that comes in two shapes in
     * this file - one property per line, and the single-line
     * `properties: { person: {...} }` - and a pattern that only knew the first
     * read a declared field as undeclared and reported a hole that was not one.
     * Everything nested under a property is `type: "string"` and the like, so
     * only a name followed by a brace is a property.
     */
    const schemaAt = block.indexOf("inputSchema:");
    const runAt = block.indexOf("run:");
    const schema = schemaAt < 0 || runAt < 0 ? "" : block.slice(schemaAt, runAt);

    /* Pinned after the spread, in either shape: `field: value` or shorthand. */
    const pinned = [];
    for (const match of block.matchAll(/\.\.\.args,([^)]*)\)/g)) {
      for (const piece of match[1].split(",")) {
        const field = piece.replace(/[{}]/g, "").split(":")[0].trim();
        if (/^\w+$/.test(field)) {
          pinned.push(field);
        }
      }
    }

    out.push({
      name,
      call: call?.[1] ?? "",
      declared: [...schema.matchAll(/(\w+):\s*\{/g)]
        .map((x) => x[1])
        .filter((field) => field !== "inputSchema" && field !== "properties"),
      pinned
    });
  }
  return out;
}

describe("a tool accepts what it says it accepts", () => {
  it("finds the tools that spread their arguments at all", () => {
    // If this drops to zero the parser has stopped matching and every check
    // below would pass while reading nothing.
    const spreading = spreadingTools();
    assert.ok(spreading.length > 8, `only ${spreading.length} spreading tools found`);
    assert.ok(
      spreading.every((t) => t.call !== ""),
      "a spreading tool's service call could not be read"
    );
  });

  it("and can read a service function's parameters", () => {
    const fields = serviceFields();
    const touch = fields.get("logTouch");
    assert.ok(touch, "logTouch was not found in the service");
    assert.ok(touch.includes("anyway"), `logTouch's parameters read as ${touch.join(", ")}`);
  });

  it("reads a schema's declared properties in both of the shapes used here", () => {
    /*
     * Calibration, because the first version of this parser knew only the
     * one-property-per-line shape and read `tend_links` - whose whole schema is
     * a single line - as declaring nothing, then reported its one real
     * parameter as an undeclared hole.
     */
    const tools = new Map(spreadingTools().map((t) => [t.name, t]));
    assert.deepEqual(
      tools.get("tend_log_touch")?.declared,
      ["subject", "kind", "note", "at"],
      "the multi-line shape is not read"
    );
    assert.deepEqual(
      tools.get("tend_links")?.declared,
      ["person"],
      "the single-line shape is not read"
    );
  });

  it("passes no field the schema does not declare, unless it is written down", () => {
    /*
     * THE test. A field reachable but undeclared is a capability nobody decided
     * to grant: `tell` on tend_log_growth_note recorded who outside a
     * conversation was told about somebody's development, and would have done it
     * without the promise the window pairs it with.
     */
    const fields = serviceFields();
    const problems = [];

    for (const tool of spreadingTools()) {
      const accepted = fields.get(tool.call);
      if (!accepted) {
        continue;
      }
      const allowed = ALLOWED[tool.name] ?? {};
      for (const field of accepted) {
        if (tool.declared.includes(field) || tool.pinned.includes(field)) {
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(allowed, field)) {
          continue;
        }
        problems.push(`${tool.name} passes "${field}" to ${tool.call} without declaring it`);
      }
    }

    assert.deepEqual(
      problems,
      [],
      `${problems.length} undeclared field(s) reachable over MCP:\n  ${problems.join("\n  ")}`
    );
  });

  it("keeps the allowances honest by naming a reason for each", () => {
    // A list of exceptions with no reasons becomes the place findings go to be
    // forgotten.
    for (const [tool, fieldsAllowed] of Object.entries(ALLOWED)) {
      for (const [field, why] of Object.entries(fieldsAllowed)) {
        assert.ok(
          typeof why === "string" && why.trim().length > 20,
          `${tool}.${field} is allowed with no reason worth reading`
        );
      }
    }
  });

  it("and does not allow a field that is no longer reachable", () => {
    /*
     * The other direction: an allowance left behind after the field was
     * declared or pinned reads as a live exception and is not one. Keeping the
     * list honest in both directions is what stops it growing.
     */
    const fields = serviceFields();
    const tools = new Map(spreadingTools().map((t) => [t.name, t]));
    const stale = [];

    for (const [name, fieldsAllowed] of Object.entries(ALLOWED)) {
      const tool = tools.get(name);
      if (tool === undefined) {
        stale.push(`${name} no longer spreads its arguments`);
        continue;
      }
      const accepted = fields.get(tool.call) ?? [];
      for (const field of Object.keys(fieldsAllowed)) {
        if (!accepted.includes(field)) {
          stale.push(`${name}.${field} is not a parameter of ${tool.call} any more`);
        } else if (tool.declared.includes(field) || tool.pinned.includes(field)) {
          stale.push(`${name}.${field} is now declared or pinned, so the allowance is dead`);
        }
      }
    }

    assert.deepEqual(stale, [], `stale allowances:\n  ${stale.join("\n  ")}`);
  });
});
