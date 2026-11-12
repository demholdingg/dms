"use client";

import { useEffect } from "react";
import { clearFlashAction } from "@/actions";

type FlashPayload = { kind: "error" | "ok"; message: string };

export default function FlashMessage({ flash, clear }: { flash: FlashPayload | null; clear: boolean }) {
  useEffect(() => {
    if (clear) void clearFlashAction();
  }, [clear]);

  if (!flash) return null;
  return (
    <div className={`flash ${flash.kind}`} role={flash.kind === "error" ? "alert" : "status"}>
      {flash.message}
    </div>
  );
}
