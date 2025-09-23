export function renderHomePage(props) {
    const { authenticated, userInfo, tokens, error } = props;
    const sessionExpires = tokens?.expiresAt
        ? new Date(tokens.expiresAt).toLocaleString()
        : "不明";
    const body = `
    <main class="container">
      <header>
        <h1>サンプル第三者クライアント</h1>
        <p>BFF の公開 API 経由で OAuth 認可コードフローを実行します。</p>
      </header>
      ${error ? `<p class="alert">${escapeHtml(error)}</p>` : ""}
      <section class="card">
        <h2>セッション状態</h2>
        <p class="status ${authenticated ? "ok" : "ng"}">
          ${authenticated ? "認証済み" : "未認証"}
        </p>
        ${authenticated ? `
          <dl>
            <div>
              <dt>アクセストークン有効期限</dt>
              <dd>${escapeHtml(sessionExpires)}</dd>
            </div>
          </dl>
          <form method="post" action="/auth/logout">
            <button type="submit">サインアウト</button>
          </form>
        ` : `
          <a class="button" href="/auth/login">サインインを開始</a>
        `}
      </section>
      ${authenticated ? renderUserInfo(userInfo) : ""}
      <section class="card">
        <h2>利用しているエンドポイント</h2>
        <ul>
          <li><code>/api/oidc/authorize</code></li>
          <li><code>/api/oidc/token</code></li>
          <li><code>/api/oidc/userinfo</code></li>
        </ul>
      </section>
    </main>
  `;
    return `
    <!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Third Client</title>
        <style>
          :root {
            color-scheme: light dark;
            font-family: system-ui, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
          }
          body {
            margin: 0;
            min-height: 100vh;
            background: linear-gradient(180deg, #0f172a 0%, #1e293b 100%);
          }
          .container {
            max-width: 720px;
            margin: 0 auto;
            padding: 2.5rem 1.5rem 4rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }
          header {
            text-align: left;
          }
          h1 {
            margin: 0;
            font-size: 2rem;
            font-weight: 600;
          }
          p {
            margin: 0.75rem 0 0;
            line-height: 1.6;
          }
          .card {
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 0.75rem;
            padding: 1.5rem;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.4);
          }
          .card h2 {
            margin-top: 0;
            font-size: 1.25rem;
            font-weight: 600;
          }
          dl {
            margin: 1rem 0 0;
          }
          dl div {
            display: flex;
            justify-content: space-between;
            padding: 0.25rem 0;
            border-bottom: 1px solid rgba(148, 163, 184, 0.15);
          }
          dt {
            font-weight: 600;
          }
          dd {
            margin: 0;
            font-family: "Menlo", "Consolas", monospace;
          }
          .button, button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.6rem 1.25rem;
            border-radius: 0.6rem;
            border: none;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            background: #38bdf8;
            color: #0f172a;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            box-shadow: 0 10px 20px rgba(56, 189, 248, 0.3);
          }
          .button:hover, button:hover {
            transform: translateY(-1px);
            box-shadow: 0 12px 24px rgba(56, 189, 248, 0.35);
          }
          .status {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 999px;
            font-weight: 600;
            margin-top: 0.75rem;
          }
          .status.ok {
            background: rgba(34, 197, 94, 0.2);
            color: #4ade80;
          }
          .status.ng {
            background: rgba(248, 113, 113, 0.2);
            color: #fca5a5;
          }
          .alert {
            background: rgba(248, 113, 113, 0.2);
            border: 1px solid rgba(248, 113, 113, 0.3);
            color: #fecaca;
            padding: 0.75rem 1rem;
            border-radius: 0.5rem;
          }
          pre {
            background: rgba(15, 23, 42, 0.85);
            border-radius: 0.75rem;
            padding: 1rem;
            overflow-x: auto;
            font-size: 0.9rem;
            line-height: 1.5;
            box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.1);
          }
          code {
            font-family: "Menlo", "Consolas", monospace;
          }
        </style>
      </head>
      <body>
        ${body}
      </body>
    </html>
  `;
}
function renderUserInfo(userInfo) {
    if (!userInfo) {
        return "";
    }
    return `
    <section class="card">
      <h2>ユーザー情報</h2>
      <pre>${escapeHtml(JSON.stringify(userInfo, null, 2))}</pre>
    </section>
  `;
}
function escapeHtml(input) {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
