import type { NextRequest } from "next/server";

import { ProxyPathError } from "./errors";

export function normalizeSegments(segments: string[]): string[] {
  return segments
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment))
    .map((segment) => {
      validateSegment(segment);
      return segment;
    });
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

export function ensureWithinBasePath(basePath: string, targetPath: string) {
  const normalizedBase = normalizeBasePath(basePath);

  if (normalizedBase === "/") {
    return;
  }

  if (targetPath === normalizedBase) {
    return;
  }

  const baseWithTrailingSlash = normalizedBase.endsWith("/")
    ? normalizedBase
    : `${normalizedBase}/`;

  if (!targetPath.startsWith(baseWithTrailingSlash)) {
    throw new ProxyPathError(
      `Resolved upstream path "${targetPath}" escapes base path "${normalizedBase}"`,
    );
  }
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

function normalizeBasePath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  let normalized = pathname;
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function validateSegment(segment: string) {
  let decoded = segment;

  try {
    decoded = decodeURIComponent(segment);
  } catch {
    throw new ProxyPathError(`Invalid encoding in path segment: ${segment}`);
  }

  if (decoded === "." || decoded === "..") {
    throw new ProxyPathError("Relative path segments are not allowed");
  }

  if (decoded.includes("/") || decoded.includes("\\")) {
    throw new ProxyPathError(
      "Path separators are not allowed inside proxy segments",
    );
  }

  if (hasControlCharacters(decoded)) {
    throw new ProxyPathError(
      "Control characters are not allowed in proxy segments",
    );
  }
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
}
