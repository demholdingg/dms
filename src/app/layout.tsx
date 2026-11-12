import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { getSession, canSeeAudit } from "@/lib/session";
import { pendingFor } from "@/lib/workflow";
import PortalShell from "@/components/PortalShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "PT Duta Energi Muliatama DMS",
  description: "Dashboard manajemen dokumen PT Duta Energi Muliatama",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  return (
    <html lang="id">
      <body>
        {session ? (
          <PortalShell
            session={session}
            pending={pendingFor(session.username).length}
            canAudit={canSeeAudit(session)}
          >
            {children}
          </PortalShell>
        ) : (
          <>
            <header className="public-header">
              <Link className="brand" href="/">
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
                <span>PT Duta Energi Muliatama DMS</span>
              </Link>
            </header>
            <main className="app-main">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
