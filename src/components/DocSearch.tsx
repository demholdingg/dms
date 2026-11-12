"use client";

import { useEffect, useState } from "react";

type Hit = { id: number; title: string; created: string; typeName: string | null; correspondent: string | null; locked: boolean };

export default function DocSearch({
  initialId,
  directAccess = false,
}: {
  initialId?: string;
  directAccess?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3 && !/^\d+$/.test(term)) {
      setHits([]);
      setMsg(term ? "Ketik minimal 3 huruf" : "");
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/documents/search?q=" + encodeURIComponent(term));
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { hits: Hit[] };
        setHits(d.hits);
        setMsg(d.hits.length ? "" : "Tidak ada dokumen yang cocok");
      } catch {
        setMsg("Pencarian gagal. Coba lagi.");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const docId = picked?.id ?? (initialId ? Number(initialId) : "");

  return (
    <div>
      <label>
        Cari dokumen (judul atau nomor ID)
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="mis. kontrak vendor, atau 123" autoComplete="off" />
      </label>
      <input type="hidden" name="doc_id" value={docId} />
      {msg && <p className="muted-text small">{msg}</p>}
      {hits.length > 0 && (
        <ul className="hits">
          {hits.map((h) => (
            <li
              key={h.id}
              onClick={directAccess ? undefined : () => {
                setPicked(h);
                setHits([]);
                setQ("");
              }}
            >
              <div>
                <strong>#{h.id}</strong> {h.title}
                <div className="muted-text small">
                  {[h.typeName, h.correspondent, h.created.slice(0, 10)].filter(Boolean).join(" · ")}
                  {!h.locked && " · tidak dikunci (semua user sudah bisa melihat)"}
                </div>
              </div>
              {directAccess && (
                <div className="row" style={{ marginTop: 8 }}>
                  <a className="btn" href={`/api/documents/${h.id}/preview`} target="_blank" rel="noopener noreferrer">
                    Lihat PDF
                  </a>
                  <a className="btn secondary" href={`/api/documents/${h.id}/download`}>
                    Unduh PDF
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {picked ? (
        <div className="picked">
          <div>
            Dokumen dipilih: <strong>#{picked.id}</strong> {picked.title}
          </div>
          {directAccess && (
            <div className="row" style={{ marginTop: 10 }}>
              <a className="btn" href={`/api/documents/${picked.id}/preview`} target="_blank" rel="noopener noreferrer">
                Lihat PDF
              </a>
              <a className="btn secondary" href={`/api/documents/${picked.id}/download`}>
                Unduh PDF
              </a>
            </div>
          )}
        </div>
      ) : initialId ? (
        <div className="picked">Dokumen dipilih: <strong>#{initialId}</strong></div>
      ) : (
        <p className="muted-text small">Belum ada dokumen yang dipilih.</p>
      )}
    </div>
  );
}
