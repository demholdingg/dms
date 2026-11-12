import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS policies(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  match_tag_id INTEGER,            -- NULL = kebijakan default
  priority INTEGER NOT NULL DEFAULT 100,
  max_days INTEGER,                -- NULL = boleh permanen
  default_days INTEGER NOT NULL DEFAULT 7,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS policy_steps(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  label TEXT,
  approvers TEXT NOT NULL,         -- JSON array username
  UNIQUE(policy_id, level)
);
CREATE TABLE IF NOT EXISTS requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester TEXT NOT NULL,
  requester_id INTEGER NOT NULL,
  doc_id INTEGER NOT NULL,
  doc_title TEXT,
  reason TEXT NOT NULL,
  requested_days INTEGER,          -- NULL = permanen
  policy_id INTEGER,
  policy_name TEXT,
  status TEXT NOT NULL,
  current_level INTEGER NOT NULL DEFAULT 1,
  we_added INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  granted_at TEXT,
  expires_at TEXT,
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_req_status ON requests(status);
CREATE INDEX IF NOT EXISTS ix_req_requester ON requests(requester);
CREATE INDEX IF NOT EXISTS ix_req_doc ON requests(doc_id);
CREATE TABLE IF NOT EXISTS request_steps(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  label TEXT,
  approvers TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  decided_by TEXT,
  comment TEXT,
  decided_at TEXT,
  UNIQUE(request_id, level)
);
CREATE TABLE IF NOT EXISTS request_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS ix_evt_req ON request_events(request_id);
CREATE TABLE IF NOT EXISTS activity_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  action TEXT NOT NULL,
  doc_id INTEGER,
  doc_title TEXT,
  actor TEXT NOT NULL,
  target_user TEXT,
  request_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_act_cat ON activity_logs(category);
CREATE INDEX IF NOT EXISTS ix_act_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS ix_act_doc ON activity_logs(doc_id);
CREATE INDEX IF NOT EXISTS ix_act_actor ON activity_logs(actor);
CREATE INDEX IF NOT EXISTS ix_act_req ON activity_logs(request_id);
CREATE INDEX IF NOT EXISTS ix_act_created ON activity_logs(created_at);
CREATE TABLE IF NOT EXISTS system_kv(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const g = globalThis as unknown as { __approvalDb?: Database.Database };
let schemaEnsured = false;

export function db(): Database.Database {
  if (!g.__approvalDb) {
    fs.mkdirSync(env.dataDir, { recursive: true });
    const d = new Database(path.join(env.dataDir, "portal.db"));
    d.pragma("journal_mode = WAL");
    d.pragma("foreign_keys = ON");
    d.pragma("busy_timeout = 5000");
    d.exec(SCHEMA);
    g.__approvalDb = d;
    schemaEnsured = true;
  }
  if (!schemaEnsured) {
    g.__approvalDb.exec(SCHEMA);
    schemaEnsured = true;
  }
  return g.__approvalDb;
}

export const nowIso = (): string => new Date().toISOString();

export type ActivityCategory = "DOCUMENT" | "REQUEST" | "APPROVAL" | "PERMISSION" | "ACCESS";

export type ActivityRow = {
  id: number;
  category: ActivityCategory;
  action: string;
  doc_id: number | null;
  doc_title: string | null;
  actor: string;
  target_user: string | null;
  request_id: number | null;
  details: string | null;
  created_at: string;
};

export function recordActivity(entry: {
  category: ActivityCategory;
  action: string;
  docId?: number | null;
  docTitle?: string | null;
  actor: string;
  targetUser?: string | null;
  requestId?: number | null;
  details?: string | null;
}): void {
  try {
    db()
      .prepare(
        `INSERT INTO activity_logs (category, action, doc_id, doc_title, actor, target_user, request_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.category,
        entry.action,
        entry.docId ?? null,
        entry.docTitle ?? null,
        entry.actor,
        entry.targetUser ?? null,
        entry.requestId ?? null,
        entry.details ?? null,
        nowIso()
      );
  } catch (e) {
    console.error("[recordActivity] gagal mencatat aktivitas:", e);
  }
}

export function listActivities(f: {
  category?: string;
  action?: string;
  actor?: string;
  docId?: number;
  q?: string;
  limit?: number;
  offset?: number;
}): { rows: ActivityRow[]; total: number } {
  const w: string[] = [];
  const a: (string | number)[] = [];

  if (f.category && f.category !== "all") {
    w.push("category = ?");
    a.push(f.category);
  }
  if (f.action && f.action !== "all") {
    w.push("action = ?");
    a.push(f.action);
  }
  if (f.actor?.trim()) {
    w.push("lower(actor) = ?");
    a.push(f.actor.trim().toLowerCase());
  }
  if (f.docId && Number.isInteger(f.docId)) {
    w.push("doc_id = ?");
    a.push(f.docId);
  }
  if (f.q?.trim()) {
    const term = `%${f.q.trim()}%`;
    w.push("(doc_title LIKE ? OR actor LIKE ? OR target_user LIKE ? OR details LIKE ? OR CAST(doc_id AS TEXT) = ?)");
    a.push(term, term, term, term, f.q.trim());
  }

  const whereClause = w.length ? "WHERE " + w.join(" AND ") : "";
  const totalRow = db().prepare(`SELECT COUNT(*) as count FROM activity_logs ${whereClause}`).get(...a) as { count: number } | undefined;
  const total = totalRow ? totalRow.count : 0;

  const limit = Math.min(Math.max(f.limit ?? 50, 1), 500);
  const offset = Math.max(f.offset ?? 0, 0);

  const rows = db()
    .prepare(`SELECT * FROM activity_logs ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...a, limit, offset) as ActivityRow[];

  return { rows, total };
}

export function countRecentActivities(): { docCount: number; reqCount: number; approvalCount: number } {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const dRow = db().prepare("SELECT COUNT(*) as c FROM activity_logs WHERE category='DOCUMENT' AND created_at >= ?").get(weekAgo) as { c: number };
  const rRow = db().prepare("SELECT COUNT(*) as c FROM activity_logs WHERE category='REQUEST' AND created_at >= ?").get(weekAgo) as { c: number };
  const aRow = db().prepare("SELECT COUNT(*) as c FROM activity_logs WHERE category='APPROVAL' AND created_at >= ?").get(weekAgo) as { c: number };
  return {
    docCount: dRow ? dRow.c : 0,
    reqCount: rRow ? rRow.c : 0,
    approvalCount: aRow ? aRow.c : 0,
  };
}

export function getSystemKv(key: string): string | null {
  const row = db().prepare("SELECT value FROM system_kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSystemKv(key: string, value: string): void {
  db().prepare("INSERT INTO system_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
