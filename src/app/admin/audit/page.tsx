import Link from "next/link";
import { redirect } from "next/navigation";
import AccessHistoryTable from "@/components/AccessHistoryTable";
import { listActivities } from "@/lib/db";
import { one, type SP } from "@/lib/params";
import { canSeeAudit, requireSession } from "@/lib/session";

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: SP }) {
  const s = await requireSession();
  if (!canSeeAudit(s)) redirect("/unauthorized");
  const sp = await searchParams;
  const actor = one(sp.actor) || one(sp.user);
  const doc = one(sp.doc);
  const action = one(sp.action) || "all";
  const page = Math.max(0, parseInt(one(sp.page) || "0", 10) || 0);
  const docId = /^\d+$/.test(doc) ? Number(doc) : undefined;
  const { rows, total } = listActivities({
    category: "ACCESS",
    actor,
    docId,
    q: docId ? undefined : doc,
    action,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const from = total ? page * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const href = (nextPage: number) => {
    const params = new URLSearchParams();
    if (actor) params.set("actor", actor);
    if (doc) params.set("doc", doc);
    if (action !== "all") params.set("action", action);
    params.set("page", String(nextPage));
    return `/admin/audit?${params}`;
  };

  return (
    <>
      <h1>Audit akses dokumen</h1>
      <p className="muted-text">
        Riwayat lihat dan unduh dokumen melalui portal, termasuk pengguna dan waktu akses. Akses langsung melalui Paperless tidak tercatat di sini.
      </p>

      <form className="card row" method="get">
        <label>
          Pengguna
          <input type="text" name="actor" defaultValue={actor} placeholder="username" />
        </label>
        <label>
          Dokumen (ID / judul)
          <input type="text" name="doc" defaultValue={doc} placeholder="ID dokumen" />
        </label>
        <label>
          Aksi
          <select name="action" defaultValue={action}>
            <option value="all">Lihat dan unduh</option>
            <option value="DOC_VIEWED">Lihat</option>
            <option value="DOC_DOWNLOADED">Unduh</option>
          </select>
        </label>
        <button className="btn" type="submit">Filter</button>
        <Link className="btn secondary" href="/admin/audit">Reset</Link>
        <a className="btn secondary" href={`/api/audit/export/xlsx?${href(0).split("?")[1]}`}>Export Excel</a>
        <a className="btn secondary" href={`/api/audit/export/pdf?${href(0).split("?")[1]}`}>Export PDF</a>
      </form>

      <div className="row" style={{ margin: "8px 0", justifyContent: "space-between" }}>
        <span className="muted-text">{from}-{to} dari {total} kejadian</span>
        <span className="row">
          <Link
            className="btn secondary"
            aria-disabled={page === 0}
            style={page === 0 ? { pointerEvents: "none", opacity: 0.5 } : {}}
            href={href(Math.max(0, page - 1))}
          >
            &laquo; Sebelumnya
          </Link>
          <Link
            className="btn secondary"
            aria-disabled={(page + 1) * PAGE_SIZE >= total}
            style={(page + 1) * PAGE_SIZE >= total ? { pointerEvents: "none", opacity: 0.5 } : {}}
            href={href(page + 1)}
          >
            Berikutnya &raquo;
          </Link>
        </span>
      </div>
      <AccessHistoryTable rows={rows} />
    </>
  );
}
