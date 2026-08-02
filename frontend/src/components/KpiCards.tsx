import type { DashboardKpis } from "@/lib/types";

interface KpiCardsProps {
  kpis: DashboardKpis;
}

const cards = [
  { key: "ordersLast30Days" as const, label: "سفارش‌های ۳۰ روز اخیر" },
  { key: "criticalStockSkuCount" as const, label: "موجودی بحرانی" },
  { key: "overslellingPreventedCount" as const, label: "overselling جلوگیری‌شده" }
];

export function KpiCards({ kpis }: KpiCardsProps) {
  return (
    <section aria-label="شاخص‌های کلیدی" className="kpi-cards">
      {cards.map((card) => (
        <div key={card.key} className="kpi-card" data-testid={`kpi-${card.key}`}>
          <span className="kpi-value">{kpis[card.key]}</span>
          <span className="kpi-label">{card.label}</span>
        </div>
      ))}
    </section>
  );
}
