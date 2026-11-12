import { exportActivityReport } from "@/lib/activity-export-response";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ format: string }> },
) {
  const { format } = await params;
  return exportActivityReport(req, format, false);
}
