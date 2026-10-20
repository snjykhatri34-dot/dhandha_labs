"use client";

import { useEffect } from "react";

/**
 * Streamed sections arrive after the browser has tried to jump to #hash.
 * Render this inside the streamed section to finish the jump once it exists.
 */
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView();
  }, [id]);
  return null;
}
