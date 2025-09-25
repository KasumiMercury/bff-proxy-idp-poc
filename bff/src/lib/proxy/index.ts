import type { NextRequest } from "next/server";

import {
  DEFAULT_PROXY_PREFIX,
  getIdpBaseUrl,
  normalizeProxyPrefix,
} from "./config";
import { rewriteTextContent, shouldProcessAsText } from "./content";
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

  const headers = buildForwardHeaders(request);

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

  const response = await fetch(targetUrl, init);

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

  if (shouldProcessAsText(contentType)) {
    const originalBody = await response.text();
    const rewrittenBody = rewriteTextContent(originalBody, {
      upstreamBase,
      proxyPrefix,
      clientOrigin,
      contentType,
    });
    responseHeaders.delete("content-length");
    responseBody = rewrittenBody;
  } else {
    responseBody = response.body;
  }

  return new Response(responseBody ?? undefined, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export type { ProxyOptions } from "./types";
