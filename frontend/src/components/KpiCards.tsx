import type { DashboardKpis } from "@/lib/types";

interface KpiCardsProps {
  kpis: DashboardKpis;
}

const cards = [
  { key: "ordersLast30Days" as const, label: "سفارش‌های ۳۰ روز اخیر", hint: "نسبت به ماه گذشته", tone: "primary" },
  { key: "criticalStockSkuCount" as const, label: "موجودی بحرانی", hint: "نیازمند رسیدگی", tone: "warning" },
  { key: "overslellingPreventedCount" as const, label: "جلوگیری از فروش بیش از موجودی", hint: "با همگام‌سازی خودکار", tone: "success" }
];

export function KpiCards({ kpis }: KpiCardsProps) {
  return (
    <section aria-label="شاخص‌های کلیدی" className="kpi-cards">
      {cards.map((card) => (
        <div key={card.key} className={`kpi-card kpi-card-${card.tone}`} data-testid={`kpi-${card.key}`}>
          <div className="kpi-card-top"><span className="kpi-label">{card.label}</span><span className="kpi-indicator" aria-hidden="true" /></div>
          <strong className="kpi-value">{kpis[card.key].toLocaleString("fa-IR")}</strong>
          <span className="kpi-hint">{card.hint}</span>
        </div>
      ))}
    </section>
  );
}
