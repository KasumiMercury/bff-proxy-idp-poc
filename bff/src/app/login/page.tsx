import { notFound } from "next/navigation";

import { LoginForm } from "@/features/auth/components/login-form";
import type { LoginContextView } from "@/features/auth/types";
import { getConfig } from "@/lib/config";

export const revalidate = 0;

interface RawLoginContext {
  id: string;
  client_id: string;
  scopes: string[];
  login_hint?: string;
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  const params = await searchParams;
  const authRequestParam = params.authRequestID ?? params.authRequestId;
  const authRequestID = Array.isArray(authRequestParam)
    ? authRequestParam[0]
    : authRequestParam;

  if (!authRequestID) {
    notFound();
  }

  const context = await fetchLoginContext(authRequestID);
  if (!context) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">
            認証リクエストを取得できません
          </h1>
          <p className="mt-4 text-sm text-slate-300">
            認証フローを最初からやり直してください。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 py-16">
        <LoginForm context={context} />
      </div>
    </main>
  );
}

async function fetchLoginContext(
  authRequestID: string,
): Promise<LoginContextView | null> {
  const { issuer } = getConfig();
  const url = new URL("/login/context", issuer);
  url.searchParams.set("id", authRequestID);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  try {
    const data = (await response.json()) as RawLoginContext;
    return {
      id: data.id,
      clientId: data.client_id,
      scopes: Array.isArray(data.scopes) ? data.scopes : [],
      loginHint: data.login_hint,
    } satisfies LoginContextView;
  } catch (_error) {
    return null;
  }
}
