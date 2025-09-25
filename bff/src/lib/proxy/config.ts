import type {
  ContentRewriteOptions,
  DebugOptions,
  HeaderProcessingOptions,
  ProxyConfiguration,
} from "./types";

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

export const DEFAULT_HEADER_OPTIONS: HeaderProcessingOptions = {
  enableForwardedHeaders: true,
  enableHopByHopFiltering: true,
  customHopByHopHeaders: [],
  forwardedHeadersPolicy: "override",
  customHeaders: {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  },
  removeHeaders: ["server", "x-powered-by"],
};

export const DEFAULT_CONTENT_OPTIONS: ContentRewriteOptions = {
  enableHtmlRewriting: true,
  enableJsonRewriting: true,
  enableAbsoluteUrlRewriting: true,
  htmlRewritePatterns: ["href", "src", "action", "formaction"],
  contentTypeOverrides: {
    "application/json": true,
    "application/jwt": false,
    "application/x-www-form-urlencoded": false,
  },
};

export const DEFAULT_DEBUG_OPTIONS: DebugOptions = {
  enableRequestLogging: false,
  enableResponseLogging: false,
  enableHeaderTracing: false,
  enableContentTracing: false,
  logLevel: "none",
};

export const DEFAULT_PROXY_CONFIGURATION: ProxyConfiguration = {
  headers: DEFAULT_HEADER_OPTIONS,
  content: DEFAULT_CONTENT_OPTIONS,
  debug: DEFAULT_DEBUG_OPTIONS,
};

export function mergeProxyConfiguration(
  base: ProxyConfiguration,
  override?: Partial<ProxyConfiguration>,
): ProxyConfiguration {
  if (!override) return base;

  return {
    headers: {
      enableForwardedHeaders:
        override.headers?.enableForwardedHeaders ??
        base.headers.enableForwardedHeaders,
      enableHopByHopFiltering:
        override.headers?.enableHopByHopFiltering ??
        base.headers.enableHopByHopFiltering,
      customHopByHopHeaders:
        override.headers?.customHopByHopHeaders ??
        base.headers.customHopByHopHeaders,
      forwardedHeadersPolicy:
        override.headers?.forwardedHeadersPolicy ??
        base.headers.forwardedHeadersPolicy,
      customHeaders:
        override.headers?.customHeaders ?? base.headers.customHeaders,
      removeHeaders:
        override.headers?.removeHeaders ?? base.headers.removeHeaders,
    },
    content: {
      enableHtmlRewriting:
        override.content?.enableHtmlRewriting ??
        base.content.enableHtmlRewriting,
      enableJsonRewriting:
        override.content?.enableJsonRewriting ??
        base.content.enableJsonRewriting,
      enableAbsoluteUrlRewriting:
        override.content?.enableAbsoluteUrlRewriting ??
        base.content.enableAbsoluteUrlRewriting,
      htmlRewritePatterns:
        override.content?.htmlRewritePatterns ??
        base.content.htmlRewritePatterns,
      contentTypeOverrides:
        override.content?.contentTypeOverrides ??
        base.content.contentTypeOverrides,
    },
    debug: {
      enableRequestLogging:
        override.debug?.enableRequestLogging ?? base.debug.enableRequestLogging,
      enableResponseLogging:
        override.debug?.enableResponseLogging ??
        base.debug.enableResponseLogging,
      enableHeaderTracing:
        override.debug?.enableHeaderTracing ?? base.debug.enableHeaderTracing,
      enableContentTracing:
        override.debug?.enableContentTracing ?? base.debug.enableContentTracing,
      logLevel: override.debug?.logLevel ?? base.debug.logLevel,
    },
  };
}
