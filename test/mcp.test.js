import assert from "node:assert/strict";
import test from "node:test";
import { callApi, leadUrl, normalizePrivateKey, resolveBaseUrl } from "../client.js";
import { connectMemoryClient, createServer } from "../server.js";

test("lead urls keep only set filters", () => {
  const url = leadUrl("https://api-triangle.com", "/api/v1/leads/quote", {
    county: "wake",
    distress: "stacked",
    min_lien: 1000,
    out_of_state: false,
    q: "",
    place: null,
  });
  assert.equal(url.href, "https://api-triangle.com/api/v1/leads/quote?county=wake&distress=stacked&min_lien=1000&out_of_state=false");
  assert.equal(resolveBaseUrl({ API_TRIANGLE_BASE_URL: "http://127.0.0.1:3000/" }), "http://127.0.0.1:3000");
  assert.throws(() => resolveBaseUrl({ API_TRIANGLE_BASE_URL: "not a url" }), /valid URL/);
  assert.equal(normalizePrivateKey(""), "");
});

test("a private key must be 32 bytes of hex", () => {
  assert.throws(() => normalizePrivateKey("0x1234"), /32-byte/);
  assert.equal(normalizePrivateKey(`0x${"ab".repeat(32)}`), `0x${"ab".repeat(32)}`);
});

test("a quote reports timeouts and failed responses", async () => {
  const timeout = await callApi({
    url: new URL("https://api-triangle.test/api/v1/leads/quote"),
    fetchImpl: () => {
      const error = new Error("The operation was aborted");
      error.name = "TimeoutError";
      throw error;
    },
  });
  assert.equal(timeout.isError, true);
  assert.match(timeout.content[0].text, /timed out/);

  const failed = await callApi({
    url: new URL("https://api-triangle.test/api/v1/leads/quote"),
    fetchImpl: async () => new Response("nope", { status: 503 }),
  });
  assert.equal(failed.isError, true);
  assert.match(failed.content[0].text, /HTTP 503/);
});

test("a paid call without credentials returns the payment error", async () => {
  const result = await callApi({
    url: new URL("https://api-triangle.test/api/v1/leads"),
    paid: true,
    env: {},
    fetchImpl: async () => new Response(JSON.stringify({ accepts: [{ amount: "5000" }] }), { status: 402 }),
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /X402_PRIVATE_KEY/);
  assert.match(result.content[0].text, /5000/);
});

test("a subscription key is sent and a bad key is refused before the network", async () => {
  let headers;
  const paid = await callApi({
    url: new URL("https://api-triangle.test/api/v1/surplus"),
    paid: true,
    env: { API_TRIANGLE_API_KEY: "at_test" },
    fetchImpl: async (_url, init) => {
      headers = init.headers;
      return new Response("[]", { status: 200 });
    },
  });
  assert.equal(paid.isError, false);
  assert.equal(headers["X-API-Key"], "at_test");

  const invalid = await callApi({
    url: new URL("https://api-triangle.test/api/v1/leads"),
    paid: true,
    env: { X402_PRIVATE_KEY: "0x1234" },
    fetchImpl: () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(invalid.isError, true);
  assert.match(invalid.content[0].text, /32-byte/);
});

test("tool definitions name their inputs and separate quote from fetch", async () => {
  const server = createServer({
    env: { API_TRIANGLE_BASE_URL: "https://api-triangle.test" },
    fetchImpl: async () => new Response(JSON.stringify({ matching_records: 3, price_usdc: "0.005" }), { status: 200 }),
  });
  const client = await connectMemoryClient(server);
  try {
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    assert.deepEqual(names, ["quote_triangle_leads", "fetch_triangle_leads", "search_triangle_surplus"]);
    for (const tool of listed.tools) {
      assert.ok(tool.description.length > 40);
      assert.equal(tool.annotations.openWorldHint, true);
      for (const schema of Object.values(tool.inputSchema.properties)) {
        assert.equal(typeof schema.description, "string");
        assert.ok(schema.description.length > 0);
      }
    }
    const quote = listed.tools[0];
    const fetchTool = listed.tools[1];
    assert.equal(quote.annotations.readOnlyHint, true);
    assert.equal(fetchTool.annotations.readOnlyHint, false);
    assert.match(quote.description, /fetch_triangle_leads/);
    assert.match(fetchTool.description, /quote_triangle_leads/);
    const result = await client.callTool({ name: "quote_triangle_leads", arguments: { county: "wake", distress: "stacked" } });
    assert.equal(result.isError, false);
    assert.match(result.content[0].text, /matching_records/);
  } finally {
    await client.close();
    await server.close();
  }
});
