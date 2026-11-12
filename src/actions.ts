"use server";

// Semua aksi di sini adalah endpoint publik: setiap fungsi WAJIB memeriksa sesi sendiri.

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { FLASH_COOKIE } from "@/lib/flash";
import { listUsers, PaperlessError, userByUsername, verifyLogin, type Me, type PUser } from "@/lib/paperless";
import { allow, resetLimit } from "@/lib/ratelimit";
import { endSession, requireAdmin, requireSession, startSession } from "@/lib/session";
import * as W from "@/lib/workflow";

async function go(path: string, kind: "error" | "ok", msg: string): Promise<never> {
  const jar = await cookies();
  jar.set(FLASH_COOKIE, JSON.stringify({ kind, message: msg }), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/",
    maxAge: 60,
  });
  redirect(path);
}

export async function clearFlashAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(FLASH_COOKIE);
}

function msgOf(e: unknown): string {
  if (e instanceof W.WorkflowError) return e.message;
  console.error("[action]", e);
  return "Terjadi kesalahan di server. Coba lagi atau hubungi admin.";
}

// ------------------------------------------------------------------ sesi
export async function loginAction(fd: FormData): Promise<void> {
  const username = String(fd.get("username") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  if (!username || !password) await go("/login", "error", "Isi username dan password");

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "lokal").split(",")[0].trim();
  const uKey = `login:u:${username.toLowerCase()}`;
  if (!allow(`login:ip:${ip}`, 30, 600_000) || !allow(uKey, 10, 600_000))
    await go("/login", "error", "Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.");

  let me: Me | null = null;
  let err = "";
  try {
    const token = await verifyLogin(username, password);
    if (!token) err = "Username atau password salah";
    else {
      // Akun biasa bisa ditolak oleh endpoint /api/ui_settings/. Ambil profil akun
      // melalui daftar pengguna yang dibaca dengan token layanan superuser.
      me = await userByUsername(username);
      if (!me) err = "Akun tidak ditemukan atau tidak aktif di Paperless.";
    }
  } catch (e) {
    console.error("[login]", e instanceof Error ? e.message : "unknown error");
    if (e instanceof PaperlessError && e.status === 0) {
      err = "Portal tidak dapat menghubungi Paperless. Admin perlu memeriksa PAPERLESS_URL dan koneksi jaringan server.";
    } else if (e instanceof PaperlessError && [404, 405].includes(e.status)) {
      err = `Endpoint API Paperless tidak ditemukan (HTTP ${e.status}). Admin perlu memeriksa PAPERLESS_URL agar menunjuk ke alamat utama Paperless.`;
    } else if (e instanceof PaperlessError) {
      err = `Paperless gagal memproses login (HTTP ${e.status}). Periksa log Paperless atau hubungi admin.`;
    } else {
      err = "Paperless mengirim respons yang tidak dapat diproses. Hubungi admin.";
    }
  }
  if (!me) return await go("/login", "error", err);
  resetLimit(uKey);
  await startSession({ username: me.username, id: me.id, isAdmin: me.isAdmin });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

// ------------------------------------------------------------- permintaan
export async function createRequestAction(fd: FormData): Promise<void> {
  const s = await requireSession();
  const docId = Number(fd.get("doc_id"));
  const daysRaw = String(fd.get("days") ?? "");
  const days = daysRaw === "permanent" ? null : Number(daysRaw);
  let id = 0;
  let err = "";
  try {
    id = await W.createRequest({ requester: s, docId, reason: String(fd.get("reason") ?? ""), days });
  } catch (e) {
    err = msgOf(e);
  }
  if (err) await go(`/request/new?doc=${Number.isInteger(docId) && docId > 0 ? docId : ""}`, "error", err);
  await go(`/requests/${id}`, "ok", "Permintaan diajukan dan menunggu persetujuan level 1");
}

export async function decideAction(fd: FormData): Promise<void> {
  const s = await requireSession();
  const id = Number(fd.get("request_id"));
  const back = fd.get("back") === "detail" ? `/requests/${id}` : "/approvals";
  const decision = String(fd.get("decision") ?? "");
  let err = "";
  let ok = "";
  try {
    if (decision !== "approve" && decision !== "reject") throw new W.WorkflowError("Pilih Setujui atau Tolak");
    const approve = decision === "approve";
    const r = await W.decide({ requestId: id, actor: s, approve, comment: String(fd.get("comment") ?? "") });
    ok = !approve
      ? "Permintaan ditolak"
      : r.status === "active"
        ? "Disetujui. Akses sudah diberikan kepada pemohon"
        : r.status === "grant_failed"
          ? "Disetujui, tetapi akses belum berhasil diberikan di Paperless (akan dicoba ulang otomatis)"
          : "Disetujui. Diteruskan ke level berikutnya";
  } catch (e) {
    err = msgOf(e);
  }
  if (err) await go(back, "error", err);
  await go(back, "ok", ok);
}

export async function cancelAction(fd: FormData): Promise<void> {
  const s = await requireSession();
  const id = Number(fd.get("request_id"));
  let err = "";
  try {
    W.cancelRequest(id, s);
  } catch (e) {
    err = msgOf(e);
  }
  if (err) await go(`/requests/${id}`, "error", err);
  await go(`/requests/${id}`, "ok", "Permintaan dibatalkan");
}

export async function revokeAction(fd: FormData): Promise<void> {
  const s = await requireSession();
  const id = Number(fd.get("request_id"));
  let err = "";
  try {
    await W.revokeRequest(id, s);
  } catch (e) {
    err = msgOf(e);
  }
  if (err) await go(`/requests/${id}`, "error", err);
  await go(`/requests/${id}`, "ok", "Akses dicabut");
}

export async function retryGrantAction(fd: FormData): Promise<void> {
  const s = await requireAdmin();
  const id = Number(fd.get("request_id"));
  let err = "";
  let status = "";
  try {
    status = (await W.retryGrant(id, s)).status;
  } catch (e) {
    err = msgOf(e);
  }
  if (err) await go(`/requests/${id}`, "error", err);
  if (status === "active") await go(`/requests/${id}`, "ok", "Akses berhasil diberikan");
  await go(`/requests/${id}`, "error", "Pemberian akses masih gagal. Lihat pesan kesalahan di bawah.");
}

// -------------------------------------------------------------- kebijakan
function parseSteps(text: string, users: PUser[]): { steps: { label: string | null; approvers: string[] }[]; unknown: string[] } {
  const byName = new Map(users.filter((u) => u.is_active).map((u) => [u.username.toLowerCase(), u.username]));
  const unknown: string[] = [];
  const steps = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(":");
      const label = i >= 0 ? line.slice(0, i).trim() : "";
      const rest = i >= 0 ? line.slice(i + 1) : line;
      const names = [...new Set(rest.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))];
      const approvers = names
        .map((n) => {
          const canonical = byName.get(n.toLowerCase());
          if (!canonical) unknown.push(n);
          return canonical;
        })
        .filter((x): x is string => !!x);
      return { label: label || null, approvers };
    });
  return { steps, unknown };
}

