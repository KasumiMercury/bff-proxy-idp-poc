import type { NextRequest } from "next/server";
import { proxyToIdp } from "@/lib/proxy";

const PROXY_PREFIX = "/api/oidc";

export const dynamic = "force-dynamic";

const handler = (request: NextRequest) =>
  proxyToIdp(request, {
    proxyPrefix: PROXY_PREFIX,
  });

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;
