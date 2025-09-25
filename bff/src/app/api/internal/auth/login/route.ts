import { type NextRequest, NextResponse } from "next/server";
import { encodeSignedCookie } from "@/lib/auth/cookies";
import {
  getCookieSameSite,
  getSessionSecret,
  getStateTtlSeconds,
  isSecureCookies,
} from "@/lib/auth/env";
import {
  buildAuthorizationUrl,
  createAuthParameters,
  getOidcConfiguration,
} from "@/lib/auth/oidc";
import type { LoginStatePayload } from "@/lib/auth/types";

const LOGIN_STATE_COOKIE = "bff_login_state";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return startLogin(request);
}

export async function POST(request: NextRequest) {
  return startLogin(request);
}

async function startLogin(request: NextRequest): Promise<NextResponse> {
  const returnTo = resolveReturnTo(request);
  const authParameters = await createAuthParameters(returnTo);
  const configuration = await getOidcConfiguration();
  const authorizationUrl = buildAuthorizationUrl(configuration, authParameters);

  const response = NextResponse.redirect(authorizationUrl, { status: 302 });
  const secret = getSessionSecret();

  const loginPayload: LoginStatePayload = {
    state: authParameters.state,
    nonce: authParameters.nonce,
    codeVerifier: authParameters.codeVerifier,
    returnTo,
  };

  const cookieValue = encodeSignedCookie(
    {
      payload: loginPayload,
      issuedAt: Date.now(),
    },
    secret,
  );

  response.cookies.set({
    name: LOGIN_STATE_COOKIE,
    value: cookieValue,
    httpOnly: true,
    sameSite: getCookieSameSite(),
    secure: isSecureCookies(),
    maxAge: getStateTtlSeconds(),
    path: "/",
  });

  return response;
}

function resolveReturnTo(request: NextRequest): string {
  const requested = request.nextUrl.searchParams.get("returnTo") ?? "/";
  if (requested.startsWith("/")) {
    return requested;
  }

  try {
    const target = new URL(requested, request.nextUrl.origin);
    if (target.origin === request.nextUrl.origin) {
      return `${target.pathname}${target.search}` || "/";
    }
  } catch (error) {
    console.warn("Invalid returnTo parameter", error);
  }

  return "/";
}
