import type { NextRequest } from "next/server";
import { DEFAULT_PROXY_PREFIX, getIdpBaseUrl } from "@/lib/proxy/config";

const REVALIDATE_SECONDS = 3600;

export const revalidate = REVALIDATE_SECONDS;

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

    const configResponse = await fetch(configUrl, {
      cache: "force-cache",
      next: { revalidate: REVALIDATE_SECONDS },
      signal: request.signal,
    });

    if (!configResponse.ok) {
      return new Response("Failed to fetch OIDC configuration", {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const originalConfig = (await configResponse.json()) as OidcConfiguration;

    const rewrittenConfig = rewriteOidcUrls(
      originalConfig,
      upstreamBase.origin,
      `${clientOrigin}${DEFAULT_PROXY_PREFIX}`,
    );

    return Response.json(rewrittenConfig, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${REVALIDATE_SECONDS}`,
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
  upstreamOrigin: string,
  proxyOrigin: string,
): OidcConfiguration {
  return rewriteValue(config, upstreamOrigin, proxyOrigin) as OidcConfiguration;
}

function rewriteValue(
  value: unknown,
  upstreamOrigin: string,
  proxyOrigin: string,
): unknown {
  if (typeof value === "string") {
    if (value.startsWith(upstreamOrigin)) {
      return `${proxyOrigin}${value.slice(upstreamOrigin.length)}`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) =>
      rewriteValue(entry, upstreamOrigin, proxyOrigin),
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, nestedValue]) => [
        key,
        rewriteValue(nestedValue, upstreamOrigin, proxyOrigin),
      ],
    );
    return Object.fromEntries(entries);
  }

  return value;
}
