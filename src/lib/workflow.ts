import { db, nowIso, recordActivity } from "./db";
import { env } from "./env";
import * as P from "./paperless";
import { notifyApprovers, notifyRequester } from "./notify";

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

export type Actor = { username: string; id: number; isAdmin: boolean };

export type RequestRow = {
  id: number;
  requester: string;
  requester_id: number;
  doc_id: number;
  doc_title: string | null;
  reason: string;
  requested_days: number | null;
  policy_id: number | null;
  policy_name: string | null;
  status: string;
  current_level: number;
  we_added: number;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  granted_at: string | null;
  expires_at: string | null;
  closed_at: string | null;
};
export type StepRow = {
  id: number;
  request_id: number;
  level: number;
  label: string | null;
  approvers: string;
  status: string;
  decided_by: string | null;
  comment: string | null;
  decided_at: string | null;
};
export type EventRow = { id: number; request_id: number; ts: string; actor: string; type: string; detail: string | null };

export const approversOf = (s: Pick<StepRow, "approvers">): string[] => JSON.parse(s.approvers) as string[];
const lc = (s: string) => s.toLowerCase();
const DAY = 86_400_000;

function addEvent(requestId: number, actor: string, type: string, detail?: string | null): void {
  db()
    .prepare("INSERT INTO request_events(request_id, ts, actor, type, detail) VALUES (?,?,?,?,?)")
    .run(requestId, nowIso(), actor, type, detail ?? null);
}

function getReq(id: number): RequestRow | undefined {
  return db().prepare("SELECT * FROM requests WHERE id=?").get(id) as RequestRow | undefined;
}
function mustReq(id: number): RequestRow {
  const r = getReq(id);
  if (!r) throw new WorkflowError("Permintaan tidak ditemukan");
  return r;
}

// ================================================================ KEBIJAKAN
export type PolicyRow = {
  id: number;
  name: string;
  match_tag_id: number | null;
  priority: number;
  max_days: number | null;
  default_days: number;
  active: number;
  created_at: string;
};
export type PolicyFull = PolicyRow & { steps: { level: number; label: string | null; approvers: string[] }[] };

function withSteps(p: PolicyRow): PolicyFull {
  const steps = db().prepare("SELECT * FROM policy_steps WHERE policy_id=? ORDER BY level").all(p.id) as (StepRow & { policy_id: number })[];
  return { ...p, steps: steps.map((s) => ({ level: s.level, label: s.label, approvers: approversOf(s) })) };
}

export function listPolicies(): PolicyFull[] {
  const rows = db().prepare("SELECT * FROM policies ORDER BY priority, id").all() as PolicyRow[];
  return rows.map(withSteps);
}

export function getPolicy(id: number): PolicyFull | null {
  const p = db().prepare("SELECT * FROM policies WHERE id=?").get(id) as PolicyRow | undefined;
  return p ? withSteps(p) : null;
}

export type PolicyInput = {
  id?: number;
  name: string;
  matchTagId: number | null;
  priority: number;
  maxDays: number | null;
  defaultDays: number;
  active: boolean;
  steps: { label: string | null; approvers: string[] }[];
};

