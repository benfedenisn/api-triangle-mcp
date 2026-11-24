import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi, leadUrl, resolveBaseUrl } from "./client.js";

const leadShape = {
  county: z.enum(["wake", "durham", "orange"]).optional().describe("One Triangle county. Omit to search Wake, Durham, and Orange together."),
  distress: z.enum(["stacked", "tax_lien", "absentee"]).optional().describe("stacked means an absentee owner with an active tax lien. tax_lien and absentee each include stacked rows. Omit for either signal."),
  min_lien: z.number().positive().optional().describe("Minimum tax delinquency in dollars. The quote count and the paid page both honor this."),
  out_of_state: z.boolean().optional().describe("Keep owners whose mailing state is outside North Carolina."),
  new_this_week: z.boolean().optional().describe("Rows first stored in the last 7 days, or whose lien amount changed in that window."),
  limit: z.number().int().min(1).max(200).optional().describe("Paid page size, from 1 to 200. quote_triangle_leads ignores it when counting matches."),
};

const surplusShape = {
  q: z.string().max(120).optional().describe("Title or seller text, up to 120 characters."),
  category: z.enum(["Vehicles", "Heavy Equipment", "Tools", "Building Materials", "Land", "IT", "Other"]).optional().describe("Listing category. Land also matches land-like titles stored as Other."),
  place: z.enum([
    "wake", "durham", "orange", "raleigh", "cary", "apex", "holly_springs", "garner",
    "wake_forest", "morrisville", "chapel_hill", "carrboro", "hillsborough",
  ]).optional().describe("City or county slug. Omit to search the whole radius."),
  radius: z.number().min(5).max(320).optional().describe("Miles from downtown Raleigh. Omit for the default wide radius."),
  window: z.enum(["today", "week", "new"]).optional().describe("today and week filter by close time. new means first stored in the last 7 days."),
  sources: z.string().max(80).optional().describe("Comma-separated source ids: govdeals, publicsurplus, nc_state."),
  min_bid: z.number().nonnegative().optional().describe("Minimum current bid in dollars."),
  max_bid: z.number().nonnegative().optional().describe("Maximum current bid in dollars."),
  limit: z.number().int().min(1).max(500).optional().describe("Page size, from 1 to 500."),
};

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const paidRead = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export function createServer({ env = process.env, fetchImpl = fetch } = {}) {
  const server = new McpServer(
    { name: "api-triangle", version: "0.1.0" },
    { capabilities: { resources: {} } },
  );

  server.registerTool("quote_triangle_leads", {
    title: "Quote Triangle leads",
    description: "Count matching Wake, Durham, and Orange off-market leads and return the x402 USDC price. Free, and it does not return owner names or property addresses. Call this before fetch_triangle_leads. Do not call it when you need the lead rows themselves.",
    inputSchema: leadShape,
    annotations: { title: "Quote Triangle leads", ...readOnly },
  }, async (args) => endpoint(env, fetchImpl, "/api/v1/leads/quote", args, false));

  server.registerTool("fetch_triangle_leads", {
    title: "Fetch Triangle leads",
    description: "Return owner names and property addresses for the same filters as quote_triangle_leads. Each call spends USDC on Base when X402_PRIVATE_KEY is set, or uses API_TRIANGLE_API_KEY as X-API-Key. Call quote_triangle_leads first. Do not call this only to check a count or a price.",
    inputSchema: leadShape,
    annotations: { title: "Fetch Triangle leads", ...paidRead },
  }, async (args) => endpoint(env, fetchImpl, "/api/v1/leads", args, true));

  server.registerTool("search_triangle_surplus", {
    title: "Search Triangle surplus",
    description: "Search GovDeals, PublicSurplus, and NC State Surplus auctions around the Triangle. Payment works the same way as fetch_triangle_leads. Use this for auction lots, not for off-market property leads. Use quote_triangle_leads only for those leads.",
    inputSchema: surplusShape,
    annotations: { title: "Search Triangle surplus", ...paidRead },
  }, async (args) => endpoint(env, fetchImpl, "/api/v1/surplus", args, true));

  return server;
}

async function endpoint(env, fetchImpl, path, args, paid) {
  let baseUrl;
  try {
    baseUrl = resolveBaseUrl(env);
  } catch (error) {
    return { content: [{ type: "text", text: error.message }], isError: true };
  }
  return callApi({ url: leadUrl(baseUrl, path, args), paid, env, fetchImpl });
}

export async function connectMemoryClient(server) {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "api-triangle-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}
