import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "@/lib/apiClient";
import { OperationsWorkspace } from "@/components/OperationsWorkspace";
import { listingHealthFixture } from "./fixtures";

const client = new ApiClient({ sellerId: "00000000-0000-0000-0000-000000000000" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OperationsWorkspace", () => {
  it("renders accessible tabs and switches panels", async () => {
    render(<OperationsWorkspace client={client} orders={[]} isDemo onOrdersChanged={() => {}} />);
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      expect.stringContaining("تأمین و خرید"),
      expect.stringContaining("اختلاف کانال‌ها"),
      expect.stringContaining("تحویل سفارش"),
      expect.stringContaining("سرعت فروش"),
      expect.stringContaining("مشتریان")
    ]);
    expect(screen.getByRole("tab", { name: /تأمین و خرید/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /مشتریان/ }));
    expect(screen.getByRole("tab", { name: /مشتریان/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-customers");
    expect(within(screen.getByRole("tabpanel")).getByText("هنوز مشتری‌ای ثبت نشده است.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /تحویل سفارش/ }));
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-fulfillment");
  });

  it("shows channel discrepancies in the health tab", async () => {
    vi.spyOn(client, "getListingHealth").mockResolvedValue({ data: listingHealthFixture, demo: false });
    render(<OperationsWorkspace client={client} orders={[]} isDemo onOrdersChanged={() => {}} />);
    fireEvent.click(await screen.findByRole("tab", { name: /اختلاف کانال‌ها/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("اختلاف موجودی")).toBeInTheDocument();
    expect(within(panel).getByText("کتونی رانینگ")).toBeInTheDocument();
  });
});
