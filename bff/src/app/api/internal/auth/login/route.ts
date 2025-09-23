import { type NextRequest, NextResponse } from "next/server";

import { setStateCookie } from "@/features/auth/server/cookies";
import { createAuthorizationRequest } from "@/features/auth/server/oidc-client";
import { storeAuthRequest } from "@/features/auth/server/state-store";
import { getAppBaseUrl } from "@/features/auth/server/url";
import { applyCorsHeaders, handleCors } from "@/lib/cors";
import { logInfo } from "@/lib/log";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cors = handleCors(request, ["GET"]);
  if (cors.response) {
    return cors.response;
  }

  const redirectTo = sanitizeReturnPath(
    request.nextUrl.searchParams.get("returnTo"),
  );

  const baseUrl = getAppBaseUrl(request);
  const redirectUri = `${baseUrl}/api/internal/auth/callback`;

  const {
    authorizationUrl: providerAuthorizationUrl,
    state,
    nonce,
    codeVerifier,
  } = await createAuthorizationRequest(redirectUri);

  storeAuthRequest({
    state,
    nonce,
    codeVerifier,
    redirectTo,
  });

  logInfo("internal-auth/login", "authorization flow initiated", {
    state,
    redirectTo,
    baseUrl,
  });

  const authorizationUrl = buildProxiedUrl(baseUrl, providerAuthorizationUrl);

  logInfo("internal-auth/login", "redirecting to authorization endpoint", {
    state,
    authorizationUrl,
  });

  const response = NextResponse.redirect(authorizationUrl, { status: 302 });
  setStateCookie(response, state, request);
  applyCorsHeaders(response, cors.allowedOrigin, ["GET"], request);
  return response;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const cors = handleCors(request, ["GET"]);
  return cors.response ?? new NextResponse(null, { status: 204 });
}

function buildProxiedUrl(baseUrl: string, targetUrl: string): string {
  const parsed = new URL(targetUrl);
  return `${baseUrl}/api/internal/oidc${parsed.pathname}${parsed.search}`;
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
