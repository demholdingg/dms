import crypto from "node:crypto";

export type SessionData = { u: string; id: number; a: boolean; exp: number };

export function signSession(d: SessionData, secret: string): string {
  const body = Buffer.from(JSON.stringify(d)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySession(
  token: string | undefined,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): SessionData | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionData;
    if (typeof d.u !== "string" || typeof d.id !== "number" || typeof d.exp !== "number") return null;
    if (d.exp <= nowSec) return null;
    return d;
  } catch {
    return null;
  }
}
