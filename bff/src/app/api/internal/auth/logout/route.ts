import { type NextRequest, NextResponse } from "next/server";
import { tokenRevocation } from "openid-client";

import { getOidcConfiguration } from "@/lib/auth/oidc";
import {
  getSessionCookieName,
  parseSessionCookie,
  type SessionState,
} from "@/lib/auth/session";

const SESSION_COOKIE = getSessionCookieName();

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handleLogout(request);
}

export async function POST(request: NextRequest) {
  return handleLogout(request);
}

async function handleLogout(request: NextRequest): Promise<NextResponse> {
  const redirectUrl = resolveReturnTo(request);
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = parseSessionCookie(sessionCookie);

  if (session) {
    await revokeTokens(session).catch((error) => {
      console.error("Failed to revoke tokens", error);
    });
  }

  const response = NextResponse.redirect(redirectUrl, { status: 303 });
  response.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  return response;
}

async function revokeTokens(session: SessionState): Promise<void> {
  if (!session.tokens.accessToken && !session.tokens.refreshToken) {
    return;
  }

  const configuration = await getOidcConfiguration();
  const metadata = configuration.serverMetadata();

  if (!metadata.revocation_endpoint) {
    return;
  }

  const revocationTasks: Promise<void>[] = [];

  if (session.tokens.accessToken) {
    revocationTasks.push(
      tokenRevocation(configuration, session.tokens.accessToken, {
        token_type_hint: "access_token",
      }),
    );
  }

  if (session.tokens.refreshToken) {
    revocationTasks.push(
      tokenRevocation(configuration, session.tokens.refreshToken, {
        token_type_hint: "refresh_token",
      }),
    );
  }

  await Promise.allSettled(revocationTasks);
}

function resolveReturnTo(request: NextRequest): URL {
  const requested = request.nextUrl.searchParams.get("returnTo") ?? "/";

  if (requested.startsWith("/")) {
    return new URL(requested, request.nextUrl.origin);
  }

  try {
    const candidate = new URL(requested, request.nextUrl.origin);
    if (candidate.origin === request.nextUrl.origin) {
      return candidate;
    }
  } catch (error) {
    console.warn("Invalid returnTo parameter for logout", error);
  }

  return new URL(request.nextUrl.origin);
}
