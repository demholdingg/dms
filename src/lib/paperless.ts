import http from "node:http";
import https from "node:https";
import { env } from "./env";

/**
 * Permintaan HTTP dengan node:http(s), bukan fetch: fetch (undici) mengabaikan header Host,
 * padahal PAPERLESS_HOST_HEADER kadang dibutuhkan agar lolos PAPERLESS_ALLOWED_HOSTS.
 */
function httpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const h = { ...headers };
    if (body !== undefined) h["Content-Length"] = String(Buffer.byteLength(body));
    const req = lib.request(u, { method, headers: h, timeout: 15_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export class PaperlessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "PaperlessError";
  }
}

type Opts = { method?: string; token?: string | null; body?: unknown };

/** Panggilan ke API Paperless. token === null berarti tanpa Authorization (untuk /api/token/). */
async function px<T = unknown>(path: string, o: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (o.token !== null) headers.Authorization = `Token ${o.token ?? env.serviceToken}`;
  if (env.hostHeader) headers.Host = env.hostHeader;
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  let res: { status: number; text: string };
  try {
    res = await httpRequest(env.paperlessUrl + path, o.method ?? "GET", headers, o.body !== undefined ? JSON.stringify(o.body) : undefined);
  } catch {
    throw new PaperlessError(0, "Paperless tidak dapat dihubungi");
  }
  if (res.status < 200 || res.status >= 300) {
    // isi respons sengaja tidak disertakan (bisa memuat data sensitif)
    throw new PaperlessError(res.status, `Paperless menjawab ${res.status} untuk ${o.method ?? "GET"} ${path.split("?")[0]}`);
  }
  if (res.status === 204 || res.text === "") return null as T;
  try {
    return JSON.parse(res.text) as T;
  } catch {
    throw new PaperlessError(res.status, `Respons Paperless bukan JSON untuk ${path.split("?")[0]}`);
  }
}

// ---------------------------------------------------------------- cache kecil
const cache = new Map<string, { exp: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.v as T;
  const v = await fn();
  cache.set(key, { exp: Date.now() + ttlMs, v });
  return v;
}
export function clearPaperlessCache(): void {
  cache.clear();
}

async function listAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= 50; page++) {
    const r = await px<{ results: T[]; next: string | null }>(`${path}${sep}page_size=500&page=${page}`);
    out.push(...r.results);
    if (!r.next) break;
  }
  return out;
}

// ------------------------------------------------------------------- login
/** Verifikasi username+password ke Paperless. Mengembalikan token atau null jika salah. */
export async function verifyLogin(username: string, password: string): Promise<string | null> {
  try {
    const r = await px<{ token?: string }>("/api/token/", {
      method: "POST",
      token: null,
      body: { username, password },
    });
    return r.token ?? null;
  } catch (e) {
    if (e instanceof PaperlessError && [400, 401, 403].includes(e.status)) return null;
    throw e;
  }
}

export type Me = { id: number; username: string; isAdmin: boolean };

// ------------------------------------------------------------- data rujukan
export type PUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_active: boolean;
  groups: number[];
  is_superuser?: boolean;
};
export const listUsers = (): Promise<PUser[]> => cached("users", 60_000, () => listAll<PUser>("/api/users/"));
export async function userByUsername(username: string): Promise<Me | null> {
  const user = (await listUsers()).find((u) => u.username.toLowerCase() === username.toLowerCase());
  return user?.is_active ? { id: user.id, username: user.username, isAdmin: !!user.is_superuser } : null;
}
export const displayName = (u: PUser): string => `${u.first_name} ${u.last_name}`.trim() || u.username;

export type PTag = { id: number; name: string };
export const listTags = (): Promise<PTag[]> => cached("tags", 120_000, () => listAll<PTag>("/api/tags/"));

