import { createHmac } from "node:crypto";

export type SignedPayload<T> = {
  payload: T;
  issuedAt: number;
};

export function encodeSignedCookie<T>(
  data: SignedPayload<T>,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = createSignature(payload, secret);
  return `${payload}.${signature}`;
}

export function decodeSignedCookie<T>(
  value: string | undefined,
  secret: string,
): SignedPayload<T> | null {
  if (!value) {
    return null;
  }

  const parts = value.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;
  const expected = createSignature(payload, secret);
  if (!timingSafeCompare(signature, expected)) {
    return null;
  }

  try {
    const json = Buffer.from(payload, "base64url").toString();
    return JSON.parse(json) as SignedPayload<T>;
  } catch (error) {
    console.error("Failed to decode signed cookie", error);
    return null;
  }
}

function createSignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
