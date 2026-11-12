import { NextResponse } from "next/server";
import { db, recordActivity } from "@/lib/db";
import { getDocument, getDocumentFile } from "@/lib/paperless";
import { getSession } from "@/lib/session";
import { canAccessDocument } from "@/lib/workflow";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const s = await getSession();
  if (!s) return new NextResponse("Belum login", { status: 401 });

  const { id, action } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId) || docId <= 0) {
    return new NextResponse("ID Dokumen tidak valid", { status: 400 });
  }

  if (action !== "preview" && action !== "download") {
    return new NextResponse("Aksi tidak valid (hanya preview atau download)", { status: 404 });
  }

  const allowed = canAccessDocument(docId, s);
  if (!allowed) {
    return new NextResponse("Anda tidak memiliki izin aktif untuk mengakses dokumen ini", { status: 403 });
  }

  try {
    const [file, doc] = await Promise.all([getDocumentFile(docId, action), getDocument(docId)]);
    const accessRequest = db()
      .prepare("SELECT id, doc_title FROM requests WHERE doc_id=? AND lower(requester)=? AND status='active' ORDER BY id DESC LIMIT 1")
      .get(docId, s.username.toLowerCase()) as { id: number; doc_title: string | null } | undefined;
    const headers = new Headers();
    headers.set("Content-Type", file.contentType);
    const disposition = action === "download" ? "attachment" : "inline";
    const filename = file.filename || `dokumen-${docId}.pdf`;
    headers.set("Content-Disposition", `${disposition}; filename="${filename}"`);
    headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");

    recordActivity({
      category: "ACCESS",
      action: action === "preview" ? "DOC_VIEWED" : "DOC_DOWNLOADED",
      docId,
      docTitle: doc?.title || accessRequest?.doc_title || filename,
      actor: s.username,
      requestId: accessRequest?.id,
      details: action === "preview" ? "Melihat dokumen (preview PDF)" : "Mengunduh file dokumen PDF",
    });

    return new Response(new Uint8Array(file.buffer), { status: 200, headers });
  } catch (e) {
    console.error("[document-file]", e);
    return new NextResponse("Gagal mengambil file dokumen dari Paperless", { status: 502 });
  }
}
