import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createReportFile } from "../src/lib/report-file";

describe("ekspor laporan", () => {
  const columns = [
    { header: "Pengguna", key: "actor", width: 20 },
    { header: "Aksi", key: "action", width: 20 },
  ];
  const rows = [{ actor: "alice", action: "Melihat dokumen" }];

  it("menghasilkan workbook Excel yang dapat dibaca", async () => {
    const report = await createReportFile("Audit Akses", columns, rows, "xlsx");
    assert.equal(report.extension, "xlsx");
    assert.equal(report.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.deepEqual([...report.buffer.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    assert.ok(report.buffer.length > 500);
  });

  it("menghasilkan dokumen PDF valid", async () => {
    const report = await createReportFile("Audit Akses", columns, rows, "pdf");
    assert.equal(report.extension, "pdf");
    assert.equal(report.contentType, "application/pdf");
    assert.equal(report.buffer.subarray(0, 5).toString("ascii"), "%PDF-");
  });
});
