import { createHmac, timingSafeEqual } from "node:crypto";

function cleanSignature(value: string) {
  return value.trim().replace(/^sha256=/i, "");
}

export function signBody(rawBody: string, secret: string) {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function signaturesMatch(received: string | null, expected: string) {
  if (!received) return false;
  const left = Buffer.from(cleanSignature(received), "utf8");
  const right = Buffer.from(cleanSignature(expected), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifySignedBody(rawBody: string, received: string | null, secret?: string) {
  if (!secret) return process.env.NODE_ENV !== "production";
  return signaturesMatch(received, signBody(rawBody, secret));
}

export function verifyTimestamp(timestamp: string | null, maxAgeSeconds = 300) {
  if (!timestamp) return true;
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) return false;
  const milliseconds = parsed < 10_000_000_000 ? parsed * 1000 : parsed;
  return Math.abs(Date.now() - milliseconds) <= maxAgeSeconds * 1000;
}