export function savePolicy(i: PolicyInput): number {
  const name = i.name.trim();
  if (!name || name.length > 80) throw new WorkflowError("Nama kebijakan wajib diisi (maksimal 80 karakter)");
  if (!Number.isInteger(i.priority) || i.priority < 0) throw new WorkflowError("Prioritas harus bilangan bulat >= 0");
  if (!Number.isInteger(i.defaultDays) || i.defaultDays < 1) throw new WorkflowError("Durasi bawaan minimal 1 hari");
  if (i.maxDays !== null && (!Number.isInteger(i.maxDays) || i.maxDays < i.defaultDays))
    throw new WorkflowError("Durasi maksimum harus bilangan bulat dan tidak lebih kecil dari durasi bawaan");
  if (i.steps.length < 1 || i.steps.length > 6) throw new WorkflowError("Kebijakan harus punya 1 sampai 6 level");
  for (const [n, s] of i.steps.entries()) {
    if (!s.approvers.length) throw new WorkflowError(`Level ${n + 1} belum punya approver`);
  }
  const ts = nowIso();
  return db().transaction(() => {
    let id = i.id;
    if (id) {
      const r = db()
        .prepare("UPDATE policies SET name=?, match_tag_id=?, priority=?, max_days=?, default_days=?, active=? WHERE id=?")
        .run(name, i.matchTagId, i.priority, i.maxDays, i.defaultDays, i.active ? 1 : 0, id);
      if (r.changes === 0) throw new WorkflowError("Kebijakan tidak ditemukan");
      db().prepare("DELETE FROM policy_steps WHERE policy_id=?").run(id);
    } else {
      id = Number(
        db()
          .prepare("INSERT INTO policies(name, match_tag_id, priority, max_days, default_days, active, created_at) VALUES (?,?,?,?,?,?,?)")
          .run(name, i.matchTagId, i.priority, i.maxDays, i.defaultDays, i.active ? 1 : 0, ts).lastInsertRowid,
      );
    }
    const ins = db().prepare("INSERT INTO policy_steps(policy_id, level, label, approvers) VALUES (?,?,?,?)");
    i.steps.forEach((s, n) => ins.run(id, n + 1, s.label?.trim() || null, JSON.stringify(s.approvers)));
    return id;
  })();
}

export function deletePolicy(id: number): void {
  db().prepare("DELETE FROM policies WHERE id=?").run(id);
}

export function setPolicyActive(id: number, active: boolean): void {
  db().prepare("UPDATE policies SET active=? WHERE id=?").run(active ? 1 : 0, id);
}

/** Kebijakan paling cocok: tag dokumen yang cocok (prioritas terkecil), kalau tidak ada pakai default. */
export function pickPolicy(docTags: number[]): PolicyFull | null {
  const all = listPolicies().filter((p) => p.active);
  const tagged = all.filter((p) => p.match_tag_id !== null && docTags.includes(p.match_tag_id));
  if (tagged.length) return tagged[0]; // sudah terurut prioritas, id
  return all.find((p) => p.match_tag_id === null) ?? null;
}

/** Apakah tiap level bisa diisi orang yang berbeda? (satu orang tidak boleh memutuskan dua level) */
function feasible(levels: string[][]): boolean {
  const used = new Set<string>();
  const go = (i: number): boolean => {
    if (i === levels.length) return true;
    for (const a of levels[i]) {
      if (used.has(a)) continue;
      used.add(a);
      if (go(i + 1)) return true;
      used.delete(a);
    }
    return false;
  };
  return go(0);
}

// ================================================================ PENGAJUAN
const OPEN_STATUSES = ["pending", "approved", "granting", "grant_failed"];

