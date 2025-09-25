import type { ContentRewriteContext, ContentRewriteOptions } from "./types";

export function shouldProcessAsText(
  contentType: string,
  options: ContentRewriteOptions,
): boolean {
  const normalized = contentType.toLowerCase();

  // Check for explicit overrides first
  for (const [pattern, shouldProcess] of Object.entries(
    options.contentTypeOverrides,
  )) {
    if (normalized.includes(pattern.toLowerCase())) {
      return shouldProcess;
    }
  }

  // Default detection logic
  return (
    normalized.startsWith("text/") ||
    normalized.includes("json") ||
    normalized.includes("javascript") ||
    normalized.includes("xml")
  );
}

export function rewriteTextContent(
  body: string,
  context: ContentRewriteContext,
  options: ContentRewriteOptions,
): string {
  let output = body;
  const lowerContentType = context.contentType.toLowerCase();
  const isHtml = lowerContentType.includes("text/html");
  const isJson = lowerContentType.includes("json");

  if (options.enableJsonRewriting && isJson) {
    output = rewriteJsonContent(
      output,
      context.upstreamBase,
      context.proxyPrefix,
      context.clientOrigin,
    );
  }

  if (
    options.enableAbsoluteUrlRewriting &&
    output.includes(context.upstreamBase.origin)
  ) {
    output = rewriteAbsoluteOriginUrls(
      output,
      context.upstreamBase,
      context.proxyPrefix,
      context.clientOrigin,
    );
  }

  if (options.enableHtmlRewriting && isHtml) {
    output = rewriteHtmlContent(
      output,
      context.proxyPrefix,
      options.htmlRewritePatterns,
    );
  }

  return output;
}

function rewriteHtmlContent(
  html: string,
  proxyPrefix: string,
  patterns: string[],
): string {
  const needsRewrite = patterns.some(
    (pattern) =>
      html.includes(`${pattern}="/`) || html.includes(`${pattern}='/`),
  );

  if (!needsRewrite) {
    return html;
  }

  let output = html;
  const escapedPrefix = escapeRegExp(proxyPrefix.slice(1));

  for (const pattern of patterns) {
    const doubleQuotedPattern = new RegExp(
      `(${pattern})="/(?!(?:${escapedPrefix})(?:/|$))`,
      "gi",
    );
    const singleQuotedPattern = new RegExp(
      `(${pattern})='/(?!(?:${escapedPrefix})(?:/|$))`,
      "gi",
    );

    const replacement = `$1="${proxyPrefix}/`;
    const replacementSingle = `$1='${proxyPrefix}/`;

    output = output
      .replace(doubleQuotedPattern, replacement)
      .replace(singleQuotedPattern, replacementSingle);
  }

  return output;
}

function rewriteJsonContent(
  json: string,
  upstreamBase: URL,
  proxyPrefix: string,
  clientOrigin: string,
): string {
  if (!json.includes(upstreamBase.origin)) {
    return json;
  }

  try {
    const data = JSON.parse(json);
    const rewritten = rewriteJsonUrls(
      data,
      upstreamBase,
      proxyPrefix,
      clientOrigin,
    );
    return JSON.stringify(rewritten);
  } catch {
    // If JSON parsing fails, fall back to string replacement
    return rewriteAbsoluteOriginUrls(
      json,
      upstreamBase,
      proxyPrefix,
      clientOrigin,
    );
  }
}

function rewriteJsonUrls(
  obj: unknown,
  upstreamBase: URL,
  proxyPrefix: string,
  clientOrigin: string,
): unknown {
  if (typeof obj === "string" && obj.startsWith(upstreamBase.origin)) {
    return obj.replace(upstreamBase.origin, `${clientOrigin}${proxyPrefix}`);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) =>
      rewriteJsonUrls(item, upstreamBase, proxyPrefix, clientOrigin),
    );
  }

  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = rewriteJsonUrls(
        value,
        upstreamBase,
        proxyPrefix,
        clientOrigin,
      );
    }
    return result;
  }

  return obj;
}

function rewriteAbsoluteOriginUrls(
  content: string,
  upstreamBase: URL,
  proxyPrefix: string,
  clientOrigin: string,
): string {
  if (!content.includes(upstreamBase.origin)) {
    return content;
  }

  const upstreamOriginPattern = new RegExp(
    `${escapeRegExp(upstreamBase.origin)}`,
    "g",
  );
  const proxyAbsolutePrefix = `${clientOrigin}${proxyPrefix}`;

  return content.replace(upstreamOriginPattern, proxyAbsolutePrefix);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
