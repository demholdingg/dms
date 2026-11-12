import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    db().prepare("SELECT 1").get();
    return new Response("ok");
  } catch {
    return new Response("db error", { status: 500 });
  }
}