export async function createRequest(i: {
  requester: Actor;
  docId: number;
  reason: string;
  days: number | null;
}): Promise<number> {
  const reason = i.reason.trim();
  if (reason.length < 10) throw new WorkflowError("Alasan minimal 10 karakter");
  if (reason.length > 1000) throw new WorkflowError("Alasan maksimal 1000 karakter");
  if (!Number.isInteger(i.docId) || i.docId < 1) throw new WorkflowError("Pilih dokumen terlebih dahulu");
  if (i.days !== null && (!Number.isInteger(i.days) || i.days < 1 || i.days > 3650))
    throw new WorkflowError("Durasi harus 1 sampai 3650 hari");

  let doc: P.PDoc | null;
  try {
    doc = await P.getDocument(i.docId);
  } catch (e) {
    throw new WorkflowError(e instanceof Error ? e.message : "Gagal membaca dokumen");
  }
  if (!doc) throw new WorkflowError("Dokumen tidak ditemukan");
  if (doc.owner === null)
    throw new WorkflowError("Dokumen ini tidak dikunci sehingga semua user sudah bisa melihatnya. Hubungi admin untuk mengunci dokumen.");

  const users = await P.listUsers().catch(() => [] as P.PUser[]);
  const me = users.find((u) => u.id === i.requester.id);
  const why = P.accessReason(doc, { id: i.requester.id, groups: me?.groups ?? [], isAdmin: i.requester.isAdmin });
  if (why) throw new WorkflowError(`Anda sudah memiliki akses ke dokumen ini karena ${why}. Untuk menguji approval, login sebagai user biasa.`);

  const dup = db()
    .prepare(`SELECT id FROM requests WHERE doc_id=? AND lower(requester)=? AND status IN (${OPEN_STATUSES.map(() => "?").join(",")})`)
    .get(i.docId, lc(i.requester.username), ...OPEN_STATUSES);
  if (dup) throw new WorkflowError("Anda sudah punya permintaan yang masih berjalan untuk dokumen ini");

  const policy = pickPolicy(doc.tags ?? []);
  if (!policy) throw new WorkflowError("Belum ada kebijakan approval untuk dokumen ini. Hubungi admin.");
  if (policy.max_days !== null) {
    if (i.days === null) throw new WorkflowError(`Kebijakan ini membatasi akses maksimal ${policy.max_days} hari`);
    if (i.days > policy.max_days) throw new WorkflowError(`Durasi maksimal untuk dokumen ini ${policy.max_days} hari`);
  }

  const active = users.length ? new Set(users.filter((u) => u.is_active).map((u) => lc(u.username))) : null;
  const steps = policy.steps.map((s) => ({
    ...s,
    approvers: s.approvers.filter((a) => lc(a) !== lc(i.requester.username) && (!active || active.has(lc(a)))),
  }));
  for (const s of steps) {
    if (!s.approvers.length)
      throw new WorkflowError(`Tidak ada approver yang memenuhi syarat di level ${s.level} (pemohon tidak boleh menyetujui sendiri). Hubungi admin.`);
  }
  if (!feasible(steps.map((s) => s.approvers.map(lc))))
    throw new WorkflowError("Jenjang kebijakan tidak dapat dipenuhi karena approver bertumpuk di beberapa level. Hubungi admin.");

  const ts = nowIso();
  const id = db().transaction(() => {
    const rid = Number(
      db()
        .prepare(
          `INSERT INTO requests(requester, requester_id, doc_id, doc_title, reason, requested_days, policy_id, policy_name,
             status, current_level, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?, 'pending', 1, ?, ?)`,
        )
        .run(i.requester.username, i.requester.id, doc.id, doc.title, reason, i.days, policy.id, policy.name, ts, ts).lastInsertRowid,
    );
    const ins = db().prepare("INSERT INTO request_steps(request_id, level, label, approvers) VALUES (?,?,?,?)");
    for (const s of steps) ins.run(rid, s.level, s.label, JSON.stringify(s.approvers));
    addEvent(rid, i.requester.username, "created", `Kebijakan: ${policy.name}; ${steps.length} level`);
    recordActivity({
      category: "REQUEST",
      action: "REQUEST_SUBMITTED",
      docId: doc.id,
      docTitle: doc.title,
      actor: i.requester.username,
      targetUser: i.requester.username,
      requestId: rid,
      details: `Durasi: ${i.days ? i.days + " hari" : "Permanen"}. Alasan: ${reason}. Kebijakan: ${policy.name} (${steps.length} level)`,
    });
    return rid;
  })();

  void notifyApprovers(mustReq(id), steps[0].approvers, 1);
  return id;
}