async function nameMap(path: string): Promise<Map<number, string>> {
  const rows = await cached(`names:${path}`, 300_000, () => listAll<{ id: number; name: string }>(path));
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ---------------------------------------------------------------- dokumen
export type Perms = {
  view: { users: number[]; groups: number[] };
  change: { users: number[]; groups: number[] };
};
export type PDoc = {
  id: number;
  title: string;
  owner: number | null;
  tags: number[];
  document_type: number | null;
  correspondent: number | null;
  created: string;
  permissions?: Perms;
};

/** Ambil dokumen lengkap dengan izin. null jika tidak ada. */
export async function getDocument(id: number): Promise<PDoc | null> {
  try {
    return await px<PDoc>(`/api/documents/${id}/?full_perms=true`);
  } catch (e) {
    if (e instanceof PaperlessError && e.status === 404) return null;
    throw e;
  }
}

function needPerms(d: PDoc): Perms {
  const p = d.permissions;
  if (!p || !p.view || !p.change) {
    // Jangan pernah menulis izin jika data izin saat ini tidak diketahui (bisa menimpa izin yang ada).
    throw new Error("Paperless tidak mengembalikan data izin dokumen; perubahan dibatalkan demi keamanan");
  }
  return {
    view: { users: p.view.users ?? [], groups: p.view.groups ?? [] },
    change: { users: p.change.users ?? [], groups: p.change.groups ?? [] },
  };
}

export type Viewer = { id: number; groups: number[]; isAdmin: boolean };

/** Alasan user ini sudah bisa melihat dokumen, atau null bila belum bisa. */
export function accessReason(d: PDoc, u: Viewer): string | null {
  if (u.isAdmin) return "akun Anda berstatus superuser, yang otomatis bisa melihat semua dokumen";
  if (d.owner === null) return "dokumen ini tidak dikunci (tidak punya owner)";
  if (d.owner === u.id) return "Anda adalah pemilik (owner) dokumen ini";
  const p = d.permissions;
  if (!p) return null;
  if (p.view.users.includes(u.id) || p.change.users.includes(u.id)) return "izin lihat/ubah diberikan langsung atas nama Anda pada dokumen ini";
  const gs = new Set(u.groups);
  if (p.view.groups.some((g) => gs.has(g)) || p.change.groups.some((g) => gs.has(g)))
    return "izin dokumen ini diberikan ke sebuah grup yang Anda ikuti";
  return null;
}

/** Apakah user ini sudah bisa melihat dokumen? */
export function canView(d: PDoc, u: Viewer): boolean {
  return accessReason(d, u) !== null;
}

/** Beri hak lihat. added=false bila user sudah ada di daftar (tidak perlu dicabut nanti). */
export async function grantView(docId: number, userId: number): Promise<{ added: boolean }> {
  const d = await getDocument(docId);
  if (!d) throw new Error(`Dokumen #${docId} tidak ditemukan di Paperless`);
  const p = needPerms(d);
  if (p.view.users.includes(userId)) return { added: false };
  await px(`/api/documents/${docId}/`, {
    method: "PATCH",
    body: { set_permissions: { view: { users: [...p.view.users, userId], groups: p.view.groups }, change: p.change } },
  });
  const check = await getDocument(docId);
  if (!check || !needPerms(check).view.users.includes(userId)) {
    throw new Error("Izin tidak terdeteksi setelah diubah; periksa hak akses akun layanan di Paperless");
  }
  return { added: true };
}

/** Cabut hak lihat yang sebelumnya diberikan. Dokumen yang sudah hilang dianggap beres. */
export async function revokeView(docId: number, userId: number): Promise<void> {
  const d = await getDocument(docId);
  if (!d) return;
  const p = needPerms(d);
  if (!p.view.users.includes(userId)) return;
  await px(`/api/documents/${docId}/`, {
    method: "PATCH",
    body: {
      set_permissions: {
        view: { users: p.view.users.filter((u) => u !== userId), groups: p.view.groups },
        change: p.change,
      },
    },
  });
  const check = await getDocument(docId);
  if (check && needPerms(check).view.users.includes(userId)) {
    throw new Error("Izin masih terdeteksi setelah dicabut; periksa hak akses akun layanan di Paperless");
  }
}

// ----------------------------------------------------------------- pencarian
export type DocHit = {
  id: number;
  title: string;
  created: string;
  typeName: string | null;
  correspondent: string | null;
  locked: boolean;
};

/** Pencarian judul untuk form permintaan. Hanya metadata minimal, tanpa isi dokumen. */
export async function searchDocuments(q: string): Promise<DocHit[]> {
  const term = q.trim();
  if (term.length < env.searchMinChars && !/^\d+$/.test(term)) return [];
  let docs: Array<Pick<PDoc, "id" | "title" | "created" | "document_type" | "correspondent" | "owner">>;
  if (/^\d+$/.test(term)) {
    try {
      docs = [await px(`/api/documents/${Number(term)}/`)];
    } catch (e) {
      if (e instanceof PaperlessError && e.status === 404) docs = [];
      else throw e;
    }
  } else {
    const r = await px<{ results: typeof docs }>(
      `/api/documents/?title__icontains=${encodeURIComponent(term)}&page_size=15&ordering=-created`,
    );
    docs = r.results;
  }
  const [types, corrs] = await Promise.all([
    nameMap("/api/document_types/").catch(() => new Map<number, string>()),
    nameMap("/api/correspondents/").catch(() => new Map<number, string>()),
  ]);
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    created: d.created,
    typeName: d.document_type ? (types.get(d.document_type) ?? null) : null,
    correspondent: d.correspondent ? (corrs.get(d.correspondent) ?? null) : null,
    locked: d.owner !== null && d.owner !== undefined,
  }));
}

