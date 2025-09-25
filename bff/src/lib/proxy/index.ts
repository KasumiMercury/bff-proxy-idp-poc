import type { NextRequest } from "next/server";

import {
  DEFAULT_PROXY_CONFIGURATION,
  DEFAULT_PROXY_PREFIX,
  getIdpBaseUrl,
  mergeProxyConfiguration,
  normalizeProxyPrefix,
} from "./config";
import { rewriteTextContent, shouldProcessAsText } from "./content";
import {
  traceContentRewrite,
  traceError,
  traceHeaderProcessing,
  traceRequest,
  traceResponse,
} from "./debug";
import { buildForwardHeaders } from "./headers";
import {
  buildTargetPath,
  normalizeSegments,
  rewriteLocationHeader,
  splitProxyPrefix,
  stripLeadingProxySegments,
} from "./path";
import type { ProxyOptions } from "./types";

export async function proxyToIdp(
  request: NextRequest,
  options: Partial<ProxyOptions> = {},
): Promise<Response> {
  // Merge configuration with defaults
  const config = options.config
    ? mergeProxyConfiguration(DEFAULT_PROXY_CONFIGURATION, options.config)
    : DEFAULT_PROXY_CONFIGURATION;

  const upstreamBase = getIdpBaseUrl();
  const proxyPrefix = normalizeProxyPrefix(
    options.proxyPrefix ?? DEFAULT_PROXY_PREFIX,
  );
  const pathSegments = normalizeSegments(options.pathSegments ?? []);
  const proxySegments = splitProxyPrefix(proxyPrefix);
  const remainingSegments = stripLeadingProxySegments(
    pathSegments,
    proxySegments,
  );
  const clientOrigin = request.nextUrl.origin;

  const targetUrl = new URL(upstreamBase.toString());
  targetUrl.pathname = buildTargetPath(
    upstreamBase.pathname,
    remainingSegments,
  );
  targetUrl.search = request.nextUrl.search;

  traceRequest(request, targetUrl, config.debug);

  const originalHeaders = new Headers(request.headers);
  const headers = buildForwardHeaders(request, config.headers);

  traceHeaderProcessing(originalHeaders, headers, config.debug);

  const hasBody = !(request.method === "GET" || request.method === "HEAD");
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (hasBody) {
    init.body = request.body;
    // @ts-expect-error Node fetch requires duplex when streaming a body
    init.duplex = "half";
  }

  let response: Response;
  try {
    response = await fetch(targetUrl, init);
  } catch (error) {
    traceError(error as Error, "upstream fetch", config.debug);
    throw error;
  }

  const originalResponseHeaders = new Headers(response.headers);
  const responseHeaders = new Headers(response.headers);
  const contentType = responseHeaders.get("content-type") ?? "";

  const rewrittenLocation = rewriteLocationHeader(
    responseHeaders.get("location"),
    request,
    upstreamBase,
    proxyPrefix,
  );
  if (rewrittenLocation) {
    responseHeaders.set("location", rewrittenLocation);
  }

  let responseBody: BodyInit | null = null;

  if (shouldProcessAsText(contentType, config.content)) {
    try {
      const originalBody = await response.text();
      const rewrittenBody = rewriteTextContent(
        originalBody,
        {
          upstreamBase,
          proxyPrefix,
          clientOrigin,
          contentType,
        },
        config.content,
      );

      traceContentRewrite(
        originalBody,
        rewrittenBody,
        contentType,
        config.debug,
      );

      responseHeaders.delete("content-length");
      responseBody = rewrittenBody;
    } catch (error) {
      traceError(error as Error, "content rewriting", config.debug);
      // Fall back to original body
      responseBody = response.body;
    }
  } else {
    responseBody = response.body;
  }

  traceResponse(
    response,
    originalResponseHeaders,
    responseHeaders,
    config.debug,
  );

  return new Response(responseBody ?? undefined, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export {
  DEFAULT_CONTENT_OPTIONS,
  DEFAULT_DEBUG_OPTIONS,
  DEFAULT_HEADER_OPTIONS,
  DEFAULT_PROXY_CONFIGURATION,
  mergeProxyConfiguration,
} from "./config";
export type { ProxyConfiguration, ProxyOptions } from "./types";
