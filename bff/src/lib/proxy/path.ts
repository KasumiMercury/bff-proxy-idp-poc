import type { NextRequest } from "next/server";

export function normalizeSegments(segments: string[]): string[] {
  return segments.filter((segment) => Boolean(segment?.trim()));
}

export function buildTargetPath(basePath: string, segments: string[]): string {
  const baseParts = basePath.split("/").filter(Boolean);
  const combined = [...baseParts, ...segments];
  return `/${combined.join("/")}`;
}

export function buildProxyPath(prefix: string, upstreamPath: string): string {
  const prefixParts = prefix.split("/").filter(Boolean);
  const upstreamParts = upstreamPath.split("/").filter(Boolean);
  return `/${[...prefixParts, ...upstreamParts].join("/")}`;
}

export function splitProxyPrefix(prefix: string): string[] {
  return prefix.split("/").filter(Boolean);
}

export function stripLeadingProxySegments(
  pathSegments: string[],
  proxySegments: string[],
): string[] {
  if (proxySegments.length === 0) {
    return [...pathSegments];
  }

  const remaining = [...pathSegments];
  let offset = 0;

  while (remaining.length - offset >= proxySegments.length) {
    const matches = proxySegments.every(
      (segment, index) => remaining[offset + index] === segment,
    );
    if (!matches) {
      break;
    }
    offset += proxySegments.length;
  }

  return remaining.slice(offset);
}

export function rewriteLocationHeader(
  locationValue: string | null,
  request: NextRequest,
  upstreamBase: URL,
  proxyPrefix: string,
): string | null {
  if (!locationValue) {
    return null;
  }

  let upstreamLocation: URL;
  try {
    upstreamLocation = new URL(
      locationValue,
      appendTrailingSlash(upstreamBase),
    );
  } catch {
    return null;
  }

  if (upstreamLocation.origin !== upstreamBase.origin) {
    return null;
  }

  const proxyUrl = new URL(request.nextUrl.origin);
  proxyUrl.pathname = buildProxyPath(proxyPrefix, upstreamLocation.pathname);
  proxyUrl.search = upstreamLocation.search;
  proxyUrl.hash = upstreamLocation.hash;
  return proxyUrl.toString();
}

function appendTrailingSlash(url: URL): URL {
  const clone = new URL(url.toString());
  if (!clone.pathname.endsWith("/")) {
    clone.pathname = `${clone.pathname}/`;
  }
  return clone;
}
