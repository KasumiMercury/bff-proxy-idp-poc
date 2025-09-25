import type {
  AuthorizationCodeGrantChecks,
  Configuration,
  TokenEndpointResponse,
  TokenEndpointResponseHelpers,
} from "openid-client";
import * as oidc from "openid-client";

import {
  getOidcClientId,
  getOidcClientSecret,
  getOidcIssuerUrl,
  getProxyAuthorizeUrl,
  getRedirectUri,
  getRequestedScopes,
} from "./env";

export type AuthorizationParameters = {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  scope: string;
  returnTo: string;
};

export type AuthorizationTokens = TokenEndpointResponse &
  TokenEndpointResponseHelpers;

let configurationPromise: Promise<Configuration> | null = null;

export async function getOidcConfiguration(): Promise<Configuration> {
  if (!configurationPromise) {
    const issuerUrl = new URL(getOidcIssuerUrl());
    const execute =
      issuerUrl.protocol === "http:" ? [oidc.allowInsecureRequests] : undefined;

    const discoveryOptions = execute ? { execute } : undefined;

    configurationPromise = oidc.discovery(
      issuerUrl,
      getOidcClientId(),
      {
        client_secret: getOidcClientSecret(),
        redirect_uris: [getRedirectUri()],
        token_endpoint_auth_method: "client_secret_basic",
      },
      undefined,
      discoveryOptions,
    );
  }

  return configurationPromise;
}

export async function createAuthParameters(
  returnTo: string,
): Promise<AuthorizationParameters> {
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  return {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier,
    codeChallenge,
    scope: getRequestedScopes(),
    returnTo,
  };
}

export function buildAuthorizationUrl(
  configuration: Configuration,
  params: AuthorizationParameters,
): URL {
  const authorizeUrl = getProxyAuthorizeUrl();
  const upstreamUrl = oidc.buildAuthorizationUrl(configuration, {
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: params.scope,
    state: params.state,
    nonce: params.nonce,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });

  for (const [key, value] of upstreamUrl.searchParams) {
    authorizeUrl.searchParams.set(key, value);
  }

  return authorizeUrl;
}

export async function exchangeCode(
  configuration: Configuration,
  currentUrl: URL,
  params: {
    codeVerifier: string;
    state: string;
    nonce: string;
  },
): Promise<AuthorizationTokens> {
  const checks: AuthorizationCodeGrantChecks = {
    pkceCodeVerifier: params.codeVerifier,
    expectedState: params.state,
  };

  if (params.nonce) {
    checks.expectedNonce = params.nonce;
  }

  return oidc.authorizationCodeGrant(configuration, currentUrl, checks, {
    redirect_uri: getRedirectUri(),
  });
}
