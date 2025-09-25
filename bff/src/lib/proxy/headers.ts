import type { NextRequest } from "next/server";
import type { HeaderProcessingOptions } from "./types";

const DEFAULT_HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export function buildForwardHeaders(
  request: NextRequest,
  options: HeaderProcessingOptions,
): Headers {
  const headers = new Headers();

  const hopByHopHeaders = new Set([
    ...DEFAULT_HOP_BY_HOP_HEADERS,
    ...options.customHopByHopHeaders.map((h) => h.toLowerCase()),
  ]);

  // Copy request headers with filtering
  for (const [key, value] of request.headers.entries()) {
    const lowerKey = key.toLowerCase();

    // Skip hop-by-hop headers if filtering is enabled
    if (options.enableHopByHopFiltering && hopByHopHeaders.has(lowerKey)) {
      continue;
    }

    // Skip host header (will be set by fetch)
    if (lowerKey === "host") {
      continue;
    }

    // Skip headers marked for removal
    if (
      options.removeHeaders.includes(key) ||
      options.removeHeaders.includes(lowerKey)
    ) {
      continue;
    }

    headers.set(key, value);
  }

  // Handle forwarded headers based on policy
  if (options.enableForwardedHeaders) {
    handleForwardedHeaders(request, headers, options.forwardedHeadersPolicy);
  }

  // Add custom headers
  for (const [key, value] of Object.entries(options.customHeaders)) {
    headers.set(key, value);
  }

  // Ensure accept header exists
  if (!headers.has("accept")) {
    headers.set("accept", "*/*");
  }

  return headers;
}

function handleForwardedHeaders(
  request: NextRequest,
  headers: Headers,
  policy: "preserve" | "override" | "append",
) {
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;

  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");

  const forwardedFor = request.headers.get("x-forwarded-for");

  switch (policy) {
    case "preserve":
      // Only set if not already present
      if (host && !headers.has("x-forwarded-host")) {
        headers.set("x-forwarded-host", host);
      }
      if (proto && !headers.has("x-forwarded-proto")) {
        headers.set("x-forwarded-proto", proto);
      }
      if (forwardedFor && !headers.has("x-forwarded-for")) {
        headers.set("x-forwarded-for", forwardedFor);
      }
      break;

    case "append":
      if (host) {
        const existing = headers.get("x-forwarded-host");
        headers.set(
          "x-forwarded-host",
          existing ? `${existing}, ${host}` : host,
        );
      }
      if (proto) {
        const existing = headers.get("x-forwarded-proto");
        headers.set(
          "x-forwarded-proto",
          existing ? `${existing}, ${proto}` : proto,
        );
      }
      if (forwardedFor) {
        const existing = headers.get("x-forwarded-for");
        headers.set(
          "x-forwarded-for",
          existing ? `${existing}, ${forwardedFor}` : forwardedFor,
        );
      }
      break;

    default:
      // Always override
      if (host) {
        headers.set("x-forwarded-host", host);
      }
      if (proto) {
        headers.set("x-forwarded-proto", proto);
      }
      if (forwardedFor) {
        headers.set("x-forwarded-for", forwardedFor);
      }
      break;
  }
}
