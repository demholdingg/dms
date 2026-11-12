import {
  listActivities,
  type ActivityCategory,
  type ActivityRow,
} from "@/lib/db";
import {
  ACTIVITY_ACTION_LABEL,
  ACTIVITY_CATEGORY_LABEL,
  fmtDate,
} from "@/lib/format";

export type ExportColumn = { header: string; key: string; width?: number };
export type ExportRow = Record<string, string | number>;

const BATCH_SIZE = 500;

export async function loadAllActivities(
  filters: Parameters<typeof listActivities>[0],
): Promise<ActivityRow[]> {
  const rows: ActivityRow[] = [];
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const batch = listActivities({ ...filters, limit: BATCH_SIZE, offset }).rows;
    rows.push(...batch);
    if (batch.length < BATCH_SIZE) return rows;
  }
}

export function activityFilters(url: URL, accessOnly = false) {
  const category = accessOnly ? "ACCESS" : limitParam(url.searchParams.get("category"));
  const action = limitParam(url.searchParams.get("action"));
  const actor = limitParam(url.searchParams.get("actor"));
  const doc = limitParam(url.searchParams.get("doc") ?? url.searchParams.get("docId"));
  const docId = doc && /^\d+$/.test(doc) ? Number(doc) : undefined;
  const q = limitParam(url.searchParams.get("q")) || (!docId ? doc : "");
  return {
    category: category || undefined,
    action: action || undefined,
    actor: actor || undefined,
    docId,
    q: q || undefined,
  };
}

function limitParam(value: string | null): string {
  return (value ?? "").trim().slice(0, 200);
}

export function activityExportData(rows: ActivityRow[], accessOnly = false): {
  columns: ExportColumn[];
  data: ExportRow[];
} {
  const columns: ExportColumn[] = accessOnly
    ? [
        { header: "Waktu", key: "timestamp", width: 24 },
        { header: "Pengguna", key: "actor", width: 22 },
        { header: "Aksi", key: "action", width: 18 },
        { header: "ID Dokumen", key: "docId", width: 14 },
        { header: "Judul Dokumen", key: "docTitle", width: 36 },
        { header: "ID Permintaan", key: "requestId", width: 16 },
        { header: "Detail", key: "details", width: 42 },
      ]
    : [
        { header: "Waktu", key: "timestamp", width: 24 },
        { header: "Kategori", key: "category", width: 22 },
        { header: "Aksi", key: "action", width: 28 },
        { header: "ID Dokumen", key: "docId", width: 14 },
        { header: "Judul Dokumen", key: "docTitle", width: 36 },
        { header: "Aktor", key: "actor", width: 22 },
        { header: "Target User", key: "targetUser", width: 22 },
        { header: "ID Permintaan", key: "requestId", width: 16 },
        { header: "Detail", key: "details", width: 42 },
      ];

  const data = rows.map((row) => ({
    timestamp: fmtDate(row.created_at),
    category: ACTIVITY_CATEGORY_LABEL[row.category as ActivityCategory] || row.category,
    action: ACTIVITY_ACTION_LABEL[row.action] || row.action,
    docId: row.doc_id ?? "",
    docTitle: row.doc_title ?? "",
    actor: row.actor,
    targetUser: row.target_user ?? "",
    requestId: row.request_id ?? "",
    details: row.details ?? "",
  }));
  return { columns, data };
}
