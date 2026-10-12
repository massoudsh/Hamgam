import type { CriticalStockItem } from "@/lib/types";

interface CriticalStockAlertsProps {
  items: CriticalStockItem[];
}

export function CriticalStockAlerts({ items }: CriticalStockAlertsProps) {
  if (items.length === 0) return null;

  return (
    <section className="critical-stock" id="inventory" aria-label="هشدار موجودی بحرانی">
      <div className="section-heading">
        <div>
          <p className="eyebrow">موجودی</p>
          <h2>کالاهای نیازمند تأمین</h2>
        </div>
        <span className="error-count">{items.length.toLocaleString("fa-IR")} کالا</span>
      </div>
      <ul className="critical-stock-list">
        {items.map((item) => (
          <li key={item.skuId}>
            <div>
              <strong>{item.canonicalTitle}</strong>
              <span>{item.internalCode}</span>
            </div>
            <p><b>{item.quantityOnHand.toLocaleString("fa-IR")}</b> از آستانهٔ {item.lowStockThreshold.toLocaleString("fa-IR")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
