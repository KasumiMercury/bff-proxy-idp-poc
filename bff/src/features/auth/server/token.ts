import type { SessionTokens } from "@/features/auth/server/session-store";

export interface TokenEndpointLikeResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  expiresAt?: number;
}

export function normalizeTokenSet(
  response: TokenEndpointLikeResponse,
): SessionTokens {
  if (!response || typeof response.access_token !== "string") {
    throw new Error("token response に access_token が含まれていません");
  }

  let expiresAt: number | undefined;
  if (typeof response.expiresAt === "number") {
    expiresAt = response.expiresAt;
  } else if (typeof response.expires_in === "number") {
    expiresAt = Date.now() + response.expires_in * 1000;
  }

  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    idToken: response.id_token,
    tokenType: response.token_type,
    scope: response.scope,
    expiresAt,
  } satisfies SessionTokens;
}
