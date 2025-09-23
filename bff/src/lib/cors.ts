import { type NextRequest, NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

interface CorsResult {
  allowedOrigin: string | null;
  response?: NextResponse;
}

export function handleCors(
  request: NextRequest,
  allowedMethods: string[],
): CorsResult {
  const { allowedOrigins } = getConfig();
  if (allowedOrigins.length === 0) {
    if (request.method === "OPTIONS") {
      return {
        allowedOrigin: null,
        response: new NextResponse(null, { status: 204 }),
      };
    }
    return { allowedOrigin: null };
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    if (request.method === "OPTIONS") {
      return {
        allowedOrigin: null,
        response: new NextResponse(null, { status: 204 }),
      };
    }
    return { allowedOrigin: null };
  }

  const allowedOrigin = allowedOrigins.includes(origin) ? origin : null;
  if (request.method === "OPTIONS") {
    if (!allowedOrigin) {
      return {
        allowedOrigin: null,
        response: new NextResponse(null, { status: 403 }),
      };
    }
    const response = new NextResponse(null, { status: 204 });
    applyCorsHeaders(response, allowedOrigin, allowedMethods, request);
    return { allowedOrigin, response };
  }

  if (!allowedOrigin) {
    return {
      allowedOrigin: null,
      response: NextResponse.json(
        { error: "origin_not_allowed" },
        { status: 403 },
      ),
    };
  }

  return { allowedOrigin };
}

export function applyCorsHeaders(
  response: NextResponse,
  allowedOrigin: string | null,
  allowedMethods: string[],
  request: NextRequest,
): void {
  if (!allowedOrigin) {
    return;
  }
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Vary", "Origin");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set(
    "Access-Control-Allow-Methods",
    allowedMethods.join(", "),
  );
  const requestedHeaders = request.headers.get(
    "access-control-request-headers",
  );
  if (requestedHeaders) {
    response.headers.set("Access-Control-Allow-Headers", requestedHeaders);
  }
  response.headers.set(
    "Access-Control-Expose-Headers",
    "Content-Type, Location",
  );
}
