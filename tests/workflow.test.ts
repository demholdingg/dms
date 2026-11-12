import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

// ---------------------------------------------------------------- Paperless tiruan
type Perms = { view: { users: number[]; groups: number[] }; change: { users: number[]; groups: number[] } };
type FDoc = { id: number; title: string; owner: number | null; tags: number[]; created: string; content: string; perms: Perms };
const emptyPerms = (): Perms => ({ view: { users: [], groups: [] }, change: { users: [], groups: [] } });

const users = [
  { id: 1, username: "admin", first_name: "Ad", last_name: "Min", email: "admin@x.test", is_active: true, groups: [], is_superuser: true },
  { id: 2, username: "alice", first_name: "Alice", last_name: "", email: "alice@x.test", is_active: true, groups: [] },
  { id: 3, username: "bob", first_name: "Bob", last_name: "", email: "bob@x.test", is_active: true, groups: [] },
  { id: 4, username: "carol", first_name: "Carol", last_name: "", email: "carol@x.test", is_active: true, groups: [] },
  { id: 5, username: "dave", first_name: "Dave", last_name: "", email: "dave@x.test", is_active: true, groups: [] },
  { id: 6, username: "erin", first_name: "Erin", last_name: "", email: "erin@x.test", is_active: true, groups: [2] },
  { id: 7, username: "gone", first_name: "Gone", last_name: "", email: "", is_active: false, groups: [] },
];
const tokens: Record<string, number> = { svc: 1, "tok-admin": 1, "tok-dave": 5 };
const passwords: Record<string, string> = { admin: "pw-admin", dave: "pw-dave" };

const docs = new Map<number, FDoc>();
function resetDocs() {
  docs.clear();
  const mk = (id: number, title: string, owner: number | null, tags: number[], perms = emptyPerms()) =>
    docs.set(id, { id, title, owner, tags, created: "2026-01-01T00:00:00Z", content: "RAHASIA", perms });
  mk(5, "Kontrak Vendor A", 1, [10], { view: { users: [6], groups: [2] }, change: { users: [], groups: [] } });
  mk(6, "Pengumuman Umum", null, []);
  mk(7, "Notulen Rapat", 1, []);
  mk(8, "Dokumen Milik Dave", 5, []);
  mk(9, "Dokumen HR", 1, [11]);
  mk(10, "Dokumen Ganda", 1, [12]);
}

let failPatch = false;
let omitPerms = false;
let patchCount = 0;
const seenHosts: string[] = [];

function startFakePaperless(): Promise<http.Server> {
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seenHosts.push(String(req.headers.host));
      const u = new URL(req.url ?? "/", "http://x");
      const body = raw ? JSON.parse(raw) : {};
      const send = (code: number, obj?: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(obj === undefined ? "" : JSON.stringify(obj));
      };
      if (req.method === "POST" && u.pathname === "/api/token/") {
        if (passwords[body.username] && passwords[body.username] === body.password) return send(200, { token: "tok-" + body.username });
        return send(400, { non_field_errors: ["x"] });
      }
      const m = /^Token (.+)$/.exec(String(req.headers.authorization ?? ""));
      const uid = m ? tokens[m[1]] : undefined;
      if (!uid) return send(401, { detail: "no" });
      if (u.pathname === "/api/ui_settings/") {
        const me = users.find((x) => x.id === uid)!;
        return send(200, { user: { id: me.id, username: me.username, is_superuser: !!(me as { is_superuser?: boolean }).is_superuser } });
      }
      if (u.pathname === "/api/users/") return send(200, { count: users.length, next: null, results: users });
      if (u.pathname === "/api/tags/") return send(200, { count: 2, next: null, results: [{ id: 10, name: "Keuangan" }, { id: 11, name: "HR" }] });
      if (u.pathname === "/api/document_types/" || u.pathname === "/api/correspondents/") return send(200, { count: 0, next: null, results: [] });
      const one = /^\/api\/documents\/(\d+)\/$/.exec(u.pathname);
      if (one) {
        const d = docs.get(Number(one[1]));
        if (!d) return send(404, { detail: "nf" });
        if (req.method === "GET") {
          const { perms, ...rest } = d;
          return send(200, u.searchParams.get("full_perms") === "true" && !omitPerms ? { ...rest, permissions: perms } : rest);
        }
        if (req.method === "PATCH") {
          patchCount++;
          if (failPatch) return send(500, { detail: "boom" });
          if (body.set_permissions) d.perms = body.set_permissions;
          return send(200, { id: d.id });
        }
      }
      if (u.pathname === "/api/documents/" && req.method === "GET") {
        const q = (u.searchParams.get("title__icontains") ?? "").toLowerCase();
        const results = [...docs.values()].filter((d) => d.title.toLowerCase().includes(q)).map(({ perms: _p, ...r }) => r);
        return send(200, { count: results.length, next: null, results });
      }
      send(404, { detail: "route?" });
    });
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

