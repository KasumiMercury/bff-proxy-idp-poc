import {
  createHmac,
  timingSafeEqual as cryptoTimingSafeEqual,
  randomUUID,
} from "node:crypto";

import { getConfig } from "@/lib/config";

export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: number;
}

export interface SessionRecord {
  id: string;
  subject?: string;
  tokens: SessionTokens;
  userInfo?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

const SESSION_STORE_KEY = Symbol.for("bff.sessionStore");

type GlobalWithSessionStore = typeof globalThis & {
  [SESSION_STORE_KEY]?: Map<string, SessionRecord>;
};

const globalForSessionStore = globalThis as GlobalWithSessionStore;

let sessions = globalForSessionStore[SESSION_STORE_KEY];
if (!sessions) {
  sessions = new Map<string, SessionRecord>();
  // Store sessions on globalThis so route handlers and server components share them.
  globalForSessionStore[SESSION_STORE_KEY] = sessions;
}

const sessionStore = sessions;

export function createSession(params: {
  tokens: SessionTokens;
  userInfo?: Record<string, unknown>;
  subject?: string;
}): { id: string; cookieValue: string; record: SessionRecord } {
  purgeExpired();
  const { sessionTtlSeconds } = getConfig();
  const now = Date.now();
  const id = randomUUID();

  const record: SessionRecord = {
    id,
    subject: params.subject,
    tokens: params.tokens,
    userInfo: params.userInfo,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + sessionTtlSeconds * 1000,
  };

  sessionStore.set(id, record);

  return { id, cookieValue: signSessionId(id), record };
}

export function getSession(sessionId: string): SessionRecord | null {
  purgeExpired();
  const record = sessionStore.get(sessionId);
  if (!record) {
    return null;
  }
  if (record.expiresAt <= Date.now()) {
    sessionStore.delete(sessionId);
    return null;
  }
  return record;
}

export function getSessionFromCookie(
  cookieValue: string | undefined,
): SessionRecord | null {
  if (!cookieValue) {
    return null;
  }
  const sessionId = verifySessionCookie(cookieValue);
  if (!sessionId) {
    return null;
  }
  return getSession(sessionId);
}

export function updateSessionTokens(
  sessionId: string,
  tokens: SessionTokens,
): SessionRecord | null {
  const record = sessionStore.get(sessionId);
  if (!record) {
    return null;
  }
  const { sessionTtlSeconds } = getConfig();
  const now = Date.now();
  record.tokens = tokens;
  record.updatedAt = now;
  record.expiresAt = now + sessionTtlSeconds * 1000;
  sessionStore.set(sessionId, record);
  return record;
}

export function updateSessionUserInfo(
  sessionId: string,
  userInfo: Record<string, unknown>,
): SessionRecord | null {
  const record = sessionStore.get(sessionId);
  if (!record) {
    return null;
  }
  record.userInfo = userInfo;
  record.updatedAt = Date.now();
  sessionStore.set(sessionId, record);
  return record;
}

export function deleteSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

export function serializeSessionCookie(sessionId: string): string {
  return signSessionId(sessionId);
}

export function verifySessionCookie(cookieValue: string): string | null {
  const [id, signature] = cookieValue.split(".");
  if (!id || !signature) {
    return null;
  }
  const expected = createSignature(id);
  if (!timingSafeEqual(signature, expected)) {
    return null;
  }
  return id;
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, value] of sessionStore.entries()) {
    if (value.expiresAt <= now) {
      sessionStore.delete(key);
    }
  }
}

function signSessionId(id: string): string {
  const signature = createSignature(id);
  return `${id}.${signature}`;
}

function createSignature(id: string): string {
  const { sessionSecret } = getConfig();
  return createHmac("sha256", sessionSecret).update(id).digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return cryptoTimingSafeEqual(Buffer.from(a), Buffer.from(b));
}
