import { env } from "node:process";
export function loadConfig() {
    const port = parseInt(env.PORT ?? "4000", 10);
    const bffPublicUrl = env.BFF_PUBLIC_URL?.trim() || "http://localhost:3000";
    const bffApiBaseUrl = env.BFF_API_BASE_URL?.trim() || `${bffPublicUrl.replace(/\/$/, "")}`;
    const clientId = requireEnv("OIDC_CLIENT_ID", "third-web-app");
    const clientSecret = requireEnv("OIDC_CLIENT_SECRET", "third-secret");
    const redirectUri = requireEnv("OIDC_REDIRECT_URI", "http://localhost:4000/auth/callback");
    const scopes = (env.OIDC_SCOPES ?? "openid profile email")
        .split(/\s+/)
        .filter(Boolean);
    const sessionSecret = requireEnv("THIRD_SESSION_SECRET", "third-session-secret-change-me");
    const sessionCookieName = env.THIRD_SESSION_COOKIE_NAME?.trim() || "third_sid";
    const sessionCookieSecure = (env.THIRD_SESSION_COOKIE_SECURE ?? "false").toLowerCase() === "true" ||
        env.NODE_ENV === "production";
    return {
        port,
        bffPublicUrl: trimTrailingSlash(bffPublicUrl),
        bffApiBaseUrl: trimTrailingSlash(bffApiBaseUrl),
        clientId,
        clientSecret,
        redirectUri,
        scopes,
        sessionSecret,
        sessionCookieName,
        sessionCookieSecure,
    };
}
function requireEnv(key, fallback) {
    const value = env[key];
    if (value && value.trim().length > 0) {
        return value.trim();
    }
    if (fallback) {
        return fallback;
    }
    throw new Error(`環境変数 ${key} が設定されていません`);
}
function trimTrailingSlash(value) {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}
