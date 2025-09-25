import type {
  ContentRewriteOptions,
  ContentRewriteOverrides,
  DebugOptions,
  DebugOverrides,
  HeaderProcessingOptions,
  HeaderProcessingOverrides,
  ProxyConfiguration,
  ProxyConfigurationOverrides,
} from "./types";

export const DEFAULT_PROXY_PREFIX = "/oidc";

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
  override?: ProxyConfigurationOverrides,
): ProxyConfiguration {
  if (!override) {
    return base;
  }

  return {
    headers: mergeHeaderOptions(base.headers, override?.headers),
    content: mergeContentOptions(base.content, override?.content),
    debug: mergeDebugOptions(base.debug, override?.debug),
  };
}

function mergeHeaderOptions(
  base: HeaderProcessingOptions,
  override?: HeaderProcessingOverrides,
): HeaderProcessingOptions {
  const merged = cloneHeaderOptions(base);

  if (!override) {
    return merged;
  }

  if (override.enableForwardedHeaders !== undefined) {
    merged.enableForwardedHeaders = override.enableForwardedHeaders;
  }
  if (override.enableHopByHopFiltering !== undefined) {
    merged.enableHopByHopFiltering = override.enableHopByHopFiltering;
  }
  if (override.forwardedHeadersPolicy) {
    merged.forwardedHeadersPolicy = override.forwardedHeadersPolicy;
  }
  if (override.customHopByHopHeaders) {
    merged.customHopByHopHeaders = normalizeHeaderList(
      override.customHopByHopHeaders,
    );
  }
  if (override.removeHeaders) {
    merged.removeHeaders = normalizeHeaderList(override.removeHeaders);
  }
  if (override.customHeaders) {
    merged.customHeaders = mergeCustomHeaders(
      merged.customHeaders,
      override.customHeaders,
    );
  }

  return merged;
}

function mergeContentOptions(
  base: ContentRewriteOptions,
  override?: ContentRewriteOverrides,
): ContentRewriteOptions {
  const merged = cloneContentOptions(base);

  if (!override) {
    return merged;
  }

  if (override.enableHtmlRewriting !== undefined) {
    merged.enableHtmlRewriting = override.enableHtmlRewriting;
  }
  if (override.enableJsonRewriting !== undefined) {
    merged.enableJsonRewriting = override.enableJsonRewriting;
  }
  if (override.enableAbsoluteUrlRewriting !== undefined) {
    merged.enableAbsoluteUrlRewriting = override.enableAbsoluteUrlRewriting;
  }
  if (override.htmlRewritePatterns) {
    merged.htmlRewritePatterns = [...override.htmlRewritePatterns];
  }
  if (override.contentTypeOverrides) {
    const overrides: Record<string, boolean> = {
      ...merged.contentTypeOverrides,
    };

    for (const [key, value] of Object.entries(override.contentTypeOverrides)) {
      const normalizedKey = key.trim().toLowerCase();
      if (!normalizedKey) {
        continue;
      }

      if (value === null || value === undefined) {
        delete overrides[normalizedKey];
        continue;
      }

      overrides[normalizedKey] = value;
    }

    merged.contentTypeOverrides = overrides;
  }

  return merged;
}

function mergeDebugOptions(
  base: DebugOptions,
  override?: DebugOverrides,
): DebugOptions {
  const merged = { ...base };

  if (!override) {
    return merged;
  }

  if (override.enableRequestLogging !== undefined) {
    merged.enableRequestLogging = override.enableRequestLogging;
  }
  if (override.enableResponseLogging !== undefined) {
    merged.enableResponseLogging = override.enableResponseLogging;
  }
  if (override.enableHeaderTracing !== undefined) {
    merged.enableHeaderTracing = override.enableHeaderTracing;
  }
  if (override.enableContentTracing !== undefined) {
    merged.enableContentTracing = override.enableContentTracing;
  }
  if (override.logLevel) {
    merged.logLevel = override.logLevel;
  }

  return merged;
}

function normalizeHeaderList(entries: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const normalized = entry.trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

function mergeCustomHeaders(
  base: Record<string, string>,
  override: Record<string, string | null | undefined>,
): Record<string, string> {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      continue;
    }

    const existingKey = findExistingHeaderKey(merged, normalizedKey);

    if (value === null || value === undefined) {
      if (existingKey) {
        delete merged[existingKey];
      }
      continue;
    }

    const targetKey = existingKey ?? normalizedKey;
    merged[targetKey] = value;
  }

  return merged;
}

function cloneHeaderOptions(
  options: HeaderProcessingOptions,
): HeaderProcessingOptions {
  return {
    enableForwardedHeaders: options.enableForwardedHeaders,
    enableHopByHopFiltering: options.enableHopByHopFiltering,
    customHopByHopHeaders: [...options.customHopByHopHeaders],
    forwardedHeadersPolicy: options.forwardedHeadersPolicy,
    customHeaders: { ...options.customHeaders },
    removeHeaders: [...options.removeHeaders],
  };
}

function cloneContentOptions(
  options: ContentRewriteOptions,
): ContentRewriteOptions {
  return {
    enableHtmlRewriting: options.enableHtmlRewriting,
    enableJsonRewriting: options.enableJsonRewriting,
    enableAbsoluteUrlRewriting: options.enableAbsoluteUrlRewriting,
    htmlRewritePatterns: [...options.htmlRewritePatterns],
    contentTypeOverrides: { ...options.contentTypeOverrides },
  };
}

function findExistingHeaderKey(
  headers: Record<string, string>,
  candidate: string,
): string | undefined {
  const candidateLower = candidate.toLowerCase();
  return Object.keys(headers).find(
    (key) => key.toLowerCase() === candidateLower,
  );
}