// ================================================================ KEPUTUSAN
export async function decide(i: { requestId: number; actor: Actor; approve: boolean; comment: string }): Promise<RequestRow> {
  const comment = i.comment.trim();
  if (!i.approve && comment.length < 3) throw new WorkflowError("Alasan penolakan wajib diisi");
  if (comment.length > 1000) throw new WorkflowError("Komentar maksimal 1000 karakter");
  const me = lc(i.actor.username);

  const res = db().transaction(() => {
    const r = mustReq(i.requestId);
    if (r.status !== "pending") throw new WorkflowError("Permintaan ini sudah tidak menunggu persetujuan");
    if (lc(r.requester) === me) throw new WorkflowError("Anda tidak dapat memutuskan permintaan Anda sendiri");
    const step = db().prepare("SELECT * FROM request_steps WHERE request_id=? AND level=?").get(r.id, r.current_level) as StepRow | undefined;
    if (!step || step.status !== "pending") throw new WorkflowError("Level persetujuan tidak valid");
    if (!approversOf(step).some((a) => lc(a) === me)) throw new WorkflowError("Anda bukan approver pada level yang sedang berjalan");
    const prior = db()
      .prepare("SELECT 1 FROM request_steps WHERE request_id=? AND decided_by IS NOT NULL AND lower(decided_by)=?")
      .get(r.id, me);
    if (prior) throw new WorkflowError("Anda sudah memutuskan pada level sebelumnya; level berikutnya harus orang lain");

    if (i.approve) {
      // Persetujuan ini tidak boleh membuat level berikutnya mustahil dipenuhi (satu orang tidak boleh memutuskan dua level).
      const taken = new Set<string>([me]);
      for (const d of db().prepare("SELECT decided_by FROM request_steps WHERE request_id=? AND decided_by IS NOT NULL").all(r.id) as { decided_by: string }[]) taken.add(lc(d.decided_by));
      const later = (db().prepare("SELECT * FROM request_steps WHERE request_id=? AND level>? ORDER BY level").all(r.id, r.current_level) as StepRow[]).map((s) =>
        approversOf(s).map(lc).filter((a) => !taken.has(a)),
      );
      if (later.length && !feasible(later))
        throw new WorkflowError("Persetujuan Anda akan membuat level berikutnya tidak dapat dipenuhi (approver bertumpuk). Minta approver lain di level ini atau hubungi admin.");
    }

    const ts = nowIso();
    db()
      .prepare("UPDATE request_steps SET status=?, decided_by=?, comment=?, decided_at=? WHERE id=?")
      .run(i.approve ? "approved" : "rejected", i.actor.username, comment || null, ts, step.id);

    if (!i.approve) {
      db().prepare("UPDATE requests SET status='rejected', closed_at=?, updated_at=? WHERE id=?").run(ts, ts, r.id);
      addEvent(r.id, i.actor.username, "rejected", `Level ${step.level}: ${comment}`);
      return { kind: "rejected" as const, extra: comment };
    }
    addEvent(r.id, i.actor.username, "approved_step", `Level ${step.level}${comment ? ": " + comment : ""}`);
    const next = db().prepare("SELECT * FROM request_steps WHERE request_id=? AND level>? ORDER BY level LIMIT 1").get(r.id, r.current_level) as StepRow | undefined;
    if (next) {
      db().prepare("UPDATE requests SET current_level=?, updated_at=? WHERE id=?").run(next.level, ts, r.id);
      return { kind: "next" as const, approvers: approversOf(next), level: next.level };
    }
    db().prepare("UPDATE requests SET status='approved', updated_at=? WHERE id=?").run(ts, r.id);
    addEvent(r.id, "sistem", "approved_all", "Semua level menyetujui");
    return { kind: "final" as const };
  })();

  const after = mustReq(i.requestId);
  recordActivity({
    category: "APPROVAL",
    action: !i.approve ? "STEP_REJECTED" : "STEP_APPROVED",
    docId: after.doc_id,
    docTitle: after.doc_title,
    actor: i.actor.username,
    targetUser: after.requester,
    requestId: after.id,
    details: !i.approve
      ? `Ditolak pada level ${after.current_level}. Alasan: ${comment}`
      : `Level ${after.current_level} disetujui${comment ? ". Catatan: " + comment : ""}${res.kind === "final" ? " (Semua level selesai disetujui)" : ""}`,
  });
  if (res.kind === "next") void notifyApprovers(after, res.approvers, res.level);
  else if (res.kind === "rejected") void notifyRequester(after, "rejected", res.extra ? `\nAlasan: ${res.extra}` : "");
  else await grantAccess(after.id);
  return mustReq(i.requestId);
}

