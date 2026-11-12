import { NextResponse } from "next/server";
import { searchDocuments } from "@/lib/paperless";
import { allow } from "@/lib/ratelimit";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Belum login" }, { status: 401 });
  if (!allow(`search:${s.username}`, 60, 60_000)) return NextResponse.json({ error: "Terlalu sering" }, { status: 429 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ hits: await searchDocuments(q.slice(0, 100)) });
  } catch (e) {
    console.error("[search]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Pencarian gagal" }, { status: 502 });
  }
}
