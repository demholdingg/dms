import Flash from "@/components/Flash";
import RequestTable from "@/components/RequestTable";
import { STATUS_LABEL } from "@/lib/format";
import { one, type SP } from "@/lib/params";
import { requireAdmin } from "@/lib/session";
import { allRequests } from "@/lib/workflow";

export default async function AdminRequests({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = one(sp.status) || "all";
  const q = one(sp.q);
  const rows = allRequests({ status, q, limit: 300 });
  return (
    <>
      <h1>Semua permintaan</h1>
      <Flash />
      <form className="card row" method="get">
        <label>
          Status
          <select name="status" defaultValue={status}>
            <option value="all">Semua</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Cari (pemohon, judul, ID dokumen, nomor permintaan)
          <input type="text" name="q" defaultValue={q} />
        </label>
        <button className="btn" type="submit">Cari</button>
      </form>
      <RequestTable rows={rows} showRequester />
    </>
  );
}