// ================================================================ PEMBERIAN AKSES
export async function grantAccess(id: number): Promise<RequestRow> {
  const claim = db()
    .prepare("UPDATE requests SET status='granting', attempts=attempts+1, updated_at=? WHERE id=? AND status IN ('approved','grant_failed')")
    .run(nowIso(), id);
  if (claim.changes === 0) return mustReq(id);
  const r = mustReq(id);
  try {
    const { added } = await P.grantView(r.doc_id, r.requester_id);
    const ts = nowIso();
    const exp = r.requested_days ? new Date(Date.now() + r.requested_days * DAY).toISOString() : null;
    db()
      .prepare("UPDATE requests SET status='active', granted_at=?, expires_at=?, we_added=?, last_error=NULL, updated_at=? WHERE id=?")
      .run(ts, exp, added ? 1 : 0, ts, id);
    addEvent(id, "sistem", "granted", exp ? `Hak lihat diberikan sampai ${exp}` : "Hak lihat diberikan (permanen)");
    recordActivity({
      category: "PERMISSION",
      action: "ACCESS_GRANTED",
      docId: r.doc_id,
      docTitle: r.doc_title,
      actor: "sistem",
      targetUser: r.requester,
      requestId: id,
      details: exp ? `Hak akses aktif sampai ${exp}` : "Hak akses aktif (permanen)",
    });
    void notifyRequester(mustReq(id), "granted", exp ? `\nBerlaku sampai ${exp}.` : "");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db().prepare("UPDATE requests SET status='grant_failed', last_error=?, updated_at=? WHERE id=?").run(msg, nowIso(), id);
    addEvent(id, "sistem", "grant_failed", msg);
    recordActivity({
      category: "PERMISSION",
      action: "GRANT_FAILED",
      docId: r.doc_id,
      docTitle: r.doc_title,
      actor: "sistem",
      targetUser: r.requester,
      requestId: id,
      details: `Gagal memberikan hak akses di Paperless: ${msg}`,
    });
    if (mustReq(id).attempts === 1) void notifyRequester(mustReq(id), "grant_failed");
  }
  return mustReq(id);
}

/** Dipanggil admin untuk mencoba ulang pemberian akses yang gagal. */
export async function retryGrant(id: number, actor: Actor): Promise<RequestRow> {
  if (!actor.isAdmin) throw new WorkflowError("Khusus admin");
  const r = mustReq(id);
  if (!["approved", "grant_failed"].includes(r.status)) throw new WorkflowError("Permintaan ini tidak sedang menunggu pemberian akses");
  addEvent(id, actor.username, "retry");
  recordActivity({
    category: "PERMISSION",
    action: "GRANT_RETRY",
    docId: r.doc_id,
    docTitle: r.doc_title,
    actor: actor.username,
    targetUser: r.requester,
    requestId: id,
    details: "Mencoba ulang proses pemberian hak akses",
  });
  return grantAccess(id);
}

// ================================================================ BATAL / CABUT / KEDALUWARSA
export function cancelRequest(id: number, actor: Actor): void {
  const r = mustReq(id);
  if (!actor.isAdmin && lc(r.requester) !== lc(actor.username)) throw new WorkflowError("Anda tidak berhak membatalkan permintaan ini");
  const ts = nowIso();
  const res = db().prepare("UPDATE requests SET status='cancelled', closed_at=?, updated_at=? WHERE id=? AND status='pending'").run(ts, ts, id);
  if (res.changes === 0) throw new WorkflowError("Hanya permintaan yang masih menunggu yang dapat dibatalkan");
  addEvent(id, actor.username, "cancelled");
  recordActivity({
    category: "REQUEST",
    action: "REQUEST_CANCELLED",
    docId: r.doc_id,
    docTitle: r.doc_title,
    actor: actor.username,
    targetUser: r.requester,
    requestId: id,
    details: `Permintaan akses dibatalkan oleh ${actor.username}`,
  });
}

