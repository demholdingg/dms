import { STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export default function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={`badge ${STATUS_TONE[status] ?? "muted"}`}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
