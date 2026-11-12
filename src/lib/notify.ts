import nodemailer from "nodemailer";
import { env } from "./env";
import { listUsers } from "./paperless";
import type { RequestRow } from "./workflow";

type Msg = { event: string; req: RequestRow; recipients: string[]; subject: string; text: string };

let transport: nodemailer.Transporter | null = null;
function getTransport(): nodemailer.Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    });
  }
  return transport;
}

const durasi = (d: number | null) => (d === null ? "permanen" : `${d} hari`);

/** Kirim ke webhook (opsional) dan email (opsional). Tidak pernah melempar error. */
async function deliver(m: Msg): Promise<void> {
  const url = `${env.appUrl}/requests/${m.req.id}`;
  const text = `${m.text}\n\n${url}`;

  if (env.webhookUrl) {
    try {
      await fetch(env.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: m.event,
          request_id: m.req.id,
          doc_id: m.req.doc_id,
          doc_title: m.req.doc_title,
          requester: m.req.requester,
          recipients: m.recipients,
          subject: m.subject,
          text,
          url,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      console.error("[notify] webhook gagal:", e instanceof Error ? e.message : e);
    }
  }

  if (env.smtpHost && m.recipients.length) {
    try {
      const users = await listUsers().catch(() => []);
      const wanted = new Set(m.recipients.map((r) => r.toLowerCase()));
      const to = users
        .filter((u) => wanted.has(u.username.toLowerCase()) && u.email)
        .map((u) => u.email);
      if (to.length) await getTransport().sendMail({ from: env.smtpFrom, to, subject: m.subject, text });
    } catch (e) {
      console.error("[notify] email gagal:", e instanceof Error ? e.message : e);
    }
  }
}

function safe(p: Promise<void>): Promise<void> {
  return p.catch((e) => console.error("[notify]", e instanceof Error ? e.message : e));
}

export function notifyApprovers(req: RequestRow, approvers: string[], level: number): Promise<void> {
  return safe(
    deliver({
      event: "approval_needed",
      req,
      recipients: approvers,
      subject: `[Approval] ${req.requester} meminta akses dokumen #${req.doc_id}`,
      text:
        `${req.requester} meminta akses ke dokumen "${req.doc_title ?? "#" + req.doc_id}" (#${req.doc_id}).\n` +
        `Alasan: ${req.reason}\nDurasi: ${durasi(req.requested_days)}\nMenunggu persetujuan level ${level}.`,
    }),
  );
}

export type Outcome = "granted" | "rejected" | "expired" | "revoked" | "grant_failed";

export function notifyRequester(req: RequestRow, kind: Outcome, extra = ""): Promise<void> {
  const title = `"${req.doc_title ?? "#" + req.doc_id}" (#${req.doc_id})`;
  const map: Record<Outcome, { subject: string; text: string }> = {
    granted: {
      subject: `[Approval] Akses dokumen #${req.doc_id} disetujui`,
      text: `Permintaan akses ke dokumen ${title} telah disetujui dan akses sudah aktif.${extra}`,
    },
    rejected: {
      subject: `[Approval] Akses dokumen #${req.doc_id} ditolak`,
      text: `Permintaan akses ke dokumen ${title} ditolak.${extra}`,
    },
    expired: {
      subject: `[Approval] Akses dokumen #${req.doc_id} berakhir`,
      text: `Akses Anda ke dokumen ${title} telah berakhir.`,
    },
    revoked: {
      subject: `[Approval] Akses dokumen #${req.doc_id} dicabut`,
      text: `Akses Anda ke dokumen ${title} telah dicabut.${extra}`,
    },
    grant_failed: {
      subject: `[Approval] Akses dokumen #${req.doc_id} belum bisa diberikan`,
      text: `Permintaan ${title} sudah disetujui tetapi akses belum berhasil diberikan. Admin telah diberi tahu.`,
    },
  };
  return safe(deliver({ event: kind, req, recipients: [req.requester], ...map[kind] }));
}
