import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const baseUrl = (process.env.API_TRIANGLE_BASE_URL || "https://api-triangle.com").replace(/\/$/, "");

const leadShape = {
  county: z.enum(["wake", "durham", "orange"]).optional().describe("Triangle county. Omit for Wake, Durham, and Orange together."),
  distress: z.enum(["stacked", "tax_lien", "absentee"]).optional().describe("stacked is an absentee owner with an active tax lien. tax_lien and absentee include stacked rows."),
  min_lien: z.number().positive().optional().describe("Minimum tax delinquency in dollars."),
  out_of_state: z.boolean().optional().describe("Keep owners whose mailing state is outside North Carolina."),
  new_this_week: z.boolean().optional().describe("Rows first stored in the last 7 days, or whose lien changed in that window."),
  limit: z.number().int().min(1).max(200).optional().describe("Paid page size. The quote count ignores this."),
};

const server = new McpServer({
  name: "api-triangle",
  version: "0.1.0",
});

server.tool(
  "quote_triangle_leads",
  "Count matching Wake, Durham, and Orange off-market leads and return the x402 USDC price. Free. Does not return owner names or property addresses.",
  leadShape,
  async (args) => toolResult(await fetch(leadUrl("/api/v1/leads/quote", args))),
);

server.tool(
  "fetch_triangle_leads",
  "Fetch paid off-market leads. Uses X402_PRIVATE_KEY to pay the x402 challenge on Base. Without that key the tool returns the 402 payment requirements.",
  leadShape,
  async (args) => toolResult(await paidFetch(leadUrl("/api/v1/leads", args))),
);

server.tool(
  "search_triangle_surplus",
  "Search Triangle municipal surplus auctions. Uses X402_PRIVATE_KEY when the endpoint returns 402.",
  {
    q: z.string().optional().describe("Title or seller text."),
    category: z.enum(["Vehicles", "Heavy Equipment", "Tools", "Building Materials", "Land", "IT", "Other"]).optional(),
    place: z.string().optional().describe("Place slug such as wake, durham, orange, or raleigh."),
    limit: z.number().int().min(1).max(100).optional(),
  },
  async (args) => toolResult(await paidFetch(leadUrl("/api/v1/surplus", args))),
);

function leadUrl(path, args) {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(args || {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function paidFetch(url) {
  const key = String(process.env.X402_PRIVATE_KEY || "").trim();
  if (!key) return fetch(url);
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  const { privateKeyToAccount } = await import("viem/accounts");
  const { wrapFetchWithPayment } = await import("x402-fetch");
  const account = privateKeyToAccount(normalized);
  const fetchWithPayment = wrapFetchWithPayment(fetch, account);
  return fetchWithPayment(url);
}

async function toolResult(response) {
  const text = await response.text();
  const body = text || `HTTP ${response.status}`;
  return {
    content: [{ type: "text", text: response.status === 402 ? `402 Payment Required\n${body}` : body }],
    isError: response.status >= 500,
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
