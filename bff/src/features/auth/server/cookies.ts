import type { NextRequest, NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

const SECURE_PROTOCOL = "https";

export function setStateCookie(
  response: NextResponse,
  value: string,
  request: NextRequest,
): void {
  const { stateCookieName, stateTtlSeconds, cookieSameSite } = getConfig();
  response.cookies.set(stateCookieName, value, {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: useSecureCookie(cookieSameSite, request),
    path: "/",
    maxAge: stateTtlSeconds,
  });
}

export function clearStateCookie(response: NextResponse): void {
  const { stateCookieName, cookieSameSite } = getConfig();
  response.cookies.set(stateCookieName, "", {
    httpOnly: true,
    sameSite: cookieSameSite,
    path: "/",
    maxAge: 0,
  });
}

export function setSessionCookie(
  response: NextResponse,
  value: string,
  request: NextRequest,
): void {
  const { sessionCookieName, sessionTtlSeconds, cookieSameSite } = getConfig();
  response.cookies.set(sessionCookieName, value, {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: useSecureCookie(cookieSameSite, request),
    path: "/",
    maxAge: sessionTtlSeconds,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  const { sessionCookieName, cookieSameSite } = getConfig();
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: cookieSameSite,
    path: "/",
    maxAge: 0,
  });
}

export function readStateCookie(request: NextRequest): string | undefined {
  const { stateCookieName } = getConfig();
  return request.cookies.get(stateCookieName)?.value;
}

export function readSessionCookie(request: NextRequest): string | undefined {
  const { sessionCookieName } = getConfig();
  return request.cookies.get(sessionCookieName)?.value;
}

function isSecureRequest(request: NextRequest): boolean {
  const { trustProxyHeaders } = getConfig();
  if (trustProxyHeaders) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedProto) {
      const first = forwardedProto.split(",")[0]?.trim();
      if (first) {
        return first === SECURE_PROTOCOL;
      }
    }
  }
  const protocol = request.nextUrl.protocol.replace(/:$/, "");
  return protocol === SECURE_PROTOCOL;
}

function useSecureCookie(
  sameSite: "lax" | "strict" | "none",
  request: NextRequest,
): boolean {
  if (sameSite === "none") {
    return true;
  }
  return isSecureRequest(request);
}
