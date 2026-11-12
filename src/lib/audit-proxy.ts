import { NextResponse } from "next/server";
import { env } from "./env";
import { canSeeAudit, getSession } from "./session";

/** Teruskan permintaan ke layanan audit dengan API key; hanya untuk superuser / AUDIT_VIEWERS. */
export async function proxyAudit(req: Request, path: string, asCsv: boolean): Promise<Response> {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Belum login" }, { status: 401 });
  if (!canSeeAudit(s)) return NextResponse.json({ error: "Tidak berhak" }, { status: 403 });
  if (!env.auditKey) return NextResponse.json({ error: "AUDIT_API_KEY belum diisi di portal" }, { status: 503 });

  const url = new URL(req.url);
  // hanya parameter filter yang dikenal yang diteruskan
  const out = new URLSearchParams();
  for (const k of ["from", "to", "user", "doc", "action", "status", "limit", "offset"]) {
    const v = url.searchParams.get(k);
    if (v) out.set(k, v.slice(0, 200));
  }
  try {
    const r = await fetch(`${env.auditUrl}${path}?${out}`, {
      headers: { "X-Audit-Key": env.auditKey },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return NextResponse.json({ error: `Layanan audit menjawab ${r.status}` }, { status: 502 });
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (asCsv) {
      headers["Content-Type"] = "text/csv; charset=utf-8";
      headers["Content-Disposition"] = 'attachment; filename="audit-dokumen.csv"';
    } else {
      headers["Content-Type"] = "application/json";
    }
    return new Response(await r.arrayBuffer(), { headers });
  } catch {
    return NextResponse.json({ error: "Layanan audit tidak dapat dihubungi" }, { status: 502 });
  }
}
