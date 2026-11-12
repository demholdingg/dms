"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: number;
  ts: string;
  user: string;
  ip: string | null;
  action: string;
  doc_id: number | null;
  doc_title: string | null;
  status: number;
  note: string | null;
};

const LABEL: Record<string, string> = {
  preview: "Lihat",
  download: "Unduh",
  bulk_download: "Unduh massal",
  share: "Tautan berbagi",
  detail: "Buka detail",
};
const SIZE = 100;

const toIso = (d: string, end: boolean): string => {
  if (!d) return "";
  const x = new Date(d + "T00:00:00");
  if (end) x.setDate(x.getDate() + 1);
  return x.toISOString();
};

export default function AuditTable({
  initialDoc = "",
  initialUser = "",
  compact = false,
}: {
  initialDoc?: string;
  initialUser?: string;
  compact?: boolean;
}) {
  const [f, setF] = useState({
    from: "",
    to: "",
    user: initialUser,
    doc: initialDoc,
    action: compact ? "all" : "main",
    status: compact ? "all" : "ok",
  });
  const [applied, setApplied] = useState(f);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const qs = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams();
      if (applied.from) p.set("from", toIso(applied.from, false));
      if (applied.to) p.set("to", toIso(applied.to, true));
      for (const k of ["user", "doc", "action", "status"] as const) if (applied[k]) p.set(k, applied[k]);
      for (const [k, v] of Object.entries(extra)) p.set(k, v);
      return p.toString();
    },
    [applied],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const pageSize = compact ? 6 : SIZE;
        const r = await fetch("/api/audit/events?" + qs({ limit: String(pageSize), offset: String(page * pageSize) }));
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setErr(d.error ?? `Gagal memuat (${r.status})`);
          setRows([]);
          setTotal(0);
          setLoading(false);
          return;
        }
        setErr("");
        setRows(d.rows);
        setTotal(d.total);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setErr("Gagal memuat data audit");
          setRows([]);
          setTotal(0);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compact, qs, page]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const pageSize = compact ? 6 : SIZE;
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div>
      {!compact && <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setApplied(f);
        }}
      >
        <label>
          Dari tanggal
          <input type="date" value={f.from} onChange={set("from")} />
        </label>
        <label>
          Sampai tanggal
          <input type="date" value={f.to} onChange={set("to")} />
        </label>
        <label>
          User
          <input type="text" value={f.user} onChange={set("user")} placeholder="username" />
        </label>
        <label>
          Dokumen (ID / judul)
          <input type="text" value={f.doc} onChange={set("doc")} />
        </label>
        <label>
          Aksi
          <select value={f.action} onChange={set("action")}>
            <option value="main">Lihat + Unduh + Tautan</option>
            <option value="preview">Lihat (preview)</option>
            <option value="download">Unduh</option>
            <option value="bulk_download">Unduh massal</option>
            <option value="share">Tautan berbagi</option>
            <option value="detail">Buka halaman detail</option>
            <option value="all">Semua</option>
          </select>
        </label>
        <label>
          Status
          <select value={f.status} onChange={set("status")}>
            <option value="ok">Berhasil</option>
            <option value="fail">Ditolak / gagal</option>
            <option value="all">Semua</option>
          </select>
        </label>
        <button className="btn" type="submit">Cari</button>
        <button
          className="btn secondary"
          type="button"
          onClick={() => {
            const blank = { from: "", to: "", user: "", doc: "", action: "main", status: "ok" };
            setF(blank);
            setApplied(blank);
            setPage(0);
          }}
        >
          Reset
        </button>
        <a className="btn secondary" href={"/api/audit/export?" + qs()}>Export CSV</a>
      </form>}

      {err && <div className="flash error">{err}</div>}

      {!compact && <div className="row" style={{ margin: "8px 0", justifyContent: "space-between" }}>
        <span className="muted-text">{from}-{to} dari {total} kejadian</span>
        <span className="row">
          <button className="btn secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>&laquo; Sebelumnya</button>
          <button className="btn secondary" disabled={(page + 1) * pageSize >= total} onClick={() => setPage(page + 1)}>Berikutnya &raquo;</button>
        </span>
      </div>}

      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Waktu</th><th>User</th><th>Aksi</th><th>Dokumen</th>
              {!compact && <th>IP</th>}
              <th>Status</th>
              {!compact && <th>Catatan</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={compact ? 5 : 7} className="muted-text">Memuat data audit...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={compact ? 5 : 7} className="muted-text">Belum ada kejadian audit sesuai filter.</td></tr>
            ) : rows.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.ts).toLocaleString("id-ID")}</td>
                <td>{e.user}</td>
                <td>{LABEL[e.action] ?? e.action}</td>
                <td>{e.doc_id ? <>#{e.doc_id} {e.doc_title}</> : "-"}</td>
                {!compact && <td>{e.ip ?? ""}</td>}
                <td>
                  <span className={`badge ${e.status === 200 || e.status === 206 ? "ok" : "bad"}`}>
                    {e.status === 200 || e.status === 206 ? "Berhasil" : `Gagal (${e.status})`}
                  </span>
                </td>
                {!compact && <td>{e.note ?? ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
