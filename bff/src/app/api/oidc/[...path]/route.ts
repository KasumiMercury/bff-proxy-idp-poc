import { type NextRequest, NextResponse } from "next/server";

import { getAppBaseUrl } from "@/features/auth/server/url";
import { getConfig } from "@/lib/config";

const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const CORS_MAX_AGE = "600";

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxy(request, context);
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxy(request, context);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxy(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxy(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxy(request, context);
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return preflightResponse(request);
}

type RouteParams = {
  path?: string[];
};

interface RouteContext {
  params: RouteParams | Promise<RouteParams>;
}

async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { issuer } = getConfig();
  const params = await Promise.resolve(context.params);
  const targetUrl = buildTargetUrl(issuer, params.path, request.nextUrl.search);

  const headers = new Headers(request.headers);
  headers.set("host", new URL(issuer).host);
  headers.set("origin", new URL(issuer).origin);
  headers.delete("content-length");
  headers.delete("connection");
  headers.delete("accept-encoding");
  headers.delete("cookie");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!BODYLESS_METHODS.has(request.method) && request.body) {
    init.body = request.body as unknown as BodyInit;
    // @ts-expect-error duplex is required when forwarding streamed bodies in Node.js environments
    init.duplex = "half";
  }

  const upstream = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  rewriteLocationHeader(responseHeaders, request.nextUrl, issuer);

  const contentType = upstream.headers.get("content-type") ?? "";
  const shouldRewriteHtml = contentType.includes("text/html");

  let responseBody: BodyInit | null | undefined;
  if (shouldRewriteHtml) {
    const html = await upstream.text();
    responseBody = rewriteHtmlDocument(html, new URL(issuer), request);
  } else {
    responseBody = upstream.body;
  }

  const response = new NextResponse(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  });

  applyCorsHeaders(response);
  return response;
}

function rewriteHtmlDocument(
  html: string,
  issuerUrl: URL,
  request: NextRequest,
): string {
  const baseUrl = getAppBaseUrl(request);
  const proxiedAbsolutePrefix = `${baseUrl}/api/oidc/`;
  const proxiedPathPrefix = "/api/oidc/";
  const escapedOrigin = issuerUrl.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const absolutePattern = new RegExp(
    `((?:href|src|action)=['"])${escapedOrigin}/(?!api/oidc)([^'"]*)`,
    "g",
  );
  const rootPattern = /((?:href|src|action)=['"])\/(?!api\/oidc)([^'"]*)/g;

  return html
    .replace(
      absolutePattern,
      (_match, prefix: string, rest: string) =>
        `${prefix}${proxiedAbsolutePrefix}${rest}`,
    )
    .replace(
      rootPattern,
      (_match, prefix: string, rest: string) =>
        `${prefix}${proxiedPathPrefix}${rest}`,
    );
}

function buildTargetUrl(
  issuer: string,
  segments: string[] | undefined,
  search: string,
): string {
  const base = issuer.endsWith("/") ? issuer : `${issuer}/`;
  const path = segments && segments.length > 0 ? segments.join("/") : "";
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, base);
  url.search = search;
  return url.toString();
}

function rewriteLocationHeader(
  headers: Headers,
  requestUrl: URL,
  issuer: string,
): void {
  const location = headers.get("location");
  if (!location) {
    return;
  }

  const issuerUrl = new URL(issuer);
  const requestOrigin = requestUrl.origin;

  const resolvedAgainstIssuer = safeResolveUrl(location, issuerUrl.toString());
  const resolvedAgainstRequest = safeResolveUrl(
    location,
    requestUrl.toString(),
  );

  const candidate = selectRewriteCandidate(
    resolvedAgainstIssuer,
    resolvedAgainstRequest,
    issuerUrl.origin,
    requestOrigin,
  );

  if (!candidate) {
    return;
  }

  const proxiedPath = candidate.pathname.startsWith("/")
    ? candidate.pathname
    : `/${candidate.pathname}`;

  if (proxiedPath.startsWith("/api/oidc")) {
    return;
  }

  const rebuilt = new URL(requestUrl.toString());
  rebuilt.pathname = normalizeProxiedPath(`/api/oidc${proxiedPath}`);
  rebuilt.search = candidate.search;
  rebuilt.hash = candidate.hash;

  headers.set("location", rebuilt.toString());
}

function normalizeProxiedPath(pathname: string): string {
  return pathname.replace(/\/{2,}/g, "/");
}

function safeResolveUrl(value: string, base: string): URL | null {
  try {
    return new URL(value, base);
  } catch (_error) {
    return null;
  }
}

function selectRewriteCandidate(
  issuerResolved: URL | null,
  requestResolved: URL | null,
  issuerOrigin: string,
  requestOrigin: string,
): URL | null {
  if (issuerResolved && issuerResolved.origin === issuerOrigin) {
    return issuerResolved;
  }

  if (requestResolved && requestResolved.origin === requestOrigin) {
    return requestResolved;
  }

  return null;
}

function preflightResponse(request: NextRequest): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Allow-Methods",
    ALLOWED_METHODS.join(", "),
  );
  const requestedHeaders = request.headers.get(
    "access-control-request-headers",
  );
  if (requestedHeaders) {
    response.headers.set("Access-Control-Allow-Headers", requestedHeaders);
  } else {
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
  }
  response.headers.set("Access-Control-Max-Age", CORS_MAX_AGE);
  return response;
}

function applyCorsHeaders(response: NextResponse): void {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Expose-Headers",
    "Content-Type, Location, WWW-Authenticate",
  );
}
