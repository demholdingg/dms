import Link from "next/link";
import { syncDocumentsAction } from "@/actions";
import Flash from "@/components/Flash";
import { countRecentActivities, listActivities } from "@/lib/db";
import {
  ACTIVITY_ACTION_LABEL,
  ACTIVITY_ACTION_TONE,
  ACTIVITY_CATEGORY_LABEL,
  fmtDate,
} from "@/lib/format";
import { one, type SP } from "@/lib/params";
import { requireAdmin } from "@/lib/session";

const PAGE_SIZE = 50;

export default async function AdminActivitiesPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;

  const category = one(sp.category) || "all";
  const action = one(sp.action) || "all";
  const q = one(sp.q) || "";
  const page = Math.max(0, parseInt(one(sp.page) || "0", 10) || 0);

  const { rows, total } = listActivities({
    category,
    action,
    q,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const recent = countRecentActivities();

  const qs = (extra: Record<string, string | number> = {}) => {
    const p = new URLSearchParams();
    if (category && category !== "all") p.set("category", category);
    if (action && action !== "all") p.set("action", action);
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(extra)) {
      p.set(k, String(v));
    }
    return p.toString();
  };

  const from = total ? page * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>Riwayat Aktivitas Sistem</h1>
        <form action={syncDocumentsAction}>
          <button className="btn secondary" type="submit">
            🔄 Sinkronkan Dokumen DMS Sekarang
          </button>
        </form>
      </div>

      <Flash />

      {/* Ringkasan Statistik 7 Hari Terakhir */}
      <div className="grid">
        <div className="card">
          <div className="stat">{recent.docCount}</div>
          <div>Dokumen DMS Terdeteksi (7 hari)</div>
          <span className="small muted-text">Otomatis dipoll dari Paperless</span>
        </div>
        <div className="card">
          <div className="stat">{recent.reqCount}</div>
          <div>Aktivitas Permintaan Akses (7 hari)</div>
          <span className="small muted-text">Pengajuan & pembatalan oleh user</span>
        </div>
        <div className="card">
          <div className="stat">{recent.approvalCount}</div>
          <div>Keputusan Persetujuan (7 hari)</div>
          <span className="small muted-text">Approval bertingkat approver</span>
        </div>
      </div>

      {/* Filter & Pencarian */}
      <form className="card row" method="get">
        <label>
          Kategori
          <select name="category" defaultValue={category}>
            <option value="all">Semua Kategori</option>
            {Object.entries(ACTIVITY_CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>

        <label>
          Tipe Aktivitas
          <select name="action" defaultValue={action}>
            <option value="all">Semua Aksi</option>
            {Object.entries(ACTIVITY_ACTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>

        <label style={{ flex: 1, minWidth: 200 }}>
          Pencarian (Dokumen, User, Aktor, Keterangan)
          <input type="text" name="q" defaultValue={q} placeholder="Ketik kata kunci pencarian..." />
        </label>

        <button className="btn" type="submit">Filter</button>
        <Link className="btn secondary" href="/admin/activities">Reset</Link>
        <a className="btn secondary" href={"/api/activities/export/xlsx?" + qs()}>Export Excel</a>
        <a className="btn secondary" href={"/api/activities/export/pdf?" + qs()}>Export PDF</a>
      </form>

      {/* Kontrol Navigasi & Paginasi */}
      <div className="row" style={{ margin: "10px 0", justifyContent: "space-between" }}>
        <span className="muted-text">{from}-{to} dari {total} total kejadian</span>
        <span className="row">
          <Link
            className={`btn secondary ${page === 0 ? "disabled" : ""}`}
            style={page === 0 ? { pointerEvents: "none", opacity: 0.5 } : {}}
            href={`/admin/activities?${qs({ page: page - 1 })}`}
          >
            &laquo; Sebelumnya
          </Link>
          <Link
            className={`btn secondary ${(page + 1) * PAGE_SIZE >= total ? "disabled" : ""}`}
            style={(page + 1) * PAGE_SIZE >= total ? { pointerEvents: "none", opacity: 0.5 } : {}}
            href={`/admin/activities?${qs({ page: page + 1 })}`}
          >
            Berikutnya &raquo;
          </Link>
        </span>
      </div>

      {/* Tabel Data Aktivitas */}
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Kategori</th>
              <th>Aktivitas</th>
              <th>Dokumen</th>
              <th>Aktor</th>
              <th>Target User</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>
                  Belum ada riwayat aktivitas yang tercatat sesuai filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const actionLabel = ACTIVITY_ACTION_LABEL[r.action] || r.action;
                const tone = ACTIVITY_ACTION_TONE[r.action] || "muted";
                const catLabel = ACTIVITY_CATEGORY_LABEL[r.category] || r.category;

                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }} className="small">
                      {fmtDate(r.created_at)}
                    </td>
                    <td>
                      <span className="badge muted small">{catLabel}</span>
                    </td>
                    <td>
                      <span className={`badge ${tone}`}>
                        {actionLabel}
                      </span>
                    </td>
                    <td>
                      {r.doc_id ? (
                        <div>
                          <strong>#{r.doc_id}</strong> {r.doc_title || "-"}
                          {r.request_id && (
                            <div className="small">
                              <Link href={`/requests/${r.request_id}`}>Lihat Permintaan #{r.request_id}</Link>
                            </div>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <strong>{r.actor}</strong>
                    </td>
                    <td>
                      {r.target_user ? r.target_user : "-"}
                    </td>
                    <td className="small" style={{ maxWidth: 320, whiteSpace: "pre-wrap" }}>
                      {r.details || "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