export async function savePolicyAction(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(fd.get("id")) || undefined;
  const back = id ? `/admin/policies?edit=${id}` : "/admin/policies";
  let err = "";
  try {
    const users = await listUsers();
    const { steps, unknown } = parseSteps(String(fd.get("steps") ?? ""), users);
    if (unknown.length) throw new W.WorkflowError(`Username tidak dikenal atau nonaktif di Paperless: ${unknown.join(", ")}`);
    const tag = String(fd.get("tag") ?? "").trim();
    const tagNum = tag === "" ? null : Number(tag);
    if (tagNum !== null && !Number.isInteger(tagNum)) throw new W.WorkflowError("Tag tidak valid");
    const maxRaw = String(fd.get("max_days") ?? "").trim();
    W.savePolicy({
      id,
      name: String(fd.get("name") ?? ""),
      matchTagId: tagNum,
      priority: Number(String(fd.get("priority") ?? "").trim() || 100),
      maxDays: maxRaw === "" ? null : Number(maxRaw),
      defaultDays: Number(String(fd.get("default_days") ?? "").trim() || 7),
      active: fd.get("active") === "on",
      steps,
    });
  } catch (e) {
    err = msgOf(e);
  }
  if (err) await go(back, "error", err);
  await go("/admin/policies", "ok", "Kebijakan disimpan");
}

export async function deletePolicyAction(fd: FormData): Promise<void> {
  await requireAdmin();
  W.deletePolicy(Number(fd.get("id")));
  await go("/admin/policies", "ok", "Kebijakan dihapus (permintaan yang sudah ada tidak terpengaruh)");
}

export async function togglePolicyAction(fd: FormData): Promise<void> {
  await requireAdmin();
  W.setPolicyActive(Number(fd.get("id")), fd.get("active") === "1");
  await go("/admin/policies", "ok", "Status kebijakan diubah");
}

export async function syncDocumentsAction(): Promise<void> {
  await requireAdmin();
  let count = 0;
  let err = "";
  try {
    const { syncNewDocumentsFromPaperless } = await import("@/lib/scheduler");
    count = await syncNewDocumentsFromPaperless();
  } catch (e) {
    err = e instanceof Error ? e.message : "Gagal sinkronisasi dokumen dari Paperless";
  }
  if (err) await go("/admin/activities", "error", err);
  await go("/admin/activities", "ok", `Sinkronisasi selesai. ${count > 0 ? `${count} dokumen baru tercatat.` : "Semua dokumen sudah tersinkronisasi."}`);
}
