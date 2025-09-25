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

  const proxyPrefix = normalizeProxyPrefix(
    options.proxyPrefix ?? DEFAULT_PROXY_PREFIX,
  );
  const pathSegments = normalizeSegments(options.pathSegments ?? []);
  const proxySegments = splitProxyPrefix(proxyPrefix);
  const remainingSegments = stripLeadingProxySegments(
    pathSegments,
    proxySegments,
  );

  const clientOrigin = request.nextUrl.origin;

  const targetUrl = new URL(upstreamBase.toString());
  targetUrl.pathname = buildTargetPath(
    upstreamBase.pathname,
    remainingSegments,
  );
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
  const contentType = responseHeaders.get("content-type") ?? "";
  const rewrittenLocation = rewriteLocationHeader(
    responseHeaders.get("location"),
    request,
    upstreamBase,
    proxyPrefix,
  );
  if (rewrittenLocation) {
    responseHeaders.set("location", rewrittenLocation);
  }

  let responseBody: BodyInit | null = null;

  if (shouldProcessAsText(contentType)) {
    const originalBody = await response.text();
    const rewrittenBody = rewriteTextContent(
      originalBody,
      contentType,
      upstreamBase,
      proxyPrefix,
      clientOrigin,
    );
    responseHeaders.delete("content-length");
    responseBody = rewrittenBody;
  } else {
    responseBody = response.body;
  }

  return new Response(responseBody ?? undefined, {
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

function normalizeProxyPrefix(prefix: string): string {
  if (!prefix.startsWith("/")) {
    prefix = `/${prefix}`;
  }
  if (prefix.endsWith("/")) {
    return prefix.slice(0, -1);
  }
  return prefix;
}

function shouldProcessAsText(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith("text/") ||
    normalized.includes("json") ||
    normalized.includes("javascript") ||
    normalized.includes("xml")
  );
}

function rewriteTextContent(
  body: string,
  contentType: string,
  upstreamBase: URL,
  proxyPrefix: string,
  clientOrigin: string,
): string {
  let output = rewriteAbsoluteOriginUrls(
    body,
    upstreamBase,
    proxyPrefix,
    clientOrigin,
  );

  if (contentType.toLowerCase().includes("text/html")) {
    output = rewriteHtmlContent(output, proxyPrefix);
  }

  return output;
}

function rewriteHtmlContent(html: string, proxyPrefix: string): string {
  const escapedPrefix = escapeRegExp(proxyPrefix.slice(1));
  const doubleQuotedPattern = new RegExp(
    `(href|src|action)="/(?!(?:${escapedPrefix})(?:/|$))`,
    "gi",
  );
  const singleQuotedPattern = new RegExp(
    `(href|src|action)='/(?!(?:${escapedPrefix})(?:/|$))`,
    "gi",
  );

  const replacement = `$1="${proxyPrefix}/`;
  const replacementSingle = `$1='${proxyPrefix}/`;

  return html
    .replace(doubleQuotedPattern, replacement)
    .replace(singleQuotedPattern, replacementSingle);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteAbsoluteOriginUrls(
  content: string,
  upstreamBase: URL,
  proxyPrefix: string,
  clientOrigin: string,
): string {
  const upstreamOriginPattern = new RegExp(
    `${escapeRegExp(upstreamBase.origin)}`,
    "g",
  );
  const proxyAbsolutePrefix = `${clientOrigin}${proxyPrefix}`;

  return content.replace(upstreamOriginPattern, proxyAbsolutePrefix);
}

function splitProxyPrefix(prefix: string): string[] {
  return prefix.split("/").filter(Boolean);
}

function stripLeadingProxySegments(
  pathSegments: string[],
  proxySegments: string[],
): string[] {
  if (proxySegments.length === 0) {
    return [...pathSegments];
  }

  const remaining = [...pathSegments];
  let offset = 0;

  while (remaining.length - offset >= proxySegments.length) {
    const matches = proxySegments.every(
      (segment, index) => remaining[offset + index] === segment,
    );
    if (!matches) {
      break;
    }
    offset += proxySegments.length;
  }

  return remaining.slice(offset);
}