/** Admin mencabut akses, atau pemohon melepas aksesnya sendiri. */
export async function revokeRequest(id: number, actor: Actor): Promise<void> {
  const r = mustReq(id);
  if (!actor.isAdmin && lc(r.requester) !== lc(actor.username)) throw new WorkflowError("Anda tidak berhak mencabut akses ini");
  if (r.status !== "active") throw new WorkflowError("Hanya akses yang sedang aktif yang dapat dicabut");
  if (r.we_added) {
    try {
      await P.revokeView(r.doc_id, r.requester_id);
    } catch (e) {
      throw new WorkflowError(e instanceof Error ? e.message : "Gagal mencabut izin di Paperless");
    }
  }
  const ts = nowIso();
  db().prepare("UPDATE requests SET status='revoked', closed_at=?, updated_at=? WHERE id=? AND status='active'").run(ts, ts, id);
  const detail = lc(r.requester) === lc(actor.username) ? "Dilepas oleh pemohon" : "Dicabut oleh admin";
  addEvent(id, actor.username, "revoked", detail);
  recordActivity({
    category: "PERMISSION",
    action: "ACCESS_REVOKED",
    docId: r.doc_id,
    docTitle: r.doc_title,
    actor: actor.username,
    targetUser: r.requester,
    requestId: id,
    details: detail,
  });
  if (lc(r.requester) !== lc(actor.username)) void notifyRequester(mustReq(id), "revoked");
}

