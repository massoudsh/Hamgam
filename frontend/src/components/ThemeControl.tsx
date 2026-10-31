"use client";

import { useEffect, useState } from "react";

export function ThemeControl() {
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("hamgam-theme");
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
        document.documentElement.dataset.theme = saved;
      }
    } catch {}
  }, []);

  return (
    <label className="theme-control">ظاهر
      <select value={theme} onChange={(event) => {
        const next = event.target.value;
        setTheme(next);
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem("hamgam-theme", next); } catch {}
      }}>
        <option value="system">سیستم</option>
        <option value="light">روشن</option>
        <option value="dark">تیره</option>
      </select>
    </label>
  );
}
