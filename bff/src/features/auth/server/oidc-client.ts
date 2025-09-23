import type { Configuration } from "openid-client";
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  discovery,
  fetchUserInfo as fetchUserInfoRequest,
  refreshTokenGrant,
  tokenRevocation,
} from "openid-client";

import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from "@/features/auth/server/random";
import { getConfig } from "@/lib/config";

let configurationPromise: Promise<Configuration> | null = null;

async function getConfiguration(): Promise<Configuration> {
  if (!configurationPromise) {
    const { issuer, clientId, clientSecret } = getConfig();
    const server = new URL(issuer);

    configurationPromise = (async () => {
      const options =
        server.protocol === "http:"
          ? {
              execute: [allowInsecureRequests],
            }
          : undefined;

      const config = await discovery(
        server,
        clientId,
        clientSecret ?? undefined,
        undefined,
        options,
      );
      if (server.protocol === "http:") {
        allowInsecureRequests(config);
      }
      return config;
    })();
  }
  return configurationPromise;
}

export async function createAuthorizationRequest(redirectUri: string) {
  const config = await getConfiguration();
  const state = generateState();
  const nonce = generateNonce();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const { defaultScopes } = getConfig();

  const parameters: Record<string, string> = {
    redirect_uri: redirectUri,
    scope: defaultScopes.join(" "),
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
  };

  const authorizationUrl = buildAuthorizationUrl(config, parameters);

  return {
    authorizationUrl: authorizationUrl.toString(),
    state,
    nonce,
    codeVerifier,
  };
}

export async function exchangeAuthorizationCode(
  redirectUri: string,
  params: Record<string, string>,
  checks: { state: string; nonce: string; codeVerifier: string },
) {
  const config = await getConfiguration();
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return authorizationCodeGrant(config, url, {
    expectedState: checks.state,
    expectedNonce: checks.nonce,
    pkceCodeVerifier: checks.codeVerifier,
  });
}

export async function refreshTokenSet(refreshToken: string) {
  const config = await getConfiguration();
  return refreshTokenGrant(config, refreshToken);
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const config = await getConfiguration();
  await tokenRevocation(config, refreshToken, {
    token_type_hint: "refresh_token",
  });
}

export async function fetchUserInfo(accessToken: string) {
  const config = await getConfiguration();
  return fetchUserInfoRequest(config, accessToken);
}

export async function getIssuerMetadata() {
  const config = await getConfiguration();
  return config.serverMetadata();
}

export async function endSession(idToken?: string): Promise<void> {
  if (!idToken) {
    return;
  }
  const metadata = await getIssuerMetadata();
  if (!metadata.end_session_endpoint) {
    return;
  }

  await fetch(metadata.end_session_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ id_token_hint: idToken }).toString(),
  });
}
