import "express-session";

declare module "express-session" {
  interface SessionData {
    oauthState?: string;
    codeVerifier?: string;
    tokens?: {
      accessToken: string;
      refreshToken?: string;
      idToken?: string;
      expiresAt?: number;
      tokenType?: string;
      scope?: string;
    };
    userInfo?: Record<string, unknown>;
    error?: string;
  }
}
