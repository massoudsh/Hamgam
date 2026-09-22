import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderHubTable } from "@/components/OrderHubTable";
import type { OrderHubRow } from "@/lib/types";

const rows: OrderHubRow[] = [
  {
    id: "1",
    externalOrderId: "BAS-1",
    status: "new",
    channelCode: "basalam",
    channelDisplayName: "باسلام",
    customerName: "سارا",
    totalAmount: 10000,
    placedAt: "2026-08-01T00:00:00Z"
  }
];

describe("OrderHubTable", () => {
  it("renders a row per order with channel + status", () => {
    render(<OrderHubTable orders={rows} />);
    expect(screen.getAllByTestId("order-row")).toHaveLength(1);
    expect(screen.getByText("باسلام")).toBeInTheDocument();
    expect(screen.getByText("جدید")).toBeInTheDocument();
  });

  it("shows an empty state when there are no orders", () => {
    render(<OrderHubTable orders={[]} />);
    expect(screen.getByText(/یافت نشد/)).toBeInTheDocument();
  });
});
