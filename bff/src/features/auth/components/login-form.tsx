"use client";

import { useFormState, useFormStatus } from "react-dom";

import {
  type LoginActionState,
  submitCredentials,
} from "@/features/auth/server/login-action";
import type { LoginContextView } from "@/features/auth/types";

const initialState: LoginActionState = {};

export function LoginForm({
  context,
}: {
  context: LoginContextView;
}): JSX.Element {
  const [state, formAction] = useFormState(submitCredentials, initialState);

  return (
    <form
      action={formAction}
      className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-6 shadow"
    >
      <input type="hidden" name="id" value={context.id} />
      <header className="space-y-1 text-center text-slate-50">
        <h1 className="text-xl font-semibold">サインイン</h1>
        <p className="text-sm text-slate-400">
          クライアント <span className="font-mono">{context.clientId}</span> に
          サインインします
        </p>
      </header>

      <div className="space-y-1">
        <label
          className="text-sm font-medium text-slate-200"
          htmlFor="username"
        >
          ユーザー名
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          defaultValue={context.loginHint ?? ""}
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
          required
        />
      </div>

      <div className="space-y-1">
        <label
          className="text-sm font-medium text-slate-200"
          htmlFor="password"
        >
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40"
          required
        />
      </div>

      <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
        <p className="font-semibold text-slate-200">要求されたスコープ</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {context.scopes.map((scope) => (
            <li
              key={scope}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-200"
            >
              {scope}
            </li>
          ))}
        </ul>
      </div>

      {state.error ? (
        <p className="text-sm font-medium text-rose-400">{state.error}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}

function SubmitButton(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="mt-2 inline-flex items-center justify-center rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
    >
      {pending ? "送信中..." : "サインイン"}
    </button>
  );
}
