import { type NextRequest, NextResponse } from "next/server";

import {
  clearStateCookie,
  readStateCookie,
  setSessionCookie,
} from "@/features/auth/server/cookies";
import {
  exchangeAuthorizationCode,
  fetchUserInfo,
} from "@/features/auth/server/oidc-client";
import { createSession } from "@/features/auth/server/session-store";
import { consumeAuthState } from "@/features/auth/server/state-store";
import { normalizeTokenSet } from "@/features/auth/server/token";
import { getAppBaseUrl } from "@/features/auth/server/url";
import { logError, logInfo } from "@/lib/log";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const error = url.searchParams.get("error");
  const stateParam = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  const stateCookie = readStateCookie(request);

  logInfo("internal-auth/callback", "authorization response received", {
    state: stateParam,
    hasCode: Boolean(code),
    hasError: Boolean(error),
  });

  if (error) {
    return handleAuthError(
      request,
      `IDプロバイダからエラーが返却されました: ${error}`,
    );
  }

  if (!stateParam || !code) {
    return handleAuthError(request, "code または state が欠落しています");
  }

  if (!stateCookie || stateCookie !== stateParam) {
    return handleAuthError(request, "state が一致しません");
  }

  const pending = consumeAuthState(stateParam);
  if (!pending) {
    return handleAuthError(request, "state が無効または期限切れです");
  }

  const baseUrl = getAppBaseUrl(request);
  const redirectUri = `${baseUrl}/api/internal/auth/callback`;

  try {
    const tokenSet = await exchangeAuthorizationCode(
      redirectUri,
      {
        code,
        state: stateParam,
      },
      {
        state: stateParam,
        nonce: pending.nonce,
        codeVerifier: pending.codeVerifier,
      },
    );

    const normalizedTokens = normalizeTokenSet(tokenSet);

    let userInfo: Record<string, unknown> | undefined;
    try {
      userInfo = await fetchUserInfo(normalizedTokens.accessToken);
    } catch (_error) {
      logError("internal-auth/callback", "failed to fetch user info", {
        state: stateParam,
      });
      userInfo = undefined;
    }

    const claims = tokenSet.claims();
    const subject =
      claims && true ? claims.sub : undefined;

    const { id: sessionId, cookieValue } = createSession({
      tokens: normalizedTokens,
      userInfo,
      subject,
    });

    logInfo("internal-auth/callback", "session established", {
      state: stateParam,
      sessionId,
      subject,
      redirectTo: pending.redirectTo,
      userInfoFetched: Boolean(userInfo),
    });

    const response = NextResponse.redirect(
      new URL(pending.redirectTo, baseUrl),
    );
    clearStateCookie(response);
    setSessionCookie(response, cookieValue, request);
    return response;
  } catch (authError) {
    logError("internal-auth/callback", "authorization code exchange failed", {
      state: stateParam,
      error: authError instanceof Error ? authError.message : authError,
    });
    return handleAuthError(
      request,
      authError instanceof Error ? authError.message : "認証処理に失敗しました",
    );
  }
}

function handleAuthError(request: NextRequest, message: string): NextResponse {
  logError("internal-auth/callback", message);
  const baseUrl = getAppBaseUrl(request);
  const url = new URL("/auth/error", baseUrl);
  url.searchParams.set("message", message);
  const response = NextResponse.redirect(url);
  clearStateCookie(response);
  return response;
}
