"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Activity,
  Archive,
  ClipboardCheck,
  FilePlus2,
  FileText,
  History,
  LogOut,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { logoutAction } from "@/actions";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { Session } from "@/lib/session";

type PortalShellProps = {
  session: Session;
  pending: number;
  canAudit: boolean;
  children: React.ReactNode;
};

const primaryLinks = [
  { href: "/", label: "Beranda", icon: Activity },
  { href: "/request/new", label: "Ajukan akses", icon: FilePlus2 },
  { href: "/approvals", label: "Persetujuan", icon: ClipboardCheck },
];

const adminLinks = [
  { href: "/admin/documents", label: "Akses dokumen", icon: FileText },
  { href: "/admin/activities", label: "Riwayat aktivitas", icon: History },
  { href: "/admin/requests", label: "Semua permintaan", icon: Archive },
  { href: "/admin/policies", label: "Kebijakan", icon: ScrollText },
];

function isLinkActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname.startsWith(href);
}

export default function PortalShell({
  session,
  pending,
  canAudit,
  children,
}: PortalShellProps) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar className="portal-sidebar" collapsible="icon">
        <SidebarHeader className="portal-sidebar-header">
          <Link className="sidebar-brand" href="/">
            <span className="brand-mark">
              <Image
                className="brand-logo"
                src="/dutaenergilogo.png"
                alt=""
                width={44}
                height={44}
                priority
              />
            </span>
            <span className="sidebar-brand-copy">
              <span className="sidebar-brand-name">PT DEM DASHBOARD</span>
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu utama</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {primaryLinks.map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      render={<Link href={href} />}
                      isActive={isLinkActive(pathname, href)}
                      tooltip={label}
                    >
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </SidebarMenuButton>
                    {href === "/approvals" && pending > 0 && (
                      <SidebarMenuBadge>{pending}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {session.isAdmin && (
            <SidebarGroup>
              <SidebarGroupLabel>Administrasi</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminLinks.map(({ href, label, icon: Icon }) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        render={<Link href={href} />}
                        isActive={isLinkActive(pathname, href)}
                        tooltip={label}
                      >
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {canAudit && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        render={<Link href="/admin/audit" />}
                        isActive={isLinkActive(pathname, "/admin/audit")}
                        tooltip="Audit akses"
                      >
                        <ShieldCheck aria-hidden="true" />
                        <span>Audit akses</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {!session.isAdmin && canAudit && (
            <SidebarGroup>
              <SidebarGroupLabel>Audit</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/admin/audit" />}
                      isActive={isLinkActive(pathname, "/admin/audit")}
                      tooltip="Audit akses"
                    >
                      <ShieldCheck aria-hidden="true" />
                      <span>Audit akses</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="portal-sidebar-footer">
          <div className="sidebar-account">
            <span className="user-avatar" aria-hidden="true">
              {session.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="sidebar-account-copy">
              <span className="sidebar-account-name">{session.username}</span>
              <span className="sidebar-account-role">
                {session.isAdmin ? "Administrator" : "Pengguna"}
              </span>
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="portal-main">
        <header className="portal-topbar">
          <div className="topbar-context">
            <SidebarTrigger aria-label="Buka atau tutup menu navigasi" />
            <SidebarSeparator
              orientation="vertical"
              className="topbar-separator"
            />
            <div>
              <p className="topbar-title">PT Duta Energi Muliatama DMS</p>
              <p className="topbar-caption">Persetujuan dan kontrol akses</p>
            </div>
          </div>
          <form action={logoutAction}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOut aria-hidden="true" />
              Keluar
            </Button>
          </form>
        </header>
        <main className="app-main">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
