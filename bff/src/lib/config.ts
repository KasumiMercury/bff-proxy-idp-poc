import { env } from "node:process";

type RequiredEnvKey =
  | "OIDC_ISSUER_URL"
  | "OIDC_CLIENT_ID"
  | "OIDC_CLIENT_SECRET"
  | "BFF_SESSION_SECRET";

function readEnv(key: RequiredEnvKey): string {
  const value = env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`環境変数 ${key} が設定されていません`);
  }
  return value;
}

function readOptionalEnv(key: string): string | undefined {
  const value = env[key];
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

export interface OIDCClientConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  defaultScopes: string[];
  sessionCookieName: string;
  stateCookieName: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  stateTtlSeconds: number;
  trustProxyHeaders: boolean;
  cookieSameSite: "lax" | "strict" | "none";
  allowedOrigins: string[];
}

let cachedConfig: OIDCClientConfig | null = null;

export function getConfig(): OIDCClientConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const defaultScopes = (
    readOptionalEnv("OIDC_DEFAULT_SCOPES") ??
    "openid profile email offline_access"
  )
    .split(/\s+/)
    .filter(Boolean);

  cachedConfig = {
    issuer: readEnv("OIDC_ISSUER_URL"),
    clientId: readEnv("OIDC_CLIENT_ID"),
    clientSecret: readEnv("OIDC_CLIENT_SECRET"),
    defaultScopes,
    sessionCookieName: readOptionalEnv("BFF_SESSION_COOKIE") ?? "bff_session",
    stateCookieName: readOptionalEnv("BFF_STATE_COOKIE") ?? "bff_auth_state",
    sessionSecret: readEnv("BFF_SESSION_SECRET"),
    sessionTtlSeconds: Number.parseInt(
      readOptionalEnv("BFF_SESSION_TTL") ?? "86400",
      10,
    ),
    stateTtlSeconds: Number.parseInt(
      readOptionalEnv("BFF_STATE_TTL") ?? "300",
      10,
    ),
    trustProxyHeaders:
      (readOptionalEnv("BFF_TRUST_PROXY_HEADERS") ?? "false").toLowerCase() ===
      "true",
    cookieSameSite: readCookieSameSite(),
    allowedOrigins: readAllowedOrigins(),
  } satisfies OIDCClientConfig;

  return cachedConfig;
}

function readCookieSameSite(): "lax" | "strict" | "none" {
  const value = (readOptionalEnv("BFF_COOKIE_SAMESITE") ?? "lax").toLowerCase();
  if (value === "lax" || value === "strict" || value === "none") {
    return value;
  }
  throw new Error(
    `BFF_COOKIE_SAMESITE の値 '${value}' は無効です。lax / strict / none のいずれかを指定してください。`,
  );
}

function readAllowedOrigins(): string[] {
  const raw = readOptionalEnv("BFF_ALLOWED_ORIGINS");
  if (!raw) {
    return [];
  }
  return raw
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter(Boolean);
}