const hooks: Array<{ event: string; recipients: string[]; request_id: number }> = [];
function startWebhook(): Promise<http.Server> {
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hooks.push(JSON.parse(raw));
      res.writeHead(200).end("ok");
    });
  });
  return new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv)));
}

const settle = () => new Promise((r) => setTimeout(r, 200));
const port = (s: http.Server) => (s.address() as { port: number }).port;

// ------------------------------------------------------------------------ tes
type W = typeof import("../src/lib/workflow");
type D = typeof import("../src/lib/db");
type P = typeof import("../src/lib/paperless");
type T = typeof import("../src/lib/token");

let W: W, D: D, P: P, T: T;
let fake: http.Server, hook: http.Server;
const A = (username: string) => {
  const u = users.find((x) => x.username === username)!;
  return { username, id: u.id, isAdmin: !!(u as { is_superuser?: boolean }).is_superuser };
};
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, (e: Error) => re.test(e.message));

before(async () => {
  resetDocs();
  fake = await startFakePaperless();
  hook = await startWebhook();
  process.env.PAPERLESS_URL = `http://127.0.0.1:${port(fake)}`;
  process.env.PAPERLESS_SERVICE_TOKEN = "svc";
  process.env.PAPERLESS_HOST_HEADER = "paperless.test";
  process.env.NOTIFY_WEBHOOK_URL = `http://127.0.0.1:${port(hook)}/hook`;
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "portal-test-"));
  process.env.SESSION_SECRET = "x".repeat(40);
  W = await import("../src/lib/workflow");
  D = await import("../src/lib/db");
  P = await import("../src/lib/paperless");
  T = await import("../src/lib/token");

  W.savePolicy({ name: "Umum", matchTagId: null, priority: 100, maxDays: 30, defaultDays: 7, active: true, steps: [{ label: "Atasan", approvers: ["alice"] }] });
  W.savePolicy({
    name: "Keuangan", matchTagId: 10, priority: 10, maxDays: 14, defaultDays: 3, active: true,
    steps: [{ label: "Atasan", approvers: ["alice"] }, { label: "Direktur", approvers: ["bob", "carol"] }],
  });
  W.savePolicy({ name: "HR", matchTagId: 11, priority: 10, maxDays: null, defaultDays: 3, active: true, steps: [{ label: null, approvers: ["alice"] }, { label: null, approvers: ["alice"] }] });
  W.savePolicy({ name: "Ganda", matchTagId: 12, priority: 10, maxDays: null, defaultDays: 3, active: true, steps: [{ label: null, approvers: ["alice", "bob"] }, { label: null, approvers: ["alice"] }] });
});

after(() => {
  fake.close();
  hook.close();
});

describe("login & klien Paperless", () => {
  it("mengambil jumlah seluruh dokumen dari Paperless", async () => {
    P.clearPaperlessCache();
    assert.equal(await P.getDocumentCount(), docs.size);
  });

  it("verifyLogin benar/salah dan lookup identitas pengguna", async () => {
    assert.equal(await P.verifyLogin("dave", "salah"), null);
    const tok = await P.verifyLogin("dave", "pw-dave");
    assert.equal(tok, "tok-dave");
    assert.deepEqual(await P.userByUsername("dave"), { id: 5, username: "dave", isAdmin: false });
    assert.deepEqual(await P.userByUsername("admin"), { id: 1, username: "admin", isAdmin: true });
    assert.equal(await P.userByUsername("gone"), null);
  });

  it("header Host dipaksa sesuai PAPERLESS_HOST_HEADER", () => {
    assert.ok(seenHosts.length > 0);
    assert.ok(seenHosts.every((h) => h === "paperless.test"), `host terlihat: ${[...new Set(seenHosts)].join(",")}`);
  });

  it("pencarian: minimal 3 huruf, judul, dan ID", async () => {
    assert.deepEqual(await P.searchDocuments("ko"), []);
    const hits = await P.searchDocuments("kontrak");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, 5);
    assert.equal(hits[0].locked, true);
    assert.equal((await P.searchDocuments("6"))[0].locked, false);
    assert.deepEqual(await P.searchDocuments("999"), []);
  });
});

