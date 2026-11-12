import Link from "next/link";
import { daysLabel, fmtDate } from "@/lib/format";
import type { RequestRow } from "@/lib/workflow";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import StatusBadge from "./StatusBadge";

export default function RequestTable({ rows, showRequester = false }: { rows: RequestRow[]; showRequester?: boolean }) {
  if (!rows.length) return <p className="muted-text">Belum ada data.</p>;
  return (
    <div className="tbl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Dokumen</TableHead>
            {showRequester && <TableHead>Pemohon</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead>Durasi</TableHead>
            <TableHead>Diajukan</TableHead>
            <TableHead>Berlaku sampai</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link href={`/requests/${r.id}`}>{r.id}</Link>
              </TableCell>
              <TableCell className="whitespace-normal">
                <div>#{r.doc_id} {r.doc_title}</div>
                {r.status === "active" && (
                  <div className="small" style={{ marginTop: 3 }}>
                    <a href={`/api/documents/${r.doc_id}/preview`} target="_blank" rel="noopener noreferrer">
                      Lihat PDF
                    </a>
                    {" · "}
                    <a href={`/api/documents/${r.doc_id}/download`}>
                      Unduh
                    </a>
                  </div>
                )}
              </TableCell>
              {showRequester && <TableCell>{r.requester}</TableCell>}
              <TableCell>
                <StatusBadge status={r.status} />
                {r.status === "pending" && <span className="muted-text small"> · level {r.current_level}</span>}
              </TableCell>
              <TableCell>{daysLabel(r.requested_days)}</TableCell>
              <TableCell>{fmtDate(r.created_at)}</TableCell>
              <TableCell>{r.status === "active" ? (r.expires_at ? fmtDate(r.expires_at) : "Permanen") : "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
