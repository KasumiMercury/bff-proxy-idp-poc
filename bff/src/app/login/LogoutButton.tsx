"use client";

type LogoutButtonProps = {
  returnTo?: string;
};

export function LogoutButton({ returnTo = "/" }: LogoutButtonProps) {
  const handleClick = () => {
    const target = new URL("/api/internal/auth/logout", window.location.origin);
    if (returnTo && returnTo !== "/") {
      target.searchParams.set("returnTo", returnTo);
    }
    window.location.href = target.toString();
  };

  return (
    <button
      type="button"
      className="rounded bg-rose-500 px-4 py-2 font-semibold text-slate-50 transition hover:bg-rose-400"
      onClick={handleClick}
    >
      ログアウト
    </button>
  );
}

export default LogoutButton;
