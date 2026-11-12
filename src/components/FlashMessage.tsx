"use client";

import { useEffect, useState } from "react";
import { clearFlashAction } from "@/actions";

type FlashPayload = { kind: "error" | "ok"; message: string };

export default function FlashMessage({ flash, clear }: { flash: FlashPayload | null; clear: boolean }) {
  const [visibleFlash, setVisibleFlash] = useState(flash);

  useEffect(() => {
    if (flash) setVisibleFlash(flash);
  }, [flash]);

  useEffect(() => {
    if (clear) void clearFlashAction();
  }, [clear]);

  if (!visibleFlash) return null;
  return (
    <div className={`flash ${visibleFlash.kind}`} role={visibleFlash.kind === "error" ? "alert" : "status"}>
      {visibleFlash.message}
    </div>
  );
}
