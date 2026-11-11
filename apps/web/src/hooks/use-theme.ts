import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "rgo-guide.theme";

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore blocked storage
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    const root = document.documentElement;
    // switch without every component running its own transition
    root.classList.add("[&_*]:!transition-none");
    root.classList.toggle("dark", theme === "dark");
    const t = window.setTimeout(() => root.classList.remove("[&_*]:!transition-none"), 0);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // ignore blocked storage
    }
    return () => window.clearTimeout(t);
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return { theme, toggle };
}