export type RecentDoc = {
  id: number;
  title: string;
  created: string;
  added?: string;
  owner: number | null;
  ownerName: string | null;
  typeName: string | null;
  correspondent: string | null;
  locked: boolean;
};

/** Ambil dokumen terbaru berdasarkan ID terbesar dari Paperless untuk sinkronisasi. */
export async function getRecentDocuments(pageSize = 25): Promise<RecentDoc[]> {
  const r = await px<{
    results: Array<Pick<PDoc, "id" | "title" | "created" | "document_type" | "correspondent" | "owner"> & { added?: string }>;
  }>(`/api/documents/?ordering=-id&page_size=${Math.min(pageSize, 100)}`);
  const docs = r.results ?? [];
  const [types, corrs, users] = await Promise.all([
    nameMap("/api/document_types/").catch(() => new Map<number, string>()),
    nameMap("/api/correspondents/").catch(() => new Map<number, string>()),
    listUsers().catch(() => [] as PUser[]),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u.username]));
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    created: d.created,
    added: d.added,
    owner: d.owner ?? null,
    ownerName: d.owner !== null && d.owner !== undefined ? (userMap.get(d.owner) ?? `User #${d.owner}`) : null,
    typeName: d.document_type ? (types.get(d.document_type) ?? null) : null,
    correspondent: d.correspondent ? (corrs.get(d.correspondent) ?? null) : null,
    locked: d.owner !== null && d.owner !== undefined,
  }));
}

/** Ambil jumlah seluruh dokumen dari metadata paginasi Paperless. */
export const getDocumentCount = (): Promise<number> =>
  cached("document-count", 60_000, async () => {
    const r = await px<{ count: number }>("/api/documents/?page_size=1");
    if (!Number.isInteger(r.count) || r.count < 0) {
      throw new Error("Paperless mengembalikan jumlah dokumen yang tidak valid");
    }
    return r.count;
  });

// ------------------------------------------------------------- preview & download
export async function getDocumentFile(
  docId: number,
  mode: "preview" | "download",
): Promise<{ buffer: Buffer; contentType: string; filename?: string }> {
  const path = `/api/documents/${docId}/${mode}/`;
  const headers: Record<string, string> = {
    Authorization: `Token ${env.serviceToken}`,
  };
  if (env.hostHeader) headers.Host = env.hostHeader;

  return new Promise((resolve, reject) => {
    const u = new URL(env.paperlessUrl + path);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { method: "GET", headers, timeout: 30_000 }, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        return reject(new PaperlessError(status, `Gagal mengambil file dokumen #${docId} (${status})`));
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const disposition = res.headers["content-disposition"];
        let filename: string | undefined;
        if (disposition) {
          const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disposition);
          if (m) filename = decodeURIComponent(m[1]);
        }
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: res.headers["content-type"] || "application/pdf",
          filename,
        });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}
