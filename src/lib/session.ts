import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { signSession, verifySession } from "./token";

export const COOKIE = "ap_session";

export type Session = { username: string; id: number; isAdmin: boolean };

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const d = verifySession(jar.get(COOKIE)?.value, env.sessionSecret);
  return d ? { username: d.u, id: d.id, isAdmin: d.a } : null;
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireSession();
  if (!s.isAdmin) redirect("/unauthorized");
  return s;
}

export async function startSession(u: Session): Promise<void> {
  const maxAge = Math.round(env.sessionHours * 3600);
  const token = signSession(
    { u: u.username, id: u.id, a: u.isAdmin, exp: Math.floor(Date.now() / 1000) + maxAge },
    env.sessionSecret,
  );
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.cookieSecure, path: "/", maxAge });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Boleh melihat laporan audit akses? Superuser atau username di AUDIT_VIEWERS. */
export function canSeeAudit(s: Session): boolean {
  return s.isAdmin || env.auditViewers.has(s.username.toLowerCase());
}