/** Cabut akses yang sudah melewati batas waktu. Mengembalikan jumlah yang diproses. */
export async function expireDue(): Promise<number> {
  const due = db()
    .prepare("SELECT * FROM requests WHERE status='active' AND expires_at IS NOT NULL AND expires_at <= ?")
    .all(nowIso()) as RequestRow[];
  let n = 0;
  for (const r of due) {
    try {
      if (r.we_added) await P.revokeView(r.doc_id, r.requester_id);
      const ts = nowIso();
      const upd = db().prepare("UPDATE requests SET status='expired', closed_at=?, updated_at=? WHERE id=? AND status='active'").run(ts, ts, r.id);
      if (upd.changes) {
        addEvent(r.id, "sistem", "expired", "Masa berlaku berakhir");
        recordActivity({
          category: "PERMISSION",
          action: "ACCESS_EXPIRED",
          docId: r.doc_id,
          docTitle: r.doc_title,
          actor: "sistem",
          targetUser: r.requester,
          requestId: r.id,
          details: "Masa berlaku akses telah berakhir (otomatis dicabut)",
        });
        void notifyRequester(mustReq(r.id), "expired");
        n++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (r.last_error !== msg) {
        db().prepare("UPDATE requests SET last_error=?, updated_at=? WHERE id=?").run(msg, nowIso(), r.id);
        addEvent(r.id, "sistem", "expire_failed", msg);
      }
      console.error(`[expire] permintaan #${r.id} gagal dicabut:`, msg);
    }
  }
  return n;
}

/** Ulangi pemberian akses yang gagal / terhenti. */
export async function retryPendingGrants(): Promise<number> {
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  db().prepare("UPDATE requests SET status='grant_failed', last_error='Proses terhenti di tengah jalan' WHERE status='granting' AND updated_at < ?").run(stale);
  const rows = db()
    .prepare("SELECT id FROM requests WHERE status IN ('approved','grant_failed') AND attempts < ?")
    .all(env.maxGrantAttempts) as { id: number }[];
  for (const r of rows) await grantAccess(r.id);
  return rows.length;
}

// ================================================================ PEMBACAAN
export function getRequestFull(id: number): { r: RequestRow; steps: StepRow[]; events: EventRow[] } | null {
  const r = getReq(id);
  if (!r) return null;
  const steps = db().prepare("SELECT * FROM request_steps WHERE request_id=? ORDER BY level").all(id) as StepRow[];
  const events = db().prepare("SELECT * FROM request_events WHERE request_id=? ORDER BY id").all(id) as EventRow[];
  return { r, steps, events };
}

/** Pemohon, approver di salah satu level, atau admin boleh melihat rincian. */
export function canViewRequest(f: { r: RequestRow; steps: StepRow[] }, a: { username: string; isAdmin: boolean }): boolean {
  if (a.isAdmin || lc(f.r.requester) === lc(a.username)) return true;
  return f.steps.some((s) => approversOf(s).some((x) => lc(x) === lc(a.username)));
}

/** Apakah user ini berhak melihat/mengunduh isi dokumen? Superuser atau pemohon dengan akses aktif. */
export function canAccessDocument(docId: number, actor: Actor): boolean {
  if (actor.isAdmin) return true;
  const row = db()
    .prepare("SELECT id FROM requests WHERE doc_id=? AND lower(requester)=? AND status='active'")
    .get(docId, lc(actor.username));
  return !!row;
}

/** Apakah user ini boleh memutuskan permintaan pada level yang sedang berjalan? */
export function canDecide(f: { r: RequestRow; steps: StepRow[] }, username: string): boolean {
  const me = lc(username);
  if (f.r.status !== "pending" || lc(f.r.requester) === me) return false;
  const cur = f.steps.find((s) => s.level === f.r.current_level);
  if (!cur || cur.status !== "pending" || !approversOf(cur).some((a) => lc(a) === me)) return false;
  return !f.steps.some((s) => s.decided_by && lc(s.decided_by) === me);
}

export function myRequests(username: string): RequestRow[] {
  return db().prepare("SELECT * FROM requests WHERE lower(requester)=? ORDER BY id DESC").all(lc(username)) as RequestRow[];
}

export type PendingItem = RequestRow & { step_label: string | null };

export function pendingFor(username: string): PendingItem[] {
  const me = lc(username);
  const rows = db()
    .prepare(
      `SELECT r.*, s.approvers AS step_approvers, s.label AS step_label
         FROM requests r JOIN request_steps s ON s.request_id=r.id AND s.level=r.current_level
        WHERE r.status='pending' ORDER BY r.created_at`,
    )
    .all() as (RequestRow & { step_approvers: string; step_label: string | null })[];
  const decided = new Set(
    (db().prepare("SELECT request_id FROM request_steps WHERE decided_by IS NOT NULL AND lower(decided_by)=?").all(me) as { request_id: number }[]).map((x) => x.request_id),
  );
  return rows
    .filter((r) => lc(r.requester) !== me && !decided.has(r.id) && (JSON.parse(r.step_approvers) as string[]).some((a) => lc(a) === me))
    .map(({ step_approvers: _a, ...rest }) => rest);
}

export function allRequests(f: { status?: string; q?: string; limit?: number }): RequestRow[] {
  const w: string[] = [];
  const a: (string | number)[] = [];
  if (f.status && f.status !== "all") {
    w.push("status=?");
    a.push(f.status);
  }
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    w.push("(requester LIKE ? OR doc_title LIKE ? OR CAST(doc_id AS TEXT)=? OR CAST(id AS TEXT)=?)");
    a.push(q, q, f.q.trim(), f.q.trim());
  }
  return db()
    .prepare(`SELECT * FROM requests ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`)
    .all(...a, Math.min(f.limit ?? 200, 1000)) as RequestRow[];
}

export const countByStatus = (): Record<string, number> => {
  const rows = db().prepare("SELECT status, COUNT(*) AS n FROM requests GROUP BY status").all() as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
};
