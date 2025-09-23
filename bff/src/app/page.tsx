import { cookies, headers } from "next/headers";

import { getSessionFromCookie } from "@/features/auth/server/session-store";
import { getConfig } from "@/lib/config";
import type {JSX} from "react";

interface SessionView {
  authenticated: boolean;
  user?: Record<string, unknown>;
  session?: {
    expiresAt?: string;
    accessTokenExpiresAt?: string;
  };
}

async function resolveReturnTo(): Promise<string> {
  const headerList = await headers();
  const url = headerList.get("x-forwarded-uri") ?? headerList.get("referer");
  if (!url) {
    return "/";
  }
  try {
    const parsed = new URL(url, "https://placeholder.local");
    return parsed.pathname + parsed.search + parsed.hash;
  } catch (_error) {
    return "/";
  }
}

export default async function Home(): Promise<JSX.Element> {
  const { sessionCookieName } = getConfig();
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(sessionCookieName)?.value;
  const session = getSessionFromCookie(cookieValue);

  const view = buildView(session);
  const returnTo = await resolveReturnTo();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pb-16 pt-16">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
            OIDC BFF PoC
          </p>
        </header>

        <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xl font-semibold text-slate-100">
                {view.authenticated ? "サインイン済" : "サインアウト"}
              </p>
            </div>
            {view.authenticated ? (
              <form action="/api/internal/auth/logout" method="post">
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
                >
                  サインアウト
                </button>
              </form>
            ) : (
              <form action="/api/internal/auth/login" method="get">
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  type="submit"
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow transition hover:bg-emerald-400"
                >
                  サインイン
                </button>
              </form>
            )}
          </div>

          {view.authenticated ? (
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-300">
                  ユーザー情報
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-slate-950/50 p-3 text-xs text-slate-200">
                  {JSON.stringify(view.user ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">セッション</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-300">
                  <li>
                    <span className="font-semibold text-slate-100">
                      BFF Session:
                    </span>{" "}
                    {view.session?.expiresAt ?? "不明"}
                  </li>
                  {view.session?.accessTokenExpiresAt ? (
                    <li>
                      <span className="font-semibold text-slate-100">
                        Access Token:
                      </span>{" "}
                      {view.session.accessTokenExpiresAt}
                    </li>
                  ) : null}
                </ul>
              </div>
              <a
                href="/?_=${Date.now()}"
                className="inline-flex rounded border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                更新
              </a>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function buildView(
  session: ReturnType<typeof getSessionFromCookie>,
): SessionView {
  if (!session) {
    return { authenticated: false };
  }

  const userPayload: Record<string, unknown> = {};
  if (session.subject) {
    userPayload.sub = session.subject;
  }
  if (session.userInfo) {
    Object.assign(userPayload, session.userInfo);
  }

  return {
    authenticated: true,
    user: userPayload,
    session: {
      expiresAt: new Date(session.expiresAt).toISOString(),
      accessTokenExpiresAt: session.tokens.expiresAt
        ? new Date(session.tokens.expiresAt).toISOString()
        : undefined,
    },
  };
}
