# API Triangle MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server for the api-triangle.com x402 feeds. This repository is the server. The website imports `createServer` from `api-triangle-mcp/server` for its HTTP `/mcp` route and does not start this process.

Tools:

- `quote_triangle_leads` calls free `GET /api/v1/leads/quote`
- `fetch_triangle_leads` calls paid `GET /api/v1/leads`
- `search_triangle_surplus` calls paid `GET /api/v1/surplus`

## Run locally

```bash
npm install
API_TRIANGLE_BASE_URL=http://127.0.0.1:3000 npm start
```

The process speaks MCP over stdin and stdout. Leave `API_TRIANGLE_BASE_URL` unset to use `https://api-triangle.com`.

## Wallet key

Paid tools read `X402_PRIVATE_KEY`, a hex private key for a Base wallet that holds USDC. The tool uses `x402-fetch` to answer the HTTP 402 challenge. The website charges the amount in `X402_AMOUNT_ATOMIC` (6 decimal USDC) to `X402_PAY_TO`. A subscription key in `API_TRIANGLE_API_KEY` is sent as `X-API-Key` instead of a wallet payment.

Do not commit either value. If both are unset, a paid tool still requests the URL and returns an error that includes the 402 body, so the price is visible before you configure a key. `quote_triangle_leads` never needs a key. Network failures and non-2xx responses are tool errors.

## Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` and restart Claude. Replace the path and the key.

```json
{
  "mcpServers": {
    "api-triangle": {
      "command": "node",
      "args": ["/absolute/path/to/api-triangle-mcp/index.js"],
      "env": {
        "API_TRIANGLE_BASE_URL": "https://api-triangle.com",
        "X402_PRIVATE_KEY": "0xYOUR_BASE_PRIVATE_KEY",
        "API_TRIANGLE_API_KEY": ""
      }
    }
  }
}
```

## Cursor

Add the same command to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`) under `mcpServers`. Cursor starts the process when the chat needs the tools. Quote a county and distress first, then fetch the paid page only if the count is worth the USDC.
