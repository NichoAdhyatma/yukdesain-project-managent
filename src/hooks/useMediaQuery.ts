"use client";

import { useSyncExternalStore } from "react";

/** true jika media query cocok. Saat render server selalu false (tampilan untuk layar kecil dulu). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
