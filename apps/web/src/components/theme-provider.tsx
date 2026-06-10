"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";

/**
 * next-themes renders an inline <script> (its pre-hydration anti-flicker
 * snippet) inside the React tree, which React 19 / Next 16 warns about.
 * The SSR pass emits the real executable script so the theme still applies
 * before paint; on the client we mark it `application/json` so React skips
 * it instead of warning. See pacocoursey/next-themes#385.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const scriptProps =
    typeof window === "undefined"
      ? undefined
      : ({ type: "application/json" } as const);

  return (
    <NextThemesProvider scriptProps={scriptProps} {...props}>
      {children}
    </NextThemesProvider>
  );
}
