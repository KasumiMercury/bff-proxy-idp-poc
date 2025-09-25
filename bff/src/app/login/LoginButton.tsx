"use client";

type LoginButtonProps = {
  returnTo?: string;
};

export function LoginButton({ returnTo = "/" }: LoginButtonProps) {
  const handleClick = () => {
    const target = new URL("/api/internal/auth/login", window.location.origin);
    if (returnTo && returnTo !== "/") {
      target.searchParams.set("returnTo", returnTo);
    }
    window.location.href = target.toString();
  };

  return (
    <button
      type="button"
      className="rounded bg-slate-200 px-4 py-2 font-semibold text-slate-900 transition hover:bg-slate-300"
      onClick={handleClick}
    >
      ログイン
    </button>
  );
}

export default LoginButton;
