import { decodeSignedCookie } from "@/lib/auth/cookies";
import { getSessionSecret, getSessionTtlSeconds } from "@/lib/auth/env";
import type { TokenCookiePayload } from "@/lib/auth/types";

export type SessionState = {
  tokens: TokenCookiePayload;
  issuedAt: number;
  isExpired: boolean;
  expiresAt?: number;
};

const SESSION_COOKIE_NAME = "bff_session";

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function parseSessionCookie(
  value: string | undefined,
): SessionState | null {
  if (!value) {
    return null;
  }

  const decoded = decodeSignedCookie<TokenCookiePayload>(
    value,
    getSessionSecret(),
  );

  if (!decoded) {
    return null;
  }

  const { payload, issuedAt } = decoded;

  const expiresAt = resolveExpiry(payload, issuedAt);

  return {
    tokens: payload,
    issuedAt,
    isExpired: expiresAt !== undefined && Date.now() >= expiresAt,
    expiresAt,
  };
}

function resolveExpiry(
  payload: TokenCookiePayload,
  issuedAt: number,
): number | undefined {
  if (payload.expiresAt) {
    return payload.expiresAt * 1000;
  }

  const ttl = getSessionTtlSeconds();
  return issuedAt + ttl * 1000;
}
