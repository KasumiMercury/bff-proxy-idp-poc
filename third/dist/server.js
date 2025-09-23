import express from "express";
import session from "express-session";
import { loadConfig } from "./config.js";
import { buildAuthorizationUrl, createCodeChallenge, createCodeVerifier, createState, exchangeAuthorizationCode, fetchUserInfo, } from "./oidc.js";
import { renderHomePage } from "./render.js";
const config = loadConfig();
const app = express();
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false }));
app.use(session({
    name: config.sessionCookieName,
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.sessionCookieSecure,
    },
}));
app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
});
app.get("/", (req, res) => {
    const tokens = req.session.tokens;
    const isExpired = tokens?.expiresAt !== undefined && tokens.expiresAt <= Date.now();
    if (isExpired) {
        delete req.session.tokens;
        delete req.session.userInfo;
    }
    const authenticated = Boolean(req.session.tokens?.accessToken);
    const html = renderHomePage({
        authenticated,
        tokens: req.session.tokens,
        userInfo: req.session.userInfo,
        error: req.session.error,
    });
    if (req.session.error) {
        delete req.session.error;
    }
    res.status(200).send(html);
});
app.get("/auth/login", asyncHandler(async (req, res) => {
    const state = createState();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    req.session.oauthState = state;
    req.session.codeVerifier = codeVerifier;
    const authorizationUrl = await buildAuthorizationUrl(config, state, codeChallenge);
    res.redirect(authorizationUrl);
}));
app.get("/auth/callback", asyncHandler(async (req, res) => {
    const state = req.query.state;
    const code = req.query.code;
    const error = req.query.error;
    if (typeof error === "string") {
        req.session.error = `認可リクエストが失敗しました: ${error}`;
        return res.redirect("/");
    }
    if (typeof state !== "string" || state.length === 0) {
        req.session.error = "state パラメータが不足しています";
        return res.redirect("/");
    }
    if (state !== req.session.oauthState) {
        req.session.error = "state の検証に失敗しました";
        return res.redirect("/");
    }
    if (typeof code !== "string" || code.length === 0) {
        req.session.error = "code パラメータが不足しています";
        return res.redirect("/");
    }
    const codeVerifier = req.session.codeVerifier;
    if (!codeVerifier) {
        req.session.error = "code_verifier が見つかりません";
        return res.redirect("/");
    }
    try {
        const tokens = await exchangeAuthorizationCode(config, code, codeVerifier);
        req.session.tokens = tokens;
        req.session.oauthState = undefined;
        req.session.codeVerifier = undefined;
        try {
            const userInfo = await fetchUserInfo(config, tokens.accessToken);
            req.session.userInfo = userInfo;
        }
        catch (userinfoError) {
            console.error("failed to fetch userinfo", userinfoError);
            req.session.error = "ユーザー情報の取得に失敗しました";
        }
    }
    catch (tokenError) {
        console.error("token exchange failed", tokenError);
        req.session.error = "トークンエンドポイントでエラーが発生しました";
        req.session.tokens = undefined;
        req.session.userInfo = undefined;
    }
    res.redirect("/");
}));
app.post("/auth/logout", (req, res, next) => {
    req.session.tokens = undefined;
    req.session.userInfo = undefined;
    req.session.oauthState = undefined;
    req.session.codeVerifier = undefined;
    req.session.error = undefined;
    req.session.destroy((destroyError) => {
        if (destroyError) {
            console.error("failed to destroy session", destroyError);
            return next(destroyError);
        }
        res.redirect("/");
    });
});
app.use((error, _req, res, _next) => {
    console.error("unhandled error", error);
    res.status(500).send("internal error");
});
app.listen(config.port, () => {
    console.log(`third-party client listening on http://localhost:${config.port}`);
});
function asyncHandler(handler) {
    return (req, res, next) => {
        handler(req, res).catch(next);
    };
}
