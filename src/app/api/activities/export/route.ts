import { NextResponse } from "next/server";
import { listActivities } from "@/lib/db";
import { ACTIVITY_ACTION_LABEL, ACTIVITY_CATEGORY_LABEL, fmtDate } from "@/lib/format";
import { getSession } from "@/lib/session";

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || !s.isAdmin) {
    return new NextResponse("Tidak berhak", { status: 403 });
  }

  const url = new URL(req.url);
  const category = url.searchParams.get("category") || undefined;
  const action = url.searchParams.get("action") || undefined;
  const actor = url.searchParams.get("actor") || undefined;
  const docIdRaw = url.searchParams.get("docId");
  const docId = docIdRaw ? Number(docIdRaw) : undefined;
  const q = url.searchParams.get("q") || undefined;

  const { rows } = listActivities({
    category,
    action,
    actor,
    docId,
    q,
    limit: 5000,
    offset: 0,
  });

  const headers = [
    "Waktu",
    "Kategori",
    "Aksi",
    "ID Dokumen",
    "Judul Dokumen",
    "Aktor",
    "Target User",
    "ID Permintaan",
    "Detail",
  ];

  const lines = [headers.join(",")];

  for (const r of rows) {
    const line = [
      escapeCsv(fmtDate(r.created_at)),
      escapeCsv(ACTIVITY_CATEGORY_LABEL[r.category] || r.category),
      escapeCsv(ACTIVITY_ACTION_LABEL[r.action] || r.action),
      escapeCsv(r.doc_id ?? ""),
      escapeCsv(r.doc_title ?? ""),
      escapeCsv(r.actor),
      escapeCsv(r.target_user ?? ""),
      escapeCsv(r.request_id ?? ""),
      escapeCsv(r.details ?? ""),
    ];
    lines.push(line.join(","));
  }

  const csvContent = lines.join("\r\n");

  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="riwayat-aktivitas.csv"',
      "Cache-Control": "no-store",
    },
  });
}

