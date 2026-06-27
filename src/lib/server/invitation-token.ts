import crypto from "crypto";

export type InvitationPayload = {
  name: string;
  email: string;
  temporaryPassword: string;
  createdAt: string;
  expiresAt: string;
};

function getKey() {
  const secret = process.env.ENCRYPTION_KEY;

  if (!secret) {
    throw new Error("ENCRYPTION_KEY no está configurada.");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

export function createInvitationToken(payload: InvitationPayload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function readInvitationToken(token: string): InvitationPayload {
  const data = Buffer.from(token, "base64url");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);

  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  const payload = JSON.parse(decrypted) as InvitationPayload;

  if (new Date(payload.expiresAt).getTime() < Date.now()) {
    throw new Error("La invitación expiró.");
  }

  return payload;
}
