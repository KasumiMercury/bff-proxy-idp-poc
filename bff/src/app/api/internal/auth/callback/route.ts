import { type NextRequest, NextResponse } from "next/server";
import { decodeSignedCookie, encodeSignedCookie } from "@/lib/auth/cookies";
import {
  getCookieSameSite,
  getSessionSecret,
  getSessionTtlSeconds,
  getStateTtlSeconds,
  isSecureCookies,
} from "@/lib/auth/env";
import { exchangeCode, getOidcConfiguration } from "@/lib/auth/oidc";
import type { LoginStatePayload, TokenCookiePayload } from "@/lib/auth/types";

const LOGIN_STATE_COOKIE = "bff_login_state";
const SESSION_COOKIE = "bff_session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = getSessionSecret();
  const loginCookie = request.cookies.get(LOGIN_STATE_COOKIE)?.value;
  const parsed = decodeSignedCookie<LoginStatePayload>(loginCookie, secret);

  if (!parsed) {
    return NextResponse.json({ error: "invalid_login_state" }, { status: 400 });
  }

  const stateTtlMillis = getStateTtlSeconds() * 1000;
  if (Date.now() - parsed.issuedAt > stateTtlMillis) {
    return NextResponse.json({ error: "login_state_expired" }, { status: 400 });
  }

  const url = request.nextUrl;
  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (!returnedState || !code || returnedState !== parsed.payload.state) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  try {
    const configuration = await getOidcConfiguration();
    const currentUrl = new URL(request.url);
    const tokenResponse = await exchangeCode(configuration, currentUrl, {
      codeVerifier: parsed.payload.codeVerifier,
      state: parsed.payload.state,
      nonce: parsed.payload.nonce,
    });

    const accessToken = tokenResponse.access_token;
    if (!accessToken) {
      return NextResponse.json(
        { error: "missing_access_token" },
        { status: 502 },
      );
    }

    const expiresAt = resolveExpiry(tokenResponse);

    const tokenPayload: TokenCookiePayload = {
      accessToken,
      refreshToken: tokenResponse.refresh_token,
      idToken: tokenResponse.id_token,
      scope: tokenResponse.scope,
      tokenType: tokenResponse.token_type,
      expiresAt,
    };

    const sessionCookie = encodeSignedCookie<TokenCookiePayload>(
      {
        payload: tokenPayload,
        issuedAt: Date.now(),
      },
      secret,
    );

    const redirectUrl = new URL(
      parsed.payload.returnTo,
      request.nextUrl.origin,
    );
    const response = NextResponse.redirect(redirectUrl, {
      status: 303,
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: sessionCookie,
      httpOnly: true,
      sameSite: getCookieSameSite(),
      secure: isSecureCookies(),
      path: "/",
      maxAge: getSessionTtlSeconds(),
    });

    response.cookies.delete({ name: LOGIN_STATE_COOKIE, path: "/" });

    return response;
  } catch (error) {
    console.error("Failed to complete OIDC login", error);
    return NextResponse.json({ error: "oidc_login_failed" }, { status: 500 });
  }
}

function resolveExpiry(tokenResponse: {
  expires_in?: number;
}): number | undefined {
  const { expires_in } = tokenResponse;
  if (typeof expires_in === "number" && Number.isFinite(expires_in)) {
    return Math.floor(Date.now() / 1000) + expires_in;
  }
  return undefined;
}
