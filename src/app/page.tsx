import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardCheck,
  FilePlus2,
  FileText,
  History,
  ShieldAlert,
} from "lucide-react";
import AccessHistoryTable from "@/components/AccessHistoryTable";
import Flash from "@/components/Flash";
import RequestTable from "@/components/RequestTable";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { countRecentActivities, listActivities } from "@/lib/db";
import { getDocumentCount } from "@/lib/paperless";
import {
  ACTIVITY_ACTION_LABEL,
  ACTIVITY_ACTION_TONE,
  fmtDate,
} from "@/lib/format";
import { canSeeAudit, requireSession } from "@/lib/session";
import { countByStatus, myRequests, pendingFor } from "@/lib/workflow";

function MetricCard({
  label,
  value,
  detail,
  href,
  icon: Icon,
  alert,
}: {
  label: string;
  value: number | string;
  detail: string;
  href: string;
  icon: typeof ClipboardCheck;
  alert?: string;
}) {
  return (
    <Card className="metric-card">
      <CardHeader className="metric-card-header">
        <div className="metric-icon">
          <Icon aria-hidden="true" />
        </div>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="metric-card-content">
        <div className="metric-value">{value}</div>
        <p className="metric-detail">{alert || detail}</p>
        <Link className="metric-link" href={href}>
          Lihat detail <ArrowUpRight aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}

export default async function Home() {
  const session = await requireSession();
  const mine = myRequests(session.username);
  const waiting = pendingFor(session.username).length;
  const active = mine.filter((request) => request.status === "active").length;
  const stats = session.isAdmin ? countByStatus() : null;
  const recentStats = session.isAdmin ? countRecentActivities() : null;
  let documentCount: number | null = null;
  if (session.isAdmin) {
    try {
      documentCount = await getDocumentCount();
    } catch (error) {
      console.error("[dashboard-document-count]", error);
    }
  }
  const recentActivities = session.isAdmin
    ? listActivities({ limit: 6 }).rows
    : [];
  const recentAccess = canSeeAudit(session)
    ? listActivities({ category: "ACCESS", limit: 6 }).rows
    : [];
  const failedGrants = stats?.grant_failed ?? 0;

  return (
    <div className="dashboard-page">
      <Flash />

      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">RINGKASAN PORTAL</p>
          <h1>Selamat datang, {session.username}</h1>
          <p className="dashboard-subtitle">
            Pantau permintaan akses dokumen dan aktivitas persetujuan Anda.
          </p>
        </div>
        <Button
          nativeButton={false}
          className="dashboard-cta"
          render={<Link href="/request/new" />}
        >
          <FilePlus2 aria-hidden="true" />
          Ajukan akses
        </Button>
      </section>

      <section className="metrics-grid" aria-label="Ringkasan">
        <MetricCard
          label="Menunggu keputusan Anda"
          value={waiting}
          detail="Permintaan perlu ditinjau"
          href="/approvals"
          icon={ClipboardCheck}
        />
        <MetricCard
          label="Akses aktif milik Anda"
          value={active}
          detail="Dokumen yang dapat diakses"
          href="/"
          icon={FileText}
        />
        {stats && (
          <MetricCard
            label="Permintaan berjalan"
            value={(stats.pending ?? 0) + failedGrants}
            detail="Di seluruh portal"
            alert={
              failedGrants > 0
                ? `${failedGrants} pemberian akses gagal dan perlu ditinjau`
                : undefined
            }
            href="/admin/requests"
            icon={ShieldAlert}
          />
        )}
        {recentStats && (
          <MetricCard
            label="Dokumen DMS baru"
            value={recentStats.docCount}
            detail="Ditambahkan dalam 7 hari terakhir"
            href="/admin/activities?category=DOCUMENT"
            icon={History}
          />
        )}
        {session.isAdmin && (
          <MetricCard
            label="Total dokumen Paperless"
            value={documentCount ?? "—"}
            detail={
              documentCount === null
                ? "Jumlah dokumen gagal dimuat dari Paperless"
                : "Seluruh dokumen di Paperless"
            }
            href="/admin/documents"
            icon={FileText}
          />
        )}
      </section>

      {session.isAdmin && recentActivities.length > 0 && (
        <Card className="dashboard-panel">
          <CardHeader className="panel-heading">
            <div>
              <CardTitle>Aktivitas terkini</CardTitle>
              <CardDescription>
                Aktivitas terbaru yang tercatat di portal.
              </CardDescription>
            </div>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href="/admin/activities" />}
            >
              Semua aktivitas
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent className="panel-content">
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Aktivitas</th>
                    <th>Dokumen</th>
                    <th>Aktor</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivities.map((activity) => (
                    <tr key={activity.id}>
                      <td className="text-muted whitespace-nowrap">
                        {fmtDate(activity.created_at)}
                      </td>
                      <td>
                        <span
                          className={`badge ${ACTIVITY_ACTION_TONE[activity.action] || "muted"}`}
                        >
                          {ACTIVITY_ACTION_LABEL[activity.action] ||
                            activity.action}
                        </span>
                      </td>
                      <td>
                        {activity.doc_id
                          ? `#${activity.doc_id} ${activity.doc_title || "-"}`
                          : "-"}
                      </td>
                      <td>{activity.actor}</td>
                      <td className="text-muted">{activity.details || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {canSeeAudit(session) && (
        <Card className="dashboard-panel">
          <CardHeader className="panel-heading">
            <div>
              <CardTitle>Audit akses terkini check</CardTitle>
              <CardDescription>
                Pembukaan dan unduhan dokumen yang berhasil melalui portal.
              </CardDescription>
            </div>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href="/admin/audit" />}
            >
              Riwayat audit
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent className="panel-content">
            <AccessHistoryTable rows={recentAccess} compact />
          </CardContent>
        </Card>
      )}

      <Card className="dashboard-panel">
        <CardHeader className="panel-heading">
          <div>
            <CardTitle>Permintaan saya</CardTitle>
            <CardDescription>
              Riwayat permintaan akses dokumen Anda.
            </CardDescription>
          </div>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href="/request/new" />}
          >
            Ajukan baru
            <ArrowUpRight aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent className="panel-content">
          <RequestTable rows={mine} />
        </CardContent>
      </Card>
    </div>
  );
}
