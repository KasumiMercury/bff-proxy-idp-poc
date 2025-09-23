import { createHash, randomBytes } from "node:crypto";

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function randomUrlSafe(size: number): string {
  return toBase64Url(randomBytes(size));
}

export function generateCodeVerifier(): string {
  return randomUrlSafe(96);
}

export function generateCodeChallenge(verifier: string): string {
  return toBase64Url(createHash("sha256").update(verifier).digest());
}

export function generateState(): string {
  return randomUrlSafe(32);
}

export function generateNonce(): string {
  return randomUrlSafe(32);
}
