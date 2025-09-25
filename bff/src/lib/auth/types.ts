export type LoginStatePayload = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
};

export type TokenCookiePayload = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  scope?: string;
  tokenType?: string;
  expiresAt?: number;
};
