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
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { resolveDataDir } from "../domain/paths.js";
import { openStore } from "../storage/store.js";
import { callTool, toolManifest } from "./tools.js";

const { dir, source } = resolveDataDir();

const store = openStore({
  dataDir: dir,
  role: "mcp",
  onWarning: (msg) => {
    // stderr only. A warning on stdout would corrupt the protocol stream.
    process.stderr.write(`[tend] ${msg}\n`);
  }
});

process.stderr.write(`[tend] data directory: ${dir} (${source})\n`);

const server = new Server(
  { name: "tend", version: "0.0.3" },
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
