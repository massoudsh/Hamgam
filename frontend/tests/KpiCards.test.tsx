import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCards } from "@/components/KpiCards";

describe("KpiCards", () => {
  it("renders all three KPI values", () => {
    render(
      <KpiCards kpis={{ ordersLast30Days: 12, criticalStockSkuCount: 3, overslellingPreventedCount: 5 }} />
    );
    expect(screen.getByTestId("kpi-ordersLast30Days")).toHaveTextContent("۱۲");
    expect(screen.getByTestId("kpi-criticalStockSkuCount")).toHaveTextContent("۳");
    expect(screen.getByTestId("kpi-overslellingPreventedCount")).toHaveTextContent("۵");
  });
});
