import type { JSX } from "react";

export default async function Home(): Promise<JSX.Element> {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pb-16 pt-16">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
            OIDC BFF PoC
          </p>
        </header>
      </div>
    </div>
  );
}
