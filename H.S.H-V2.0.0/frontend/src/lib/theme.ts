export const THEME_KEY = "hebrih-theme";

export function getSavedTheme(): "dark" | "light" {
  try {
    if (typeof document !== "undefined") {
      const dataTheme = document.documentElement.getAttribute("data-theme");
      if (dataTheme === "dark" || dataTheme === "light") return dataTheme as "dark" | "light";
      if (document.documentElement.classList.contains("themeDark")) return "dark";
      if (document.documentElement.classList.contains("themeLight")) return "light";
    }
    if (typeof window !== "undefined") {
      const s = localStorage.getItem(THEME_KEY);
      return s === "dark" ? "dark" : "light";
    }
  } catch {}
  return "light";
}

export function applyTheme(theme: "dark" | "light"): void {
  try {
    if (typeof document !== "undefined") {
      const d = document.documentElement;
      d.setAttribute("data-theme", theme);
      (d as any).dataset.theme = theme;
      d.classList.remove("themeLight", "themeDark");
      d.classList.add(theme === "dark" ? "themeDark" : "themeLight");
      (d.style as any).colorScheme = theme;
      if (document.body) {
        document.body.setAttribute("data-theme", theme);
      }
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_KEY, theme);
      window.dispatchEvent(new Event("hebrih-theme-change"));
    }
  } catch {}
}
