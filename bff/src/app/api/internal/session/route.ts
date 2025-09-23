import { type NextRequest, NextResponse } from "next/server";

import {
  clearSessionCookie,
  readSessionCookie,
} from "@/features/auth/server/cookies";
import {
  fetchUserInfo,
  refreshTokenSet,
} from "@/features/auth/server/oidc-client";
import {
  deleteSession,
  getSessionFromCookie,
  updateSessionTokens,
  updateSessionUserInfo,
} from "@/features/auth/server/session-store";
import { normalizeTokenSet } from "@/features/auth/server/token";
import { applyCorsHeaders, handleCors } from "@/lib/cors";
import { logError, logInfo } from "@/lib/log";

const REFRESH_SKEW_MS = 30_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cors = handleCors(request, ["GET"]);
  if (cors.response) {
    return cors.response;
  }

  const cookieValue = readSessionCookie(request);
  const existingSession = getSessionFromCookie(cookieValue);
  if (!existingSession) {
    logInfo("internal-auth/session", "session lookup failed", {
      hasCookie: Boolean(cookieValue),
    });
    return unauthorizedResponse(
      request,
      cors.allowedOrigin,
      "missing_or_invalid_session",
    );
  }

  let session = existingSession;
  const expiresAt = session.tokens.expiresAt;
  const shouldRefresh =
    typeof expiresAt === "number" &&
    expiresAt - Date.now() < REFRESH_SKEW_MS &&
    session.tokens.refreshToken;

  if (shouldRefresh && session.tokens.refreshToken) {
    try {
      const refreshed = await refreshTokenSet(session.tokens.refreshToken);
      const normalized = normalizeTokenSet(refreshed);
      const updated = updateSessionTokens(session.id, normalized);
      if (updated) {
        session = updated;
      }
      logInfo("internal-auth/session", "refresh token exchange completed", {
        sessionId: session.id,
        refreshed: Boolean(updated),
      });
    } catch (_error) {
      logError("internal-auth/session", "refresh token exchange failed", {
        sessionId: session.id,
      });
      deleteSession(session.id);
      return unauthorizedResponse(
        request,
        cors.allowedOrigin,
        "refresh_failed",
      );
    }
  }

  if (session.tokens.expiresAt && session.tokens.expiresAt <= Date.now()) {
    logInfo("internal-auth/session", "access token expired", {
      sessionId: session.id,
    });
    deleteSession(session.id);
    return unauthorizedResponse(
      request,
      cors.allowedOrigin,
      "access_token_expired",
    );
  }

  let userInfo = session.userInfo;
  if (!userInfo) {
    try {
      userInfo = await fetchUserInfo(session.tokens.accessToken);
      const updated = updateSessionUserInfo(session.id, userInfo);
      if (updated) {
        session = updated;
      }
    } catch (_error) {
      logError("internal-auth/session", "failed to fetch user info", {
        sessionId: session.id,
      });
      // userinfo が取得できない場合はそのまま継続
    }
  }

  const body = {
    authenticated: true,
    user: buildUserPayload(userInfo, session.subject),
    session: {
      expiresAt: new Date(session.expiresAt).toISOString(),
      accessTokenExpiresAt: session.tokens.expiresAt
        ? new Date(session.tokens.expiresAt).toISOString()
        : undefined,
    },
  };

  const response = NextResponse.json(body);
  applyCorsHeaders(response, cors.allowedOrigin, ["GET"], request);
  logInfo("internal-auth/session", "session resolved", {
    sessionId: session.id,
    subject: session.subject,
    refreshed: session !== existingSession,
    hasUserInfo: Boolean(session.userInfo),
  });
  return response;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const cors = handleCors(request, ["GET"]);
  return cors.response ?? new NextResponse(null, { status: 204 });
}

function buildUserPayload(
  userInfo: Record<string, unknown> | undefined,
  subject: string | undefined,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (subject) {
    payload.sub = subject;
  }

  if (!userInfo) {
    return payload;
  }

  const optionalKeys: Array<keyof typeof userInfo> = [
    "name",
    "given_name",
    "family_name",
    "preferred_username",
    "email",
    "email_verified",
  ];

  for (const key of optionalKeys) {
    const value = userInfo[key];
    if (value !== undefined) {
      payload[key as string] = value;
    }
  }

  return payload;
}

function unauthorizedResponse(
  request: NextRequest,
  allowedOrigin: string | null,
  reason: string,
): NextResponse {
  const response = NextResponse.json({ authenticated: false }, { status: 401 });
  clearSessionCookie(response);
  applyCorsHeaders(response, allowedOrigin, ["GET"], request);
  logInfo("internal-auth/session", "responding with unauthorized", { reason });
  return response;
}