describe("validasi pengajuan", () => {
  it("menolak dokumen tidak terkunci, milik sendiri, alasan pendek, dokumen hilang", async () => {
    await rejects(W.createRequest({ requester: A("dave"), docId: 6, reason: "alasan cukup panjang", days: 3 }), /tidak dikunci/);
    await rejects(W.createRequest({ requester: A("dave"), docId: 8, reason: "alasan cukup panjang", days: 3 }), /sudah memiliki akses/);
    await rejects(W.createRequest({ requester: A("dave"), docId: 7, reason: "pendek", days: 3 }), /minimal 10/);
    await rejects(W.createRequest({ requester: A("dave"), docId: 404, reason: "alasan cukup panjang", days: 3 }), /tidak ditemukan/);
  });

  it("user yang sudah punya akses lewat grup/daftar izin ditolak", async () => {
    await rejects(W.createRequest({ requester: A("erin"), docId: 5, reason: "alasan cukup panjang", days: 3 }), /sudah memiliki akses/);
  });

  it("menegakkan batas durasi kebijakan", async () => {
    await rejects(W.createRequest({ requester: A("dave"), docId: 7, reason: "alasan cukup panjang", days: 31 }), /Durasi maksimal.*30 hari/);
    await rejects(W.createRequest({ requester: A("dave"), docId: 7, reason: "alasan cukup panjang", days: null }), /membatasi akses maksimal/);
  });

  it("menolak jenjang yang mustahil dipenuhi (approver bertumpuk)", async () => {
    await rejects(W.createRequest({ requester: A("dave"), docId: 9, reason: "alasan cukup panjang", days: 3 }), /bertumpuk/);
  });

  it("pemohon tidak boleh menjadi approver untuk dirinya sendiri", async () => {
    // alice adalah satu-satunya approver level 1 kebijakan Umum
    await rejects(W.createRequest({ requester: A("alice"), docId: 7, reason: "alasan cukup panjang", days: 3 }), /Tidak ada approver/);
  });
});

describe("alur approval 2 level", () => {
  let rid = 0;
  it("mengajukan, memberi tahu approver level 1, mencegah duplikat", async () => {
    hooks.length = 0;
    rid = await W.createRequest({ requester: A("dave"), docId: 5, reason: "Perlu untuk audit vendor", days: 3 });
    await settle();
    const f = W.getRequestFull(rid)!;
    assert.equal(f.r.status, "pending");
    assert.equal(f.r.policy_name, "Keuangan");
    assert.equal(f.steps.length, 2);
    assert.deepEqual(hooks.map((h) => [h.event, h.recipients]), [["approval_needed", ["alice"]]]);
    await rejects(W.createRequest({ requester: A("dave"), docId: 5, reason: "alasan cukup panjang", days: 3 }), /masih berjalan/);
    assert.deepEqual(W.pendingFor("alice").map((r) => r.id), [rid]);
    assert.deepEqual(W.pendingFor("bob"), []);
  });

  it("menolak keputusan dari orang yang bukan approver level berjalan / pemohon sendiri", async () => {
    await rejects(W.decide({ requestId: rid, actor: A("bob"), approve: true, comment: "" }), /bukan approver/);
    await rejects(W.decide({ requestId: rid, actor: A("dave"), approve: true, comment: "" }), /permintaan Anda sendiri/);
    await rejects(W.decide({ requestId: rid, actor: A("admin"), approve: true, comment: "" }), /bukan approver/);
  });

  it("level 1 menyetujui -> lanjut ke level 2, izin belum diberikan", async () => {
    hooks.length = 0;
    const r = await W.decide({ requestId: rid, actor: A("alice"), approve: true, comment: "OK" });
    assert.equal(r.status, "pending");
    assert.equal(r.current_level, 2);
    assert.deepEqual(docs.get(5)!.perms.view.users, [6]);
    await settle();
    assert.deepEqual(hooks.map((h) => [h.event, h.recipients]), [["approval_needed", ["bob", "carol"]]]);
    await rejects(W.decide({ requestId: rid, actor: A("alice"), approve: true, comment: "" }), /bukan approver|sudah memutuskan/);
  });

  it("level 2 menyetujui -> izin view diberikan tanpa menghapus izin lain", async () => {
    hooks.length = 0;
    const r = await W.decide({ requestId: rid, actor: A("carol"), approve: true, comment: "" });
    assert.equal(r.status, "active");
    assert.equal(r.we_added, 1);
    assert.deepEqual(docs.get(5)!.perms.view.users, [6, 5]);
    assert.deepEqual(docs.get(5)!.perms.view.groups, [2]);
    const days = (new Date(r.expires_at!).getTime() - Date.now()) / 86_400_000;
    assert.ok(days > 2.99 && days <= 3, `kedaluwarsa dalam ${days} hari`);
    await settle();
    assert.deepEqual(hooks.map((h) => [h.event, h.recipients]), [["granted", ["dave"]]]);
    const types = W.getRequestFull(rid)!.events.map((e) => e.type);
    assert.deepEqual(types, ["created", "approved_step", "approved_step", "approved_all", "granted"]);
    await rejects(W.decide({ requestId: rid, actor: A("bob"), approve: true, comment: "" }), /tidak menunggu/);
  });

  it("hak akses hanya bisa dicabut oleh admin / pemohon sendiri", async () => {
    await rejects(W.revokeRequest(rid, A("erin")), /tidak berhak/);
    await W.revokeRequest(rid, A("admin"));
    assert.deepEqual(docs.get(5)!.perms.view.users, [6]);
    assert.equal(W.getRequestFull(rid)!.r.status, "revoked");
    await rejects(W.revokeRequest(rid, A("admin")), /sedang aktif/);
  });
});

