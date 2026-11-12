import { cookies } from "next/headers";
import { FLASH_COOKIE } from "@/lib/flash";
import FlashMessage from "@/components/FlashMessage";

type FlashPayload = { kind: "error" | "ok"; message: string };

function parseFlash(value: string | undefined): FlashPayload | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "kind" in parsed &&
      (parsed.kind === "error" || parsed.kind === "ok") &&
      "message" in parsed &&
      typeof parsed.message === "string"
    ) {
      return { kind: parsed.kind, message: parsed.message };
    }
  } catch {
    return null;
  }
  return null;
}

export default async function Flash() {
  const jar = await cookies();
  const cookie = jar.get(FLASH_COOKIE);
  const flash = parseFlash(cookie?.value);
  return <FlashMessage flash={flash} clear={!!cookie} />;
}
