import type {JSX} from "react";

interface ErrorPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default function ErrorPage({
  searchParams,
}: ErrorPageProps): JSX.Element {
  const messageParam = searchParams.message;
  const message = Array.isArray(messageParam) ? messageParam[0] : messageParam;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-50">
      <div className="max-w-xl rounded-lg border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-red-300">
          サインインに失敗しました
        </h1>
        <p className="mt-4 text-sm text-slate-200">
          {message ??
            "エラー"}
        </p>
        <a
          href="/"
          className="mt-6 inline-flex rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700"
        >
          トップ
        </a>
      </div>
    </div>
  );
}