describe("penolakan, pembatalan, pemisahan tugas", () => {
  it("penolakan wajib beralasan dan tidak memberi izin", async () => {
    const rid = await W.createRequest({ requester: A("dave"), docId: 7, reason: "Perlu membaca notulen", days: 7 });
    await rejects(W.decide({ requestId: rid, actor: A("alice"), approve: false, comment: " " }), /Alasan penolakan/);
    const r = await W.decide({ requestId: rid, actor: A("alice"), approve: false, comment: "Bukan kebutuhan tugas" });
    assert.equal(r.status, "rejected");
    assert.deepEqual(docs.get(7)!.perms.view.users, []);
    // setelah ditolak boleh mengajukan lagi
    const again = await W.createRequest({ requester: A("dave"), docId: 7, reason: "Perlu membaca notulen lagi", days: 7 });
    assert.ok(again > rid);
    W.cancelRequest(again, A("dave")); // bersihkan agar tidak memengaruhi tes lain
  });

  it("pembatalan hanya oleh pemohon (atau admin), dan hanya saat masih menunggu", async () => {
    const rid = await W.createRequest({ requester: A("erin"), docId: 7, reason: "Perlu membaca notulen", days: 7 });
    assert.throws(() => W.cancelRequest(rid, A("dave")), /tidak berhak/);
    W.cancelRequest(rid, A("erin"));
    assert.equal(W.getRequestFull(rid)!.r.status, "cancelled");
    assert.throws(() => W.cancelRequest(rid, A("erin")), /masih menunggu/);
    await rejects(W.decide({ requestId: rid, actor: A("alice"), approve: true, comment: "" }), /tidak menunggu/);
    assert.deepEqual(docs.get(7)!.perms.view.users, []);
  });

  it("satu orang tidak boleh memutuskan dua level; persetujuan yang membuat jalan buntu ditolak", async () => {
    const rid = await W.createRequest({ requester: A("erin"), docId: 10, reason: "Perlu dokumen ganda", days: 3 });
    await rejects(W.decide({ requestId: rid, actor: A("alice"), approve: true, comment: "" }), /tidak dapat dipenuhi/);
    await W.decide({ requestId: rid, actor: A("bob"), approve: true, comment: "" });
    const r = await W.decide({ requestId: rid, actor: A("alice"), approve: true, comment: "" });
    assert.equal(r.status, "active");
  });
});

