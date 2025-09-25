import type { NextRequest } from "next/server";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

type ProxyOptions = {
  pathSegments: string[];
  proxyPrefix: string;
};

const DEFAULT_PROXY_PREFIX = "/api/oidc";

export async function proxyToIdp(
  request: NextRequest,
  options: Partial<ProxyOptions> = {},
): Promise<Response> {
  const upstreamBase = getIdpBaseUrl();

  const proxyPrefix = options.proxyPrefix ?? DEFAULT_PROXY_PREFIX;
  const pathSegments = normalizeSegments(options.pathSegments ?? []);

  const targetUrl = new URL(upstreamBase.toString());
  targetUrl.pathname = buildTargetPath(upstreamBase.pathname, pathSegments);
  targetUrl.search = request.nextUrl.search;

  const headers = buildForwardHeaders(request);

  const hasBody = !(request.method === "GET" || request.method === "HEAD");
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (hasBody) {
    init.body = request.body;
    // @ts-expect-error Node fetch requires duplex when streaming a body
    init.duplex = "half";
  }

  const response = await fetch(targetUrl, init);

  const responseHeaders = new Headers(response.headers);
  const rewrittenLocation = rewriteLocationHeader(
    responseHeaders.get("location"),
    request,
    upstreamBase,
    proxyPrefix,
  );
  if (rewrittenLocation) {
    responseHeaders.set("location", rewrittenLocation);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function getIdpBaseUrl(): URL {
  const value = process.env.IDP_BASE_URL ?? process.env.OIDC_ISSUER_URL;
  if (!value) {
    throw new Error(
      "Missing IDP_BASE_URL (or OIDC_ISSUER_URL) environment variable for proxy",
    );
  }

  try {
    return new URL(value);
  } catch (error) {
    throw new Error(`Invalid IDP_BASE_URL: ${String(error)}`);
  }
}

function normalizeSegments(segments: string[]): string[] {
  return segments.filter((segment) => Boolean(segment?.trim()));
}

function buildTargetPath(basePath: string, segments: string[]): string {
  const baseParts = basePath.split("/").filter(Boolean);
  const combined = [...baseParts, ...segments];
  return `/${combined.join("/")}`;
}

function buildForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }

    if (key.toLowerCase() === "host") {
      continue;
    }

    headers.set(key, value);
  }

  const forwardedHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  if (forwardedHost) {
    headers.set("x-forwarded-host", forwardedHost);
  }

  const forwardedProto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  headers.set("x-forwarded-proto", forwardedProto);

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    headers.set("x-forwarded-for", forwardedFor);
  }

  if (!headers.has("accept")) {
    headers.set("accept", "*/*");
  }

  return headers;
}

function rewriteLocationHeader(
  locationValue: string | null,
  request: NextRequest,
  upstreamBase: URL,
  proxyPrefix: string,
): string | null {
  if (!locationValue) {
    return null;
  }

  let upstreamLocation: URL;
  try {
    upstreamLocation = new URL(
      locationValue,
      appendTrailingSlash(upstreamBase),
    );
  } catch {
    return null;
  }

  if (upstreamLocation.origin !== upstreamBase.origin) {
    return null;
  }

  const proxyUrl = new URL(request.nextUrl.origin);
  proxyUrl.pathname = buildProxyPath(proxyPrefix, upstreamLocation.pathname);
  proxyUrl.search = upstreamLocation.search;
  proxyUrl.hash = upstreamLocation.hash;
  return proxyUrl.toString();
}

function buildProxyPath(prefix: string, upstreamPath: string): string {
  const prefixParts = prefix.split("/").filter(Boolean);
  const upstreamParts = upstreamPath.split("/").filter(Boolean);
  return `/${[...prefixParts, ...upstreamParts].join("/")}`;
}

function appendTrailingSlash(url: URL): URL {
  const clone = new URL(url.toString());
  if (!clone.pathname.endsWith("/")) {
    clone.pathname = `${clone.pathname}/`;
  }
  return clone;
}
