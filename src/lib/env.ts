// Semua konfigurasi dibaca saat dipakai (bukan saat import) supaya mudah diuji.
const num = (v: string | undefined, d: number): number => {
  if (v === undefined || v.trim() === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const env = {
  /** Alamat Paperless untuk panggilan server-ke-server (alamat internal Docker). */
  get paperlessUrl(): string {
    return (process.env.PAPERLESS_URL ?? "http://webserver:8000").replace(/\/+$/, "");
  },
  /** Alamat publik Paperless seperti dibuka pengguna di browser (default ke paperlessUrl). */
  get paperlessPublicUrl(): string {
    return (process.env.PAPERLESS_PUBLIC_URL ?? process.env.PAPERLESS_URL ?? "http://localhost:8000").replace(/\/+$/, "");
  },
  /** Opsional: paksa header Host (berguna jika PAPERLESS_ALLOWED_HOSTS tidak memuat nama internal). */
  get hostHeader(): string {
    return process.env.PAPERLESS_HOST_HEADER?.trim() ?? "";
  },
  /** Token user Paperless dengan hak superuser (untuk mengubah izin dokumen). */
  get serviceToken(): string {
    const t = process.env.PAPERLESS_SERVICE_TOKEN?.trim();
    if (!t) throw new Error("PAPERLESS_SERVICE_TOKEN belum diisi");
    return t;
  },
  get sessionSecret(): string {
    const s = process.env.SESSION_SECRET ?? "";
    if (s.length < 32) throw new Error("SESSION_SECRET wajib diisi (minimal 32 karakter acak)");
    return s;
  },
  get sessionHours(): number {
    return num(process.env.SESSION_HOURS, 8);
  },
  get cookieSecure(): boolean {
    return process.env.COOKIE_SECURE === "true";
  },
  get dataDir(): string {
    return process.env.DATA_DIR ?? "./data";
  },
  get appUrl(): string {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  },
  get tz(): string {
    return process.env.DISPLAY_TZ ?? "Asia/Jakarta";
  },
  get searchMinChars(): number {
    return num(process.env.SEARCH_MIN_CHARS, 3);
  },
  get maxGrantAttempts(): number {
    return num(process.env.MAX_GRANT_ATTEMPTS, 10);
  },
  // layanan audit (paperless-audit)
  get auditUrl(): string {
    return (process.env.AUDIT_URL ?? "http://audit:8080").replace(/\/+$/, "");
  },
  get auditKey(): string {
    return process.env.AUDIT_API_KEY?.trim() ?? "";
  },
  get auditViewers(): Set<string> {
    return new Set(
      (process.env.AUDIT_VIEWERS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
  },
  // notifikasi
  get webhookUrl(): string {
    return process.env.NOTIFY_WEBHOOK_URL?.trim() ?? "";
  },
  get smtpHost(): string {
    return process.env.SMTP_HOST?.trim() ?? "";
  },
  get smtpPort(): number {
    return num(process.env.SMTP_PORT, 587);
  },
  get smtpUser(): string {
    return process.env.SMTP_USER?.trim() ?? "";
  },
  get smtpPass(): string {
    return process.env.SMTP_PASS ?? "";
  },
  get smtpFrom(): string {
    return process.env.SMTP_FROM?.trim() || "approval@localhost";
  },
};
