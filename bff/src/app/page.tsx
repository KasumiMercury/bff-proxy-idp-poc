import { cookies } from "next/headers";
import { fetchUserInfo, skipSubjectCheck } from "openid-client";
import type { JSX } from "react";

import { getOidcConfiguration } from "@/lib/auth/oidc";
import { getSessionCookieName, parseSessionCookie } from "@/lib/auth/session";
import { LoginButton } from "./login/LoginButton";
import { LogoutButton } from "./login/LogoutButton";

export default async function Home(): Promise<JSX.Element> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(getSessionCookieName())?.value;
  const session = parseSessionCookie(sessionCookie);

  let userInfo: Record<string, unknown> | null = null;

  if (session && !session.isExpired && session.tokens.accessToken) {
    try {
      const configuration = await getOidcConfiguration();
      userInfo = await fetchUserInfo(
          configuration,
          session.tokens.accessToken,
          skipSubjectCheck,
      );
    } catch (error) {
      console.error("Failed to load userinfo", error);
    }
  }

  const expiresAtDisplay = session?.expiresAt
      ? new Intl.DateTimeFormat("ja-JP", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(session.expiresAt)
      : undefined;

  const sub = typeof userInfo?.sub === "string" ? userInfo.sub : undefined;
  const name = typeof userInfo?.name === "string" ? userInfo.name : undefined;
  const email =
      typeof userInfo?.email === "string" ? userInfo.email : undefined;

  const hasSession = Boolean(session);
  const isActiveSession = Boolean(session && !session.isExpired);

  return (
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pb-16 pt-16">
          <header className="flex flex-col gap-2">
            <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
              OIDC BFF PoC
            </p>
          </header>
          <section className="flex flex-col gap-4 rounded-lg bg-slate-900 p-6 shadow">
            <h2 className="text-xl font-semibold">内部ログイン</h2>
            <p className="text-sm text-slate-300">
              BFF を経由して ID プロバイダへ認証やログアウトを行います。
            </p>
            <div className="flex flex-wrap gap-3">
              <LoginButton />
              {hasSession && <LogoutButton />}
            </div>
            <div className="rounded border border-slate-700 bg-slate-950/40 p-4">
              <h3 className="text-base font-semibold">現在の状態</h3>
              {session ? (
                  <div className="mt-2 space-y-2 text-sm text-slate-200">
                    <p>
                      {isActiveSession
                          ? "ログイン済みです。"
                          : "セッションはありますがアクセストークンが期限切れです。"}
                    </p>
                    {expiresAtDisplay && (
                        <p>アクセストークン有効期限: {expiresAtDisplay}</p>
                    )}
                    {session.tokens.scope && (
                        <p>スコープ: {session.tokens.scope}</p>
                    )}
                    {!isActiveSession && (
                        <p className="text-orange-300">
                          アクセストークンが期限切れです。
                        </p>
                    )}
                    {(name || email || sub) && (
                        <div className="space-y-1 text-slate-300">
                          {name && <p>名前: {name}</p>}
                          {email && <p>メール: {email}</p>}
                          {sub && <p>サブジェクト: {sub}</p>}
                        </div>
                    )}
                  </div>
              ) : (
                  <p className="mt-2 text-sm text-slate-300">未ログインです。</p>
              )}
            </div>
          </section>
        </div>
      </div>
  );
}
