import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ROOT_COOKIE = "rss-root-authorization";

function rootSignature() {
  const username = process.env.ROOT_USERNAME ?? process.env.NEXT_PUBLIC_ROOT_USERNAME;
  const password = process.env.ROOT_PASSWORD ?? process.env.NEXT_PUBLIC_ROOT_PASSWORD;
  if (!username || !password) return null;
  return createHmac("sha256", password).update(`root:${username.trim().toLowerCase()}`).digest("hex");
}

export async function setRootAuthorization(enabled: boolean) {
  const cookieStore = await cookies();
  const signature = enabled ? rootSignature() : null;
  if (!signature) {
    cookieStore.delete(ROOT_COOKIE);
    return;
  }
  cookieStore.set(ROOT_COOKIE, signature, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function hasRootAuthorization() {
  const expected = rootSignature();
  const received = (await cookies()).get(ROOT_COOKIE)?.value;
  if (!expected || !received || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
