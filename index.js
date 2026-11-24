#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const server = createServer();
const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (entry === import.meta.url) {
  await server.connect(new StdioServerTransport());
}
