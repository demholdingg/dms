import { env } from "./env";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: env.tz }).format(new Date(iso));
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu persetujuan",
  approved: "Disetujui, memberikan akses",
  granting: "Memberikan akses",
  grant_failed: "Gagal memberi akses (dicoba ulang)",
  active: "Akses aktif",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
  revoked: "Dicabut",
};

export const STATUS_TONE: Record<string, string> = {
  pending: "warn",
  approved: "info",
  granting: "info",
  grant_failed: "bad",
  active: "ok",
  rejected: "bad",
  cancelled: "muted",
  expired: "muted",
  revoked: "muted",
};

export const EVENT_LABEL: Record<string, string> = {
  created: "Permintaan diajukan",
  approved_step: "Disetujui",
  approved_all: "Semua level menyetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
  granted: "Akses diberikan",
  grant_failed: "Gagal memberi akses",
  expired: "Akses kedaluwarsa",
  revoked: "Akses dicabut",
  retry: "Pemberian akses dicoba ulang",
  expire_failed: "Gagal mencabut akses kedaluwarsa",
};

export const daysLabel = (d: number | null): string => (d === null ? "Permanen" : `${d} hari`);

export const ACTIVITY_CATEGORY_LABEL: Record<string, string> = {
  DOCUMENT: "Dokumen DMS",
  REQUEST: "Permintaan Akses",
  APPROVAL: "Persetujuan",
  PERMISSION: "Hak Akses",
  ACCESS: "Akses Fisik Dokumen",
};

export const ACTIVITY_ACTION_LABEL: Record<string, string> = {
  DOC_ADDED: "Dokumen Baru Masuk",
  DOC_UPDATED: "Dokumen Diperbarui",
  REQUEST_SUBMITTED: "Permintaan Diajukan",
  REQUEST_CANCELLED: "Permintaan Dibatalkan",
  STEP_APPROVED: "Level Disetujui",
  STEP_REJECTED: "Permintaan Ditolak",
  ACCESS_GRANTED: "Hak Akses Diberikan",
  ACCESS_REVOKED: "Hak Akses Dicabut",
  ACCESS_EXPIRED: "Hak Akses Kedaluwarsa",
  GRANT_RETRY: "Coba Ulang Hak Akses",
  DOC_VIEWED: "Dokumen Dilihat (PDF)",
  DOC_DOWNLOADED: "Dokumen Diunduh",
};

export const ACTIVITY_ACTION_TONE: Record<string, string> = {
  DOC_ADDED: "info",
  DOC_UPDATED: "muted",
  REQUEST_SUBMITTED: "warn",
  REQUEST_CANCELLED: "muted",
  STEP_APPROVED: "ok",
  STEP_REJECTED: "bad",
  ACCESS_GRANTED: "ok",
  ACCESS_REVOKED: "bad",
  ACCESS_EXPIRED: "muted",
  GRANT_RETRY: "warn",
  DOC_VIEWED: "info",
  DOC_DOWNLOADED: "info",
};
