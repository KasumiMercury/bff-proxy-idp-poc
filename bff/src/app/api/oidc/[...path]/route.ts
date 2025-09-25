import type { NextRequest } from "next/server";
import { proxyToIdp } from "@/lib/proxy";

type RouteParams = {
  path?: string[];
};

type RouteContext = {
  params: RouteParams | Promise<RouteParams>;
};

const PROXY_PREFIX = "/api/oidc";

export const dynamic = "force-dynamic";

const handler = async (request: NextRequest, context: RouteContext) => {
  const params = await context.params;
  return proxyToIdp(request, {
    pathSegments: params?.path ?? [],
    proxyPrefix: PROXY_PREFIX,
    config: {
      debug: {
        enableRequestLogging: true,
        enableResponseLogging: true,
        enableHeaderTracing: true,
        enableContentTracing: true,
        logLevel: "verbose",
      },
    },
  });
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
