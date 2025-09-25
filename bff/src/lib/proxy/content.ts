import type { ContentRewriteContext } from "./types";

export function shouldProcessAsText(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
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
): string {
  let output = rewriteAbsoluteOriginUrls(
    body,
    context.upstreamBase,
    context.proxyPrefix,
    context.clientOrigin,
  );

  if (context.contentType.toLowerCase().includes("text/html")) {
    output = rewriteHtmlContent(output, context.proxyPrefix);
  }

  return output;
}

function rewriteHtmlContent(html: string, proxyPrefix: string): string {
  const escapedPrefix = escapeRegExp(proxyPrefix.slice(1));
  const doubleQuotedPattern = new RegExp(
    `(href|src|action)="/(?!(?:${escapedPrefix})(?:/|$))`,
    "gi",
  );
  const singleQuotedPattern = new RegExp(
    `(href|src|action)='/(?!(?:${escapedPrefix})(?:/|$))`,
    "gi",
  );

  const replacement = `$1="${proxyPrefix}/`;
  const replacementSingle = `$1='${proxyPrefix}/`;

  return html
    .replace(doubleQuotedPattern, replacement)
    .replace(singleQuotedPattern, replacementSingle);
}

function rewriteAbsoluteOriginUrls(
  content: string,
  upstreamBase: URL,
  proxyPrefix: string,
  clientOrigin: string,
): string {
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
