import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/Dashboard";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.unstubAllEnvs();
});

describe("dashboard workspace", () => {
  it("keeps orders ahead of operational panels and exposes working section links", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    render(<Dashboard />);
    const orders = await screen.findByRole("region", { name: "مرکز سفارش‌ها" });
    await screen.findByRole("region", { name: "شاخص‌های کلیدی" });
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(within(main).getByRole("heading", { name: "همه‌چیز، هماهنگ." })).toBeInTheDocument();
    const channels = screen.getByRole("heading", { name: "وضعیت اتصال کانال‌ها" }).closest("section")!;
    expect(orders.compareDocumentPosition(channels) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: /مشاهده سفارش‌ها/ })).toHaveAttribute("href", "#orders");
    const navigation = screen.getByRole("navigation");
    for (const link of within(navigation).getAllByRole("link")) {
      expect(document.querySelector(link.getAttribute("href")!)).not.toBeNull();
    }
  });

  it("allows switching themes from the dashboard header", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    render(<Dashboard />);
    await screen.findByRole("region", { name: "شاخص‌های کلیدی" });
    const header = screen.getByRole("combobox", { name: "ظاهر" }).closest("header");
    expect(header).not.toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "ظاهر" }), { target: { value: "dark" } });
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent.change(screen.getByRole("combobox", { name: "ظاهر" }), { target: { value: "light" } });
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
