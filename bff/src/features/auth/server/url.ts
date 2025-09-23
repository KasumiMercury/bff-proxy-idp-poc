import type { NextRequest } from "next/server";

import { getConfig } from "@/lib/config";

export function getAppBaseUrl(request: NextRequest): string {
  const host = resolveHost(request);
  const protocol = resolveProtocol(request);
  return `${protocol}://${host}`;
}

function resolveHost(request: NextRequest): string {
  const { trustProxyHeaders } = getConfig();
  if (trustProxyHeaders) {
    const forwarded = request.headers.get("x-forwarded-host");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) {
        return first;
      }
    }
  }
  const host = request.headers.get("host");
  if (!host) {
    throw new Error("Host ヘッダーが見つかりません");
  }
  return host;
}

function resolveProtocol(request: NextRequest): string {
  const { trustProxyHeaders } = getConfig();
  if (trustProxyHeaders) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedProto) {
      const first = forwardedProto.split(",")[0]?.trim();
      if (first) {
        return first;
      }
    }
  }
  const protocol = request.nextUrl.protocol.replace(/:$/, "");
  return protocol || "http";
}
