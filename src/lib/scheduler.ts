import { getSystemKv, recordActivity, setSystemKv } from "./db";
import { getRecentDocuments } from "./paperless";
import { expireDue, retryPendingGrants } from "./workflow";

const g = globalThis as unknown as { __approvalSched?: NodeJS.Timeout };

/** Polling dokumen baru dari Paperless-ngx dan mencatatnya ke activity_logs */
export async function syncNewDocumentsFromPaperless(): Promise<number> {
  try {
    const docs = await getRecentDocuments(30);
    if (!docs.length) return 0;

    const lastSyncedRaw = getSystemKv("last_synced_doc_id");
    const highestId = Math.max(...docs.map((d) => d.id));

    // Jika pertama kali dijalankan (belum ada pointer), catat baseline (maks 10 terbaru) dan inisialisasi pointer
    if (lastSyncedRaw === null) {
      const initialBatch = [...docs].sort((a, b) => a.id - b.id).slice(-10);
      for (const d of initialBatch) {
        recordActivity({
          category: "DOCUMENT",
          action: "DOC_ADDED",
          docId: d.id,
          docTitle: d.title,
          actor: d.ownerName ?? "Paperless",
          details: `Dokumen terdata di DMS. Tipe: ${d.typeName ?? "-"}, Koresponden: ${d.correspondent ?? "-"}, Status: ${d.locked ? "Terkunci (Ada Owner)" : "Terbuka (Tanpa Owner)"}`,
        });
      }
      setSystemKv("last_synced_doc_id", String(highestId));
      return initialBatch.length;
    }

    const lastSyncedId = Number(lastSyncedRaw);
    const newDocs = docs.filter((d) => d.id > lastSyncedId).sort((a, b) => a.id - b.id);

    for (const d of newDocs) {
      recordActivity({
        category: "DOCUMENT",
        action: "DOC_ADDED",
        docId: d.id,
        docTitle: d.title,
        actor: d.ownerName ?? "Paperless",
        details: `Dokumen baru terdeteksi di Paperless. Tipe: ${d.typeName ?? "-"}, Koresponden: ${d.correspondent ?? "-"}, Status: ${d.locked ? "Terkunci (Ada Owner)" : "Terbuka (Tanpa Owner)"}`,
      });
    }

    if (highestId > lastSyncedId) {
      setSystemKv("last_synced_doc_id", String(highestId));
    }

    return newDocs.length;
  } catch (e) {
    console.error("[scheduler-poll-docs] gagal sinkronisasi dokumen:", e instanceof Error ? e.message : e);
    return 0;
  }
}

async function tick(): Promise<void> {
  try {
    await retryPendingGrants();
    await expireDue();
    await syncNewDocumentsFromPaperless();
  } catch (e) {
    console.error("[scheduler]", e instanceof Error ? e.message : e);
  }
}

/** Jalan tiap menit di dalam proses server: cabut akses kedaluwarsa, ulangi pemberian yang gagal, & poll dokumen baru. */
export function startScheduler(): void {
  if (g.__approvalSched) return;
  g.__approvalSched = setInterval(() => void tick(), 60_000);
  g.__approvalSched.unref?.();
  setTimeout(() => void tick(), 10_000).unref?.();
  console.log("[scheduler] aktif (interval 60 detik)");
}