describe("kegagalan Paperless, retry, kedaluwarsa", () => {
  it("gagal memberi izin -> grant_failed -> pulih lewat retryPendingGrants", async () => {
    docs.get(8)!.owner = 1; // jadikan terkunci agar dave bisa mengajukan
    const rid = await W.createRequest({ requester: A("dave"), docId: 8, reason: "Perlu dokumen ini", days: 1 });
    failPatch = true;
    const r1 = await W.decide({ requestId: rid, actor: A("alice"), approve: true, comment: "" });
    assert.equal(r1.status, "grant_failed");
    assert.match(r1.last_error ?? "", /500/);
    assert.deepEqual(docs.get(8)!.perms.view.users, []);
    failPatch = false;
    assert.equal(await W.retryPendingGrants(), 1);
    const r2 = W.getRequestFull(rid)!.r;
    assert.equal(r2.status, "active");
    assert.deepEqual(docs.get(8)!.perms.view.users, [5]);

    // kedaluwarsa: majukan waktu dengan mengubah expires_at
    D.db().prepare("UPDATE requests SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), rid);
    assert.equal(await W.expireDue(), 1);
    assert.equal(W.getRequestFull(rid)!.r.status, "expired");
    assert.deepEqual(docs.get(8)!.perms.view.users, []);
  });

  it("kegagalan saat mencabut tidak menghilangkan permintaan (dicoba lagi)", async () => {
    const rid = await W.createRequest({ requester: A("dave"), docId: 8, reason: "Perlu dokumen ini lagi", days: 1 });
    await W.decide({ requestId: rid, actor: A("alice"), approve: true, comment: "" });
    D.db().prepare("UPDATE requests SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), rid);
    failPatch = true;
    assert.equal(await W.expireDue(), 0);
    assert.equal(W.getRequestFull(rid)!.r.status, "active");
    failPatch = false;
    assert.equal(await W.expireDue(), 1);
    assert.deepEqual(docs.get(8)!.perms.view.users, []);
  });

  it("tidak menulis izin bila Paperless tidak mengembalikan data izin", async () => {
    // Respons tanpa 'permissions' -> grant/revoke harus gagal dan TIDAK mengirim PATCH (agar tidak menimpa izin yang ada)
    const before = JSON.stringify(docs.get(5)!.perms);
    const patches = patchCount;
    omitPerms = true;
    try {
      await rejects(P.grantView(5, 99), /data izin/);
      await rejects(P.revokeView(5, 6), /data izin/);
    } finally {
      omitPerms = false;
    }
    assert.equal(patchCount, patches);
    assert.equal(JSON.stringify(docs.get(5)!.perms), before);
  });

  it("grantView idempoten: user yang sudah terdaftar tidak ditambah dan tidak ditandai 'we_added'", async () => {
    const patches = patchCount;
    assert.deepEqual(await P.grantView(5, 6), { added: false });
    assert.equal(patchCount, patches);
  });
});

describe("token sesi", () => {
  it("menandatangani, memverifikasi, dan menolak token rusak/kedaluwarsa", () => {
    const secret = "s".repeat(40);
    const now = Math.floor(Date.now() / 1000);
    const tok = T.signSession({ u: "dave", id: 5, a: false, exp: now + 60 }, secret);
    assert.equal(T.verifySession(tok, secret)?.u, "dave");
    assert.equal(T.verifySession(tok, "lain".repeat(10)), null);
    const [body, sig] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "dave", id: 5, a: true, exp: now + 60 })).toString("base64url");
    assert.equal(T.verifySession(`${forged}.${sig}`, secret), null);
    assert.equal(T.verifySession(`${body}.${sig}x`, secret), null);
    assert.equal(T.verifySession(T.signSession({ u: "dave", id: 5, a: false, exp: now - 1 }, secret), secret), null);
    assert.equal(T.verifySession(undefined, secret), null);
    assert.equal(T.verifySession("sampah", secret), null);
  });
});

describe("riwayat akses dokumen", () => {
  it("mencatat dan memfilter akses lihat/unduh berdasarkan pengguna dan dokumen", () => {
    D.recordActivity({
      category: "ACCESS",
      action: "DOC_VIEWED",
      docId: 5,
      docTitle: "Kontrak Vendor A",
      actor: "dave",
      requestId: 1,
      details: "Melihat dokumen (preview PDF)",
    });
    D.recordActivity({
      category: "ACCESS",
      action: "DOC_DOWNLOADED",
      docId: 5,
      docTitle: "Kontrak Vendor A",
      actor: "dave",
      requestId: 1,
      details: "Mengunduh file dokumen PDF",
    });

    const result = D.listActivities({ category: "ACCESS", actor: "dave", docId: 5, limit: 10 });
    assert.equal(result.total, 2);
    assert.deepEqual(result.rows.map((row) => row.action).sort(), ["DOC_DOWNLOADED", "DOC_VIEWED"]);
    assert.ok(result.rows.every((row) => row.doc_title === "Kontrak Vendor A" && row.request_id === 1));
  });
});
