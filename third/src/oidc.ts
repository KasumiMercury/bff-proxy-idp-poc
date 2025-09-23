import { createHash, randomBytes } from "node:crypto";

import type { AppConfig } from "./config.js";

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: number;
}

interface OidcMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

let metadataCache: OidcMetadata | null = null;

export function createState(): string {
  return randomBytes(16).toString("hex");
}

export function createCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

export function createCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return base64UrlEncode(hash);
}

export async function buildAuthorizationUrl(
  config: AppConfig,
  state: string,
  codeChallenge: string,
): Promise<string> {
  const metadata = await getMetadata(config);
  const authorizationUrl = buildBffPublicUrl(
    config,
    metadata.authorization_endpoint,
  );

  const url = new URL(authorizationUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeAuthorizationCode(
  config: AppConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenSet> {
  const metadata = await getMetadata(config);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  const tokenUrl = buildBffApiUrl(config, metadata.token_endpoint);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: buildBasicAuthHeader(config.clientId, config.clientSecret),
    },
    body,
  });

  if (!response.ok) {
    const message = await safeReadBody(response);
    throw new Error(
      `token endpoint returned ${response.status} ${response.statusText}: ${message}`,
    );
  }

  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
  };

  const expiresAt =
    typeof json.expires_in === "number"
      ? Date.now() + json.expires_in * 1000
      : undefined;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    idToken: json.id_token,
    tokenType: json.token_type,
    scope: json.scope,
    expiresAt,
  } satisfies TokenSet;
}

export async function fetchUserInfo(
  config: AppConfig,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const metadata = await getMetadata(config);
  const userInfoUrl = buildBffApiUrl(config, metadata.userinfo_endpoint);
  const response = await fetch(userInfoUrl, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const message = await safeReadBody(response);
    throw new Error(
      `userinfo endpoint returned ${response.status} ${response.statusText}: ${message}`,
    );
  }

  return (await response.json()) as Record<string, unknown>;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${credentials}`;
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (_error) {
    return "<no body>";
  }
}

async function getMetadata(config: AppConfig): Promise<OidcMetadata> {
  if (metadataCache) {
    return metadataCache;
  }

  const response = await fetch(
    `${config.bffApiBaseUrl}/api/oidc/.well-known/openid-configuration`,
  );
  if (!response.ok) {
    const message = await safeReadBody(response);
    throw new Error(
      `failed to fetch OIDC metadata: ${response.status} ${response.statusText}: ${message}`,
    );
  }

  const metadata = (await response.json()) as OidcMetadata;
  metadataCache = metadata;
  return metadata;
}

function buildBffPublicUrl(config: AppConfig, endpoint: string): string {
  const path = normalizeEndpointPath(endpoint);
  const url = new URL(`/api/oidc${path}`, ensureTrailingSlash(config.bffPublicUrl));
  return url.toString();
}

function buildBffApiUrl(config: AppConfig, endpoint: string): string {
  const path = normalizeEndpointPath(endpoint);
  const url = new URL(`/api/oidc${path}`, ensureTrailingSlash(config.bffApiBaseUrl));
  return url.toString();
}

function normalizeEndpointPath(endpoint: string): string {
  const url = new URL(endpoint);
  const pathname = url.pathname === "/" ? "" : url.pathname;
  return pathname.endsWith("/") && pathname !== "/"
    ? pathname.slice(0, -1)
    : pathname;
}

function ensureTrailingSlash(input: string): string {
  return input.endsWith("/") ? input : `${input}/`;
}
