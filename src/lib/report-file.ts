import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { ExportColumn, ExportRow } from "./activity-export";
import { env } from "./env";

export type ReportFormat = "xlsx" | "pdf";

export async function createReportFile(
  title: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  format: ReportFormat,
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Approval Portal";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Riwayat");
    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? 20,
    }));
    sheet.addRows(rows);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2457A7" } };
    sheet.getRow(1).alignment = { vertical: "middle" };
    const output = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(output),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }

  const buffer = await createPdf(title, columns, rows);
  return { buffer, contentType: "application/pdf", extension: "pdf" };
}

function createPdf(title: string, columns: ExportColumn[], rows: ExportRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(18).font("Helvetica-Bold").text(title);
    doc.moveDown(0.35);
    doc.fontSize(9).font("Helvetica").fillColor("#667085")
      .text(`Diekspor: ${new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: env.tz }).format(new Date())}`);
    doc.moveDown();

    if (!rows.length) {
      doc.fillColor("#1c2330").fontSize(11).text("Tidak ada data untuk filter ini.");
      doc.end();
      return;
    }

    const bottom = doc.page.height - doc.page.margins.bottom;
    rows.forEach((row, index) => {
      const content = columns
        .map((column) => `${column.header}: ${String(row[column.key] ?? "-") || "-"}`)
        .join("\n");
      const height = doc.heightOfString(content, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }) + 16;
      if (doc.y + height > bottom) doc.addPage();
      const top = doc.y;
      doc.font("Helvetica").fontSize(9).fillColor("#1c2330").text(
        content,
        doc.page.margins.left + 8,
        top + 8,
        { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 16 },
      );
      doc.rect(
        doc.page.margins.left,
        top,
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        height,
      ).strokeColor("#d0d5dd").stroke();
      doc.y = top + height + 6;
      if (index < rows.length - 1) doc.moveDown(0.3);
    });

    doc.end();
  });
}
