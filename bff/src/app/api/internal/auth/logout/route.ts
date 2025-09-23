import { type NextRequest, NextResponse } from "next/server";

import {
  clearSessionCookie,
  readSessionCookie,
} from "@/features/auth/server/cookies";
import {
  endSession,
  revokeRefreshToken,
} from "@/features/auth/server/oidc-client";
import {
  deleteSession,
  getSessionFromCookie,
} from "@/features/auth/server/session-store";
import { getAppBaseUrl } from "@/features/auth/server/url";
import { getConfig } from "@/lib/config";
import { applyCorsHeaders, handleCors } from "@/lib/cors";
import { logInfo } from "@/lib/log";

const ALLOWED_METHODS = ["GET", "POST"] as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cors = handleCors(request, [...ALLOWED_METHODS]);
  if (cors.response) {
    return cors.response;
  }
  const response = await performLogout(request);
  applyCorsHeaders(response, cors.allowedOrigin, [...ALLOWED_METHODS], request);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cors = handleCors(request, [...ALLOWED_METHODS]);
  if (cors.response) {
    return cors.response;
  }
  const response = await performLogout(request);
  applyCorsHeaders(response, cors.allowedOrigin, [...ALLOWED_METHODS], request);
  return response;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const cors = handleCors(request, [...ALLOWED_METHODS]);
  return cors.response ?? new NextResponse(null, { status: 204 });
}

async function performLogout(request: NextRequest): Promise<NextResponse> {
  const formData = await readFormData(request);
  const redirectPath = sanitizeReturnPath(
    (formData?.get("returnTo") as string | null) ??
      request.nextUrl.searchParams.get("returnTo"),
  );
  const cookieHeader = request.headers.get("cookie");
  const cookieValue = resolveSessionCookieValue(request, cookieHeader);
  const session = getSessionFromCookie(cookieValue ?? undefined);
  if (session) {
    logInfo("internal-auth/logout", "revoking session", {
      sessionId: session.id,
      subject: session.subject,
    });
    await Promise.allSettled([
      session.tokens.refreshToken
        ? revokeRefreshToken(session.tokens.refreshToken)
        : Promise.resolve(),
      endSession(session.tokens.idToken),
    ]);
    deleteSession(session.id);
  } else {
    logInfo("internal-auth/logout", "no active session to revoke", {
      hasCookie: Boolean(cookieValue),
      cookieHeader,
    });
  }

  const baseUrl = getAppBaseUrl(request);
  const response = NextResponse.redirect(new URL(redirectPath, baseUrl), {
    status: 303,
  });
  clearSessionCookie(response);
  return response;
}

async function readFormData(request: NextRequest): Promise<FormData | null> {
  if (request.method !== "POST") {
    return null;
  }
  try {
    return await request.formData();
  } catch (_error) {
    return null;
  }
}

function resolveSessionCookieValue(
  request: NextRequest,
  cookieHeader: string | null,
): string | null {
  const direct = readSessionCookie(request);
  if (direct) {
    return direct;
  }
  if (!cookieHeader) {
    return null;
  }
  const { sessionCookieName } = getConfig();
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const [name, ...rest] = trimmed.split("=");
    if (name === sessionCookieName) {
      return rest.join("=");
    }
  }
  return null;
}

function sanitizeReturnPath(returnTo: string | null): string {
  if (!returnTo) {
    return "/";
  }
  try {
    const url = new URL(returnTo, "https://example.com");
    if (url.origin !== "https://example.com") {
      return "/";
    }
    return url.pathname + url.search + url.hash;
  } catch (_error) {
    return "/";
  }
}
