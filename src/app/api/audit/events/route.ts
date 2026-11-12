import { proxyAudit } from "@/lib/audit-proxy";

export const GET = (req: Request) => proxyAudit(req, "/_audit/api/events", false);
