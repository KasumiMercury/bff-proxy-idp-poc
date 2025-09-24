"use server";

import { redirect } from "next/navigation";

import { getConfig } from "@/lib/config";

export interface LoginActionState {
  error?: string;
}

export async function submitCredentials(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const id = formData.get("id");
  const username = formData.get("username");
  const password = formData.get("password");

  if (typeof id !== "string" || id.length === 0) {
    return { error: "認証リクエストが見つかりません" };
  }
  if (typeof username !== "string" || typeof password !== "string") {
    return { error: "ユーザー名とパスワードを入力してください" };
  }

  const { issuer } = getConfig();
  const loginUrl = new URL("/login/username", issuer);

  let response: Response;
  try {
    response = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ id, username, password }),
      cache: "no-store",
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "IDP への接続に失敗しました",
    };
  }

  if (!response.ok) {
    let message = "サインインに失敗しました";
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) {
        message = data.error;
      }
    } catch (_error) {
      // ignore malformed body
    }
    return { error: message };
  }

  try {
    const data = (await response.json()) as { next?: string };
    const nextPath = data?.next ?? "/";
    const target = new URL(nextPath, issuer);
    redirect(target.toString());
  } catch (_error) {
    return { error: "サインインに失敗しました" };
  }
}
