import Link from "next/link";
import type { ActivityRow } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function AccessHistoryTable({
  rows,
  compact = false,
}: {
  rows: ActivityRow[];
  compact?: boolean;
}) {
  return (
    <div className="tbl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Waktu</TableHead>
            <TableHead>Pengguna</TableHead>
            <TableHead>Aksi</TableHead>
            <TableHead>Dokumen</TableHead>
            {!compact && <TableHead>Detail</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={compact ? 4 : 5} className="muted-text whitespace-normal">
                Belum ada riwayat lihat atau unduh dokumen melalui portal.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">{fmtDate(row.created_at)}</TableCell>
                <TableCell>{row.actor}</TableCell>
                <TableCell>
                  <span className={`badge ${row.action === "DOC_DOWNLOADED" ? "info" : "ok"}`}>
                    {row.action === "DOC_DOWNLOADED" ? "Unduh" : "Lihat"}
                  </span>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {row.doc_id ? (
                    <>
                      #{row.doc_id} {row.doc_title || "-"}
                      {row.request_id && (
                        <div className="small">
                          <Link href={`/requests/${row.request_id}`}>Permintaan #{row.request_id}</Link>
                        </div>
                      )}
                    </>
                  ) : "-"}
                </TableCell>
                {!compact && <TableCell className="whitespace-normal">{row.details || "-"}</TableCell>}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
