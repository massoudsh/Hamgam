import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeControl } from "@/components/ThemeControl";
import { GlassSurface } from "@/components/GlassSurface";

describe("glass theme", () => {
  it("persists an explicit theme and allows returning to system preference", () => {
    render(<ThemeControl />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "dark" } });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("hamgam-theme")).toBe("dark");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "system" } });
    expect(document.documentElement.dataset.theme).toBe("system");
  });

  it("preserves accessible labels and surface variants", () => {
    render(<GlassSurface variant="elevated" aria-label="گزارش">محتوا</GlassSurface>);
    expect(screen.getByRole("region", { name: "گزارش" })).toHaveAttribute("data-variant", "elevated");
  });
});
