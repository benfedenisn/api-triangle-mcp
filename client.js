const DEFAULT_BASE_URL = "https://api-triangle.com";
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;
const QUOTE_TIMEOUT_MS = 20_000;
const PAID_TIMEOUT_MS = 25_000;

export function resolveBaseUrl(env = process.env) {
  const raw = String(env.API_TRIANGLE_BASE_URL || DEFAULT_BASE_URL).trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("API_TRIANGLE_BASE_URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API_TRIANGLE_BASE_URL must use http or https");
  }
  return raw.replace(/\/$/, "");
}

export function leadUrl(baseUrl, path, args) {
  const url = new URL(path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(args || {})) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

export function credentialState(env = process.env) {
  const apiKey = String(env.API_TRIANGLE_API_KEY || "").trim();
  const privateKey = String(env.X402_PRIVATE_KEY || "").trim();
  return { apiKey, privateKey, configured: Boolean(apiKey || privateKey) };
}

export function normalizePrivateKey(value) {
  const key = String(value || "").trim();
  if (!key) return "";
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  if (!PRIVATE_KEY.test(normalized)) {
    const error = new Error("X402_PRIVATE_KEY must be a 32-byte hex private key");
    error.code = "invalid_key";
    throw error;
  }
  return normalized;
}

export function missingCredentialText() {
  return "Paid call needs X402_PRIVATE_KEY (Base wallet hex key) or API_TRIANGLE_API_KEY (subscription key sent as X-API-Key). quote_triangle_leads is free and does not need either.";
}

export async function callApi({ url, paid = false, env = process.env, fetchImpl = fetch } = {}) {
  try {
    const credentials = credentialState(env);
    if (paid && !credentials.configured) {
      return unpaidPaidCall(url, fetchImpl);
    }
    const response = paid
      ? await paidFetch(url, credentials, fetchImpl)
      : await fetchImpl(url, requestInit(QUOTE_TIMEOUT_MS));
    return await toolResult(response, { paid, credentials });
  } catch (error) {
    return errorResult(error?.code === "invalid_key" ? error.message : networkMessage(url, error));
  }
}

async function unpaidPaidCall(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, requestInit(QUOTE_TIMEOUT_MS));
    return toolResult(response, { paid: true, credentials: { configured: false } });
  } catch (error) {
    return errorResult(`${missingCredentialText()}\n${networkMessage(url, error)}`);
  }
}

async function paidFetch(url, credentials, fetchImpl) {
  if (credentials.apiKey) {
    const init = requestInit(QUOTE_TIMEOUT_MS);
    init.headers["X-API-Key"] = credentials.apiKey;
    return fetchImpl(url, init);
  }
  const normalized = normalizePrivateKey(credentials.privateKey);
  const { privateKeyToAccount } = await import("viem/accounts");
  const { wrapFetchWithPayment } = await import("x402-fetch");
  const account = privateKeyToAccount(normalized);
  const fetchWithPayment = wrapFetchWithPayment(fetchImpl, account);
  return withTimeout(
    Promise.resolve(fetchWithPayment(url, requestInit(PAID_TIMEOUT_MS))),
    PAID_TIMEOUT_MS,
    url,
  );
}

function requestInit(timeoutMs) {
  return {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  };
}

function withTimeout(promise, timeoutMs, url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`API Triangle request timed out: ${url}`);
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function toolResult(response, { paid, credentials }) {
  const text = await response.text();
  const body = text || `HTTP ${response.status}`;
  if (!response.ok && paid && !credentials.configured && [401, 402, 403].includes(response.status)) {
    return errorResult(`${missingCredentialText()}\nHTTP ${response.status}\n${body}`);
  }
  if (response.status === 402) return errorResult(`402 Payment Required. The x402 payment was not accepted.\n${body}`);
  if (!response.ok) return errorResult(`HTTP ${response.status}\n${body}`);
  return { content: [{ type: "text", text: body }], isError: false };
}

function networkMessage(url, error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return `API Triangle request timed out: ${url}`;
  }
  return `API Triangle request failed: ${error?.message || "unknown error"}`;
}

function errorResult(text) {
  return { content: [{ type: "text", text }], isError: true };
}
