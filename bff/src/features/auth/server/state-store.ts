import { getConfig } from "@/lib/config";

export interface PendingAuth {
  codeVerifier: string;
  nonce: string;
  redirectTo: string;
  createdAt: number;
}

const AUTH_STATE_STORE_KEY = Symbol.for("bff.authStateStore");

type GlobalWithAuthStateStore = typeof globalThis & {
  [AUTH_STATE_STORE_KEY]?: Map<string, PendingAuth>;
};

const globalForAuthState = globalThis as GlobalWithAuthStateStore;

let pendingStore = globalForAuthState[AUTH_STATE_STORE_KEY];
if (!pendingStore) {
  pendingStore = new Map<string, PendingAuth>();
  // Persist pending auth records across module instances.
  globalForAuthState[AUTH_STATE_STORE_KEY] = pendingStore;
}

const pending = pendingStore;

export function storeAuthRequest(params: {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectTo: string;
}): void {
  purgeExpired();
  pending.set(params.state, {
    codeVerifier: params.codeVerifier,
    nonce: params.nonce,
    redirectTo: params.redirectTo,
    createdAt: Date.now(),
  });
}

export function consumeAuthState(state: string): PendingAuth | null {
  purgeExpired();
  const record = pending.get(state);
  if (!record) {
    return null;
  }
  pending.delete(state);
  return record;
}

function purgeExpired(): void {
  const { stateTtlSeconds } = getConfig();
  const expiresBefore = Date.now() - stateTtlSeconds * 1000;
  for (const [key, value] of pending.entries()) {
    if (value.createdAt < expiresBefore) {
      pending.delete(key);
    }
  }
}
