import { NextResponse } from "next/server";
import { getSystemKv, recordActivity, setSystemKv } from "@/lib/db";

/**
 * Webhook endpoint untuk Paperless-ngx.
 * Menerima sinyal event seperti Document Added atau Document Updated dari Workflow Paperless.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => null);
    if (!raw) return NextResponse.json({ error: "Payload JSON tidak valid" }, { status: 400 });

    const docId = Number(raw.document?.id ?? raw.id);
    const docTitle = String(raw.document?.title ?? raw.title ?? (docId ? `Dokumen #${docId}` : "Dokumen"));
    const owner = raw.document?.owner ?? raw.owner;
    const actor = typeof owner === "string" ? owner : owner ? `User #${owner}` : "Paperless";

    if (Number.isInteger(docId) && docId > 0) {
      recordActivity({
        category: "DOCUMENT",
        action: "DOC_ADDED",
        docId,
        docTitle,
        actor,
        details: `Dokumen diterima via webhook Paperless. Status: ${raw.document?.owner ? "Terkunci" : "Terbuka"}`,
      });

      const lastSynced = getSystemKv("last_synced_doc_id");
      if (!lastSynced || docId > Number(lastSynced)) {
        setSystemKv("last_synced_doc_id", String(docId));
      }
    }

    return NextResponse.json({ ok: true, docId });
  } catch (e) {
    console.error("[paperless-webhook]", e);
    return NextResponse.json({ error: "Gagal memproses webhook" }, { status: 500 });
  }
}

