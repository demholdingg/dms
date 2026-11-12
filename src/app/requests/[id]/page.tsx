import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelAction, decideAction, retryGrantAction, revokeAction } from "@/actions";
import ConfirmButton from "@/components/ConfirmButton";
import Flash from "@/components/Flash";
import StatusBadge from "@/components/StatusBadge";
import { EVENT_LABEL, daysLabel, fmtDate } from "@/lib/format";
import { canSeeAudit, requireSession } from "@/lib/session";
import { approversOf, canDecide, canViewRequest, getRequestFull } from "@/lib/workflow";

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const rid = Number(id);
  const f = Number.isInteger(rid) ? getRequestFull(rid) : null;
  // 404 yang sama untuk "tidak ada" dan "tidak berhak" agar tidak membocorkan keberadaan permintaan
  if (!f || !canViewRequest(f, s)) notFound();
  const { r, steps, events } = f;
  const isOwner = r.requester.toLowerCase() === s.username.toLowerCase();

  return (
    <>
      <h1>Permintaan #{r.id}</h1>
      <Flash />

      <div className="card">
        <dl className="kv">
          <dt>Status</dt>
          <dd>
            <StatusBadge status={r.status} />
          </dd>
          <dt>Dokumen</dt>
          <dd>
            #{r.doc_id} {r.doc_title}
            {r.status === "active" && (isOwner || s.isAdmin) && (
              <span style={{ marginLeft: 10 }}>
                <a href={`/api/documents/${r.doc_id}/preview`} target="_blank" rel="noopener noreferrer" className="badge ok">
                  Buka PDF
                </a>
              </span>
            )}
          </dd>
          <dt>Pemohon</dt>
          <dd>{r.requester}</dd>
          <dt>Alasan</dt>
          <dd style={{ whiteSpace: "pre-wrap" }}>{r.reason}</dd>
          <dt>Lama akses diminta</dt>
          <dd>{daysLabel(r.requested_days)}</dd>
          <dt>Kebijakan</dt>
          <dd>{r.policy_name ?? "-"}</dd>
          <dt>Diajukan</dt>
          <dd>{fmtDate(r.created_at)}</dd>
          {r.status === "active" && (
            <>
              <dt>Berlaku sampai</dt>
              <dd>{r.expires_at ? fmtDate(r.expires_at) : "Permanen"}</dd>
            </>
          )}
        </dl>
        {s.isAdmin && r.last_error && <pre className="err">{r.last_error}</pre>}
        {canSeeAudit(s) && (
          <p className="small">
            <Link href={`/admin/audit?doc=${r.doc_id}&user=${encodeURIComponent(r.requester)}`}>Lihat riwayat akses pemohon ke dokumen ini</Link>
          </p>
        )}
      </div>

      {r.status === "active" && (isOwner || s.isAdmin) && (
        <div className="card" style={{ background: "#f0f7ff", borderColor: "#b2ccff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, color: "#175cd3", fontSize: 16 }}>Akses Dokumen Aktif</div>
              <div className="muted-text small">Permintaan akses telah disetujui. Gunakan tautan berikut agar aktivitas akses tercatat:</div>
            </div>
            <div className="row" style={{ marginTop: 0 }}>
              <a className="btn" href={`/api/documents/${r.doc_id}/preview`} target="_blank" rel="noopener noreferrer">
                Lihat PDF
              </a>
              <a className="btn secondary" href={`/api/documents/${r.doc_id}/download`}>
                Unduh PDF
              </a>
            </div>
          </div>
        </div>
      )}

      <h2>Jenjang persetujuan</h2>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>Level</th><th>Approver</th><th>Status</th><th>Diputuskan oleh</th><th>Komentar</th></tr>
          </thead>
          <tbody>
            {steps.map((st) => (
              <tr key={st.id}>
                <td>{st.level}{st.label ? ` · ${st.label}` : ""}</td>
                <td>{approversOf(st).join(", ")}</td>
                <td>
                  {st.status === "approved" ? <span className="badge ok">Disetujui</span> : st.status === "rejected" ? <span className="badge bad">Ditolak</span> : r.status === "pending" && r.current_level === st.level ? <span className="badge warn">Menunggu</span> : <span className="badge muted">Belum</span>}
                </td>
                <td>{st.decided_by ? `${st.decided_by} (${fmtDate(st.decided_at)})` : "-"}</td>
                <td>{st.comment ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Tindakan</h2>
      <div className="card">
        {canDecide(f, s.username) && (
          <form action={decideAction}>
            <input type="hidden" name="request_id" value={r.id} />
            <input type="hidden" name="back" value="detail" />
            <label>
              Komentar (wajib jika menolak)
              <input type="text" name="comment" maxLength={1000} />
            </label>
            <div className="row">
              <button className="btn" type="submit" name="decision" value="approve">Setujui</button>
              <button className="btn danger" type="submit" name="decision" value="reject">Tolak</button>
            </div>
          </form>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          {r.status === "pending" && (isOwner || s.isAdmin) && (
            <form action={cancelAction}>
              <input type="hidden" name="request_id" value={r.id} />
              <ConfirmButton className="btn secondary" message="Batalkan permintaan ini?">Batalkan permintaan</ConfirmButton>
            </form>
          )}
          {r.status === "active" && (isOwner || s.isAdmin) && (
            <form action={revokeAction}>
              <input type="hidden" name="request_id" value={r.id} />
              <ConfirmButton className="btn danger" message="Cabut akses ke dokumen ini sekarang?">
                {isOwner ? "Lepas akses saya" : "Cabut akses"}
              </ConfirmButton>
            </form>
          )}
          {(r.status === "grant_failed" || r.status === "approved") && s.isAdmin && (
            <form action={retryGrantAction}>
              <input type="hidden" name="request_id" value={r.id} />
              <button className="btn" type="submit">Coba berikan akses lagi</button>
            </form>
          )}
        </div>
        {!canDecide(f, s.username) && r.status === "pending" && !isOwner && !s.isAdmin && (
          <p className="muted-text small">Anda tidak memiliki tindakan pada level yang sedang berjalan.</p>
        )}
      </div>

      <h2>Riwayat</h2>
      <ul className="timeline">
        {events.map((e) => (
          <li key={e.id}>
            <strong>{EVENT_LABEL[e.type] ?? e.type}</strong> · {e.actor} · <span className="muted-text small">{fmtDate(e.ts)}</span>
            {e.detail && <div className="muted-text small">{e.detail}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
