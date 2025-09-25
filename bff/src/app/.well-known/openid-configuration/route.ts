import type { NextRequest } from "next/server";
import { getIdpBaseUrl } from "@/lib/proxy/config";

export const dynamic = "force-dynamic";

const PROXY_PREFIX = "/api/oidc";

interface OidcConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  introspection_endpoint?: string;
  userinfo_endpoint: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  device_authorization_endpoint?: string;
  jwks_uri: string;
  [key: string]: unknown;
}

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const upstreamBase = getIdpBaseUrl();
    const clientOrigin = request.nextUrl.origin;

    const configUrl = new URL(".well-known/openid-configuration", upstreamBase);

    const configResponse = await fetch(configUrl.toString());

    if (!configResponse.ok) {
      return new Response("Failed to fetch OIDC configuration", {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const originalConfig = (await configResponse.json()) as OidcConfiguration;

    const rewrittenConfig = rewriteOidcUrls(
      originalConfig,
      upstreamBase,
      clientOrigin,
      PROXY_PREFIX,
    );

    return new Response(JSON.stringify(rewrittenConfig, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Error proxying OIDC configuration:", error);
    return new Response("Internal server error", {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function rewriteOidcUrls(
  config: OidcConfiguration,
  upstreamBase: URL,
  clientOrigin: string,
  proxyPrefix: string,
): OidcConfiguration {
  const result = { ...config };

  const urlFields = [
    "issuer",
    "authorization_endpoint",
    "token_endpoint",
    "introspection_endpoint",
    "userinfo_endpoint",
    "revocation_endpoint",
    "end_session_endpoint",
    "device_authorization_endpoint",
    "jwks_uri",
  ];

  for (const field of urlFields) {
    const value = result[field];
    if (typeof value === "string" && value.startsWith(upstreamBase.origin)) {
      result[field] = value.replace(
        upstreamBase.origin,
        `${clientOrigin}${proxyPrefix}`,
      );
    }
  }

  return result;
}
