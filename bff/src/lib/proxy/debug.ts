import type { NextRequest } from "next/server";
import type { DebugOptions } from "./types";

export function debugLog(
  message: string,
  level: DebugOptions["logLevel"],
  currentLevel: DebugOptions["logLevel"],
  data?: unknown,
) {
  if (currentLevel === "none") return;

  const levelOrder = { none: 0, basic: 1, detailed: 2, verbose: 3 };

  if (levelOrder[level] <= levelOrder[currentLevel]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [PROXY-${level.toUpperCase()}]`;

    if (data) {
      console.log(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

export function traceRequest(
  request: NextRequest,
  targetUrl: URL,
  options: DebugOptions,
) {
  if (!options.enableRequestLogging) return;

  debugLog("Incoming request", "basic", options.logLevel, {
    method: request.method,
    url: request.url,
    target: targetUrl.toString(),
  });

  if (options.enableHeaderTracing) {
    debugLog(
      "Request headers",
      "detailed",
      options.logLevel,
      Object.fromEntries(request.headers.entries()),
    );
  }
}

export function traceResponse(
  response: Response,
  originalHeaders: Headers | null,
  modifiedHeaders: Headers,
  options: DebugOptions,
) {
  if (!options.enableResponseLogging) return;

  debugLog("Upstream response", "basic", options.logLevel, {
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get("content-type"),
  });

  if (options.enableHeaderTracing && originalHeaders) {
    debugLog(
      "Original response headers",
      "detailed",
      options.logLevel,
      Object.fromEntries(originalHeaders.entries()),
    );

    debugLog(
      "Modified response headers",
      "detailed",
      options.logLevel,
      Object.fromEntries(modifiedHeaders.entries()),
    );

    // Show header changes
    const changes = compareHeaders(originalHeaders, modifiedHeaders);
    if (changes.length > 0) {
      debugLog("Header changes", "verbose", options.logLevel, changes);
    }
  }
}

export function traceHeaderProcessing(
  originalHeaders: Headers | null,
  processedHeaders: Headers,
  options: DebugOptions,
) {
  if (!options.enableHeaderTracing || !originalHeaders) return;

  const changes = compareHeaders(originalHeaders, processedHeaders);
  if (changes.length > 0) {
    debugLog(
      "Header processing changes",
      "detailed",
      options.logLevel,
      changes,
    );
  }
}

export function traceContentRewrite(
  originalContent: string,
  rewrittenContent: string,
  contentType: string,
  options: DebugOptions,
) {
  if (!options.enableContentTracing) return;

  if (originalContent !== rewrittenContent) {
    debugLog("Content rewritten", "detailed", options.logLevel, {
      contentType,
      originalLength: originalContent.length,
      rewrittenLength: rewrittenContent.length,
    });

    if (options.logLevel === "verbose") {
      // Show first 500 chars of diff for debugging
      const originalPreview = originalContent.substring(0, 500);
      const rewrittenPreview = rewrittenContent.substring(0, 500);

      if (originalPreview !== rewrittenPreview) {
        debugLog("Content diff preview", "verbose", options.logLevel, {
          original: originalPreview,
          rewritten: rewrittenPreview,
        });
      }
    }
  } else {
    debugLog("Content not modified", "verbose", options.logLevel, {
      contentType,
    });
  }
}

export function traceError(
  error: Error,
  context: string,
  options: DebugOptions,
) {
  debugLog(`Error in ${context}`, "basic", options.logLevel, {
    message: error.message,
    stack: error.stack,
  });
}

function compareHeaders(original: Headers, modified: Headers) {
  const changes: Array<{
    type: "added" | "removed" | "modified";
    key: string;
    oldValue?: string;
    newValue?: string;
  }> = [];

  const originalEntries = new Map(original.entries());
  const modifiedEntries = new Map(modified.entries());

  // Check for removed or modified headers
  for (const [key, oldValue] of originalEntries) {
    const newValue = modifiedEntries.get(key);
    if (newValue === undefined) {
      changes.push({ type: "removed", key, oldValue });
    } else if (newValue !== oldValue) {
      changes.push({ type: "modified", key, oldValue, newValue });
    }
  }

  // Check for added headers
  for (const [key, newValue] of modifiedEntries) {
    if (!originalEntries.has(key)) {
      changes.push({ type: "added", key, newValue });
    }
  }

  return changes;
}
