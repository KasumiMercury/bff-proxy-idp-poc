import { type NextRequest, NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
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
  const response = new NextResponse(null, { status: 204 });
  applyCors(response);
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

interface RouteContext {
  params: Promise<{
    path?: string[];
  }>;
}

async function proxy(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { issuer } = getConfig();
  const issuerUrl = new URL(issuer);
  const params = await context.params;
  const path = normalizePath(params?.path);
  const upstreamUrl = new URL(path, issuerUrl);
  upstreamUrl.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.set("host", issuerUrl.host);
  headers.delete("content-length");
  headers.delete("connection");
  headers.delete("accept-encoding");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (!BODYLESS_METHODS.has(request.method) && request.body) {
    init.body = request.body as unknown as BodyInit;
    // @ts-expect-error Node.js streaming requires duplex
    init.duplex = "half";
  }

  const upstream = await fetch(upstreamUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  applyCorsHeaders(responseHeaders);

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });

  const setCookie = upstream.headers.getSetCookie?.();
  if (setCookie && setCookie.length > 0) {
    response.headers.delete("set-cookie");
    for (const cookie of setCookie) {
      response.headers.append("set-cookie", cookie);
    }
  }

  return response;
}

function normalizePath(segments: string[] | undefined): string {
  if (!segments || segments.length === 0) {
    return "/";
  }
  const joined = segments.join("/");
  return joined.startsWith("/") ? joined : `/${joined}`;
}

function applyCors(response: NextResponse): void {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Allow-Methods",
    ALLOWED_METHODS.join(", "),
  );
}

function applyCorsHeaders(headers: Headers): void {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Type, Location, WWW-Authenticate",
  );
}
