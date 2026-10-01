#!/usr/bin/env node
/**
 * Tend's MCP server.
 *
 * A standalone process over the same files the app uses, so it works with the
 * app closed - which is the whole reason this is MCP over files rather than an
 * HTTP API the app would have to be running to serve.
 *
 * Wire it up in .mcp.json:
 *
 *   { "mcpServers": { "tend": { "command": "node",
 *     "args": ["D:/Repo/Tools/tend/src/mcp/server.js"] } } }
 *
 * Anything written to stdout is protocol. Diagnostics go to stderr.
 *
 * ## One half per process
 *
 * Without `TEND_MODE` this serves the work store, exactly as it always did. With
 * `TEND_MODE=private` the same server serves the private store instead, and the
 * store is opened as that half, because everything downstream asks the store
 * which half it is. Directory and half come from one value so they cannot
 * disagree.
 *
 * The private half is reached by configuration, never by inheritance: the
 * window's remembered mode is deliberately not read. The work server is
 * normally configured user-wide, which makes it visible to every session on the
 * machine, so it must stay on work whatever the window last showed. Configure a
 * private server in a project scope only, where the sessions that can see it are
 * the ones meant to.
 *
 * Rejected: one server exposing both halves through a mode argument on each
 * tool. Every session that has the server would then reach the private store
 * with one parameter, which is the leak the two stores exist to prevent.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { MODES, resolveModeDir } from "../domain/paths.js";
import { MODE_ENV, serverMode } from "../main/mode.js";
import { openStore } from "../storage/store.js";
import { callTool, toolManifest } from "./tools.js";

const { mode, ignored } = serverMode();
if (ignored !== null) {
  process.stderr.write(
    `[tend] ${MODE_ENV}="${ignored}" is not a mode (expected ${MODES.join(" or ")}); serving the work half\n`
  );
}

const { dir, source } = resolveModeDir(mode);

const store = openStore({
  dataDir: dir,
  role: "mcp",
  half: mode,
  onWarning: (msg) => {
    // stderr only. A warning on stdout would corrupt the protocol stream.
    process.stderr.write(`[tend] ${msg}\n`);
  }
});

process.stderr.write(`[tend] ${mode} half, data directory: ${dir} (${source})\n`);

const server = new Server(
  { name: mode === "private" ? "tend-private" : "tend", version: "0.0.3" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolManifest() }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = callTool(store, request.params.name, request.params.arguments, Date.now());
  const failed = Boolean(result && typeof result === "object" && "error" in result);

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: failed
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[tend] ready\n");
