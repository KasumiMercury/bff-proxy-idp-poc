const DEFAULT_REDIRECT_URI =
  process.env.OIDC_REDIRECT_URI ??
  "http://localhost:3000/api/internal/auth/callback";

const DEFAULT_PROXY_BASE =
  process.env.OIDC_PROXY_BASE ?? "http://localhost:3000";

const DEFAULT_SCOPES =
  process.env.OIDC_DEFAULT_SCOPES ?? "openid profile email offline_access";

export function getOidcIssuerUrl(): string {
  return getRequiredEnv("OIDC_ISSUER_URL");
}

export function getOidcClientId(): string {
  return getRequiredEnv("OIDC_CLIENT_ID");
}

export function getOidcClientSecret(): string {
  return getRequiredEnv("OIDC_CLIENT_SECRET");
}

export function getSessionSecret(): string {
  return getRequiredEnv("BFF_SESSION_SECRET");
}

export function getRedirectUri(): string {
  return DEFAULT_REDIRECT_URI;
}

export function getProxyAuthorizeUrl(): URL {
  return new URL("/oidc/authorize", DEFAULT_PROXY_BASE);
}

export function getRequestedScopes(): string {
  return DEFAULT_SCOPES;
}

export function getStateTtlSeconds(): number {
  return getNumberEnv("BFF_STATE_TTL", 300);
}

export function getSessionTtlSeconds(): number {
  return getNumberEnv("BFF_SESSION_TTL", 24 * 60 * 60);
}

export function getCookieSameSite(): "lax" | "strict" | "none" {
  const value = (process.env.BFF_COOKIE_SAMESITE ?? "lax").toLowerCase();
  if (value === "lax" || value === "strict" || value === "none") {
    return value;
  }
  return "lax";
}

export function isSecureCookies(): boolean {
  if (process.env.BFF_COOKIE_SECURE?.toLowerCase() === "false") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}
