import type { NextRequest } from "next/server";
import { proxyToIdp } from "@/lib/idpProxy";

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
  });
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
