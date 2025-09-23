import { createHash, randomBytes } from "node:crypto";
let metadataCache = null;
export function createState() {
    return randomBytes(16).toString("hex");
}
export function createCodeVerifier() {
    return base64UrlEncode(randomBytes(32));
}
export function createCodeChallenge(verifier) {
    const hash = createHash("sha256").update(verifier).digest();
    return base64UrlEncode(hash);
}
export async function buildAuthorizationUrl(config, state, codeChallenge) {
    const metadata = await getMetadata(config);
    const authorizationUrl = buildBffPublicUrl(config, metadata.authorization_endpoint);
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
export async function exchangeAuthorizationCode(config, code, codeVerifier) {
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
        throw new Error(`token endpoint returned ${response.status} ${response.statusText}: ${message}`);
    }
    const json = (await response.json());
    const expiresAt = typeof json.expires_in === "number"
        ? Date.now() + json.expires_in * 1000
        : undefined;
    return {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        idToken: json.id_token,
        tokenType: json.token_type,
        scope: json.scope,
        expiresAt,
    };
}
export async function fetchUserInfo(config, accessToken) {
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
        throw new Error(`userinfo endpoint returned ${response.status} ${response.statusText}: ${message}`);
    }
    return (await response.json());
}
function base64UrlEncode(buffer) {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
function buildBasicAuthHeader(clientId, clientSecret) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    return `Basic ${credentials}`;
}
async function safeReadBody(response) {
    try {
        return await response.text();
    }
    catch (_error) {
        return "<no body>";
    }
}
async function getMetadata(config) {
    if (metadataCache) {
        return metadataCache;
    }
    const response = await fetch(`${config.bffApiBaseUrl}/api/oidc/.well-known/openid-configuration`);
    if (!response.ok) {
        const message = await safeReadBody(response);
        throw new Error(`failed to fetch OIDC metadata: ${response.status} ${response.statusText}: ${message}`);
    }
    const metadata = (await response.json());
    metadataCache = metadata;
    return metadata;
}
function buildBffPublicUrl(config, endpoint) {
    const path = normalizeEndpointPath(endpoint);
    const url = new URL(`/api/oidc${path}`, ensureTrailingSlash(config.bffPublicUrl));
    return url.toString();
}
function buildBffApiUrl(config, endpoint) {
    const path = normalizeEndpointPath(endpoint);
    const url = new URL(`/api/oidc${path}`, ensureTrailingSlash(config.bffApiBaseUrl));
    return url.toString();
}
function normalizeEndpointPath(endpoint) {
    const url = new URL(endpoint);
    const pathname = url.pathname === "/" ? "" : url.pathname;
    return pathname.endsWith("/") && pathname !== "/"
        ? pathname.slice(0, -1)
        : pathname;
}
function ensureTrailingSlash(input) {
    return input.endsWith("/") ? input : `${input}/`;
}
