import { NextResponse } from "next/server";
import { activityExportData, activityFilters, loadAllActivities } from "./activity-export";
import { createReportFile } from "./report-file";
import { canSeeAudit, getSession } from "./session";

export async function exportActivityReport(
  req: Request,
  format: string,
  accessOnly: boolean,
): Promise<Response> {
  if (format !== "xlsx" && format !== "pdf") {
    return NextResponse.json({ error: "Format ekspor tidak didukung" }, { status: 404 });
  }
  const session = await getSession();
  if (!session || (accessOnly ? !canSeeAudit(session) : !session.isAdmin)) {
    return NextResponse.json({ error: "Tidak berhak" }, { status: 403 });
  }

  const filters = activityFilters(new URL(req.url), accessOnly);
  const rows = await loadAllActivities(filters);
  const { columns, data } = activityExportData(rows, accessOnly);
  const title = accessOnly ? "Riwayat Audit Akses Dokumen" : "Riwayat Aktivitas Sistem";
  const report = await createReportFile(title, columns, data, format);
  const filename = accessOnly ? "audit-akses" : "riwayat-aktivitas";

  return new Response(new Uint8Array(report.buffer), {
    headers: {
      "Content-Type": report.contentType,
      "Content-Disposition": `attachment; filename="${filename}.${report.extension}"`,
      "Cache-Control": "no-store",
    },
  });
}
