import Link from "next/link";
import { decideAction } from "@/actions";
import Flash from "@/components/Flash";
import { daysLabel, fmtDate } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { pendingFor } from "@/lib/workflow";

export default async function Approvals() {
  const s = await requireSession();
  const items = pendingFor(s.username);
  return (
    <>
      <h1>Menunggu persetujuan Anda</h1>
      <Flash />
      {items.length === 0 && <p className="muted-text">Tidak ada permintaan yang menunggu keputusan Anda.</p>}
      {items.map((r) => (
        <div className="card" key={r.id}>
          <div>
            <strong>
              <Link href={`/requests/${r.id}`}>#{r.id}</Link> · {r.requester}
            </strong>{" "}
            meminta akses ke <strong>#{r.doc_id} {r.doc_title}</strong>
          </div>
          <div className="muted-text small">
            Level {r.current_level}
            {r.step_label ? ` (${r.step_label})` : ""} · {daysLabel(r.requested_days)} · diajukan {fmtDate(r.created_at)} · kebijakan {r.policy_name}
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{r.reason}</p>
          <form action={decideAction}>
            <input type="hidden" name="request_id" value={r.id} />
            <label>
              Komentar (wajib jika menolak)
              <input type="text" name="comment" maxLength={1000} />
            </label>
            <div className="row">
              <button className="btn" type="submit" name="decision" value="approve">Setujui</button>
              <button className="btn danger" type="submit" name="decision" value="reject">Tolak</button>
            </div>
          </form>
        </div>
      ))}
    </>
  );
}
