export const DEFAULT_PROXY_PREFIX = "/api/oidc";

export function getIdpBaseUrl(): URL {
  const value = process.env.IDP_BASE_URL ?? process.env.OIDC_ISSUER_URL;
  if (!value) {
    throw new Error(
      "Missing IDP_BASE_URL (or OIDC_ISSUER_URL) environment variable for proxy",
    );
  }

  try {
    return new URL(value);
  } catch (error) {
    throw new Error(`Invalid IDP_BASE_URL: ${String(error)}`);
  }
}

export function normalizeProxyPrefix(prefix: string): string {
  if (!prefix.startsWith("/")) {
    prefix = `/${prefix}`;
  }
  if (prefix.endsWith("/")) {
    return prefix.slice(0, -1);
  }
  return prefix;
}
