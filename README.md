# API Triangle MCP

A local [Model Context Protocol](https://modelcontextprotocol.io) server for the api-triangle.com x402 feeds. It is not imported by the website process and is not started by `npm start` in the repository root.

Tools:

- `quote_triangle_leads` calls free `GET /api/v1/leads/quote`
- `fetch_triangle_leads` calls paid `GET /api/v1/leads`
- `search_triangle_surplus` calls paid `GET /api/v1/surplus`

## Run locally

```bash
cd mcp
npm install
API_TRIANGLE_BASE_URL=http://127.0.0.1:3000 npm start
```

The process speaks MCP over stdin and stdout. Leave `API_TRIANGLE_BASE_URL` unset to use `https://api-triangle.com`.

## Wallet key

Paid tools read `X402_PRIVATE_KEY`, a hex private key for a Base wallet that holds USDC. The tool uses `x402-fetch` to answer the HTTP 402 challenge. The website charges the amount in `X402_AMOUNT_ATOMIC` (6 decimal USDC) to `X402_PAY_TO`.

Do not commit the key. If the variable is unset, `fetch_triangle_leads` and `search_triangle_surplus` return the 402 body so you can see the price and wallet before paying. `quote_triangle_leads` never needs the key.

## Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` and restart Claude. Replace the path and the key.

```json
{
  "mcpServers": {
    "api-triangle": {
      "command": "node",
      "args": ["/absolute/path/to/api-triangle/mcp/index.js"],
      "env": {
        "API_TRIANGLE_BASE_URL": "https://api-triangle.com",
        "X402_PRIVATE_KEY": "0xYOUR_BASE_PRIVATE_KEY"
      }
    }
  }
}
```

## Cursor

Add the same command to `~/.cursor/mcp.json` (or the project `.cursor/mcp.json`) under `mcpServers`. Cursor starts the process when the chat needs the tools. Quote a county and distress first, then fetch the paid page only if the count is worth the USDC.
