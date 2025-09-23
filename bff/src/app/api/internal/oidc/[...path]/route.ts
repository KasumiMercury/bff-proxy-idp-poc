import { type NextRequest, NextResponse } from "next/server";

import { getAppBaseUrl } from "@/features/auth/server/url";
import { getConfig } from "@/lib/config";

const BODYLESS_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxyRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxyRequest(request, context);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxyRequest(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxyRequest(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxyRequest(request, context);
}

export async function OPTIONS(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxyRequest(request, context);
}

interface RouteContext {
  params: Promise<{
    path?: string[];
  }>;
}

async function proxyRequest(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { issuer } = getConfig();
  const issuerUrl = new URL(issuer);
  const params = await context.params;
  const targetPath = normalizeTargetPath(params?.path);
  const issuerBase = issuer.endsWith("/") ? issuer : `${issuer}/`;
  const targetUrl = new URL(targetPath, issuerBase);
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.set("host", issuerUrl.host);
  if (headers.has("origin")) {
    headers.set("origin", issuerUrl.origin);
  }
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!BODYLESS_METHODS.has(request.method) && request.body) {
    init.body = request.body as unknown as BodyInit;
    // @ts-expect-error: duplex is required when streaming the request body in Node.js
    init.duplex = "half";
  }

  const upstreamResponse = await fetch(targetUrl, init);
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("content-length");

  const rewrittenLocation = rewriteLocationHeader(
    responseHeaders.get("location"),
    request,
    issuerUrl,
  );
  if (rewrittenLocation) {
    responseHeaders.set("location", rewrittenLocation);
  }

  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  const shouldRewriteHtml = contentType.includes("text/html");

  let responseBody: BodyInit | null | undefined;
  if (shouldRewriteHtml) {
    const html = await upstreamResponse.text();
    responseBody = rewriteHtmlDocument(html, issuerUrl, request);
  } else {
    responseBody = upstreamResponse.body;
  }

  const response = new NextResponse(responseBody, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });

  const setCookie = upstreamResponse.headers.getSetCookie?.();
  if (setCookie && setCookie.length > 0) {
    response.headers.delete("set-cookie");
    for (const value of setCookie) {
      response.headers.append("set-cookie", value);
    }
  }

  return response;
}

function normalizeTargetPath(segments: string[] | undefined): string {
  if (!segments || segments.length === 0) {
    return "/";
  }
  const joined = segments.join("/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function rewriteLocationHeader(
  location: string | null,
  request: NextRequest,
  issuerUrl: URL,
): string | null {
  if (!location) {
    return null;
  }

  try {
    const target = new URL(location, issuerUrl);
    if (target.origin !== issuerUrl.origin) {
      return location;
    }

    const baseUrl = getAppBaseUrl(request);
    const proxiedPath = target.pathname.startsWith("/")
      ? target.pathname
      : `/${target.pathname}`;
    return `${baseUrl}/api/internal/oidc${proxiedPath}${target.search}${target.hash}`;
  } catch (_error) {
    return location;
  }
}

function rewriteHtmlDocument(
  html: string,
  issuerUrl: URL,
  request: NextRequest,
): string {
  const baseUrl = getAppBaseUrl(request);
  const proxiedAbsolutePrefix = `${baseUrl}/api/internal/oidc/`;
  const proxiedPathPrefix = "/api/internal/oidc/";
  const escapedOrigin = issuerUrl.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const absolutePattern = new RegExp(
    `((?:href|src|action)=['"])${escapedOrigin}/(?!api/internal/oidc)([^'"]*)`,
    "g",
  );
  const rootPattern =
    /((?:href|src|action)=['"])\/(?!api\/internal\/oidc)([^'"]*)/g;

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
