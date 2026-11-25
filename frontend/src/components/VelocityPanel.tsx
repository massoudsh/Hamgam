import type { VelocityReport } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  fast: "پرفروش",
  healthy: "متعادل",
  slow: "کند",
  dead: "راکد",
  idle: "بدون موجودی"
};

export function VelocityPanel({ report }: { report: VelocityReport }) {
  if (report.items.length === 0) {
    return <p className="panel-empty">دادهٔ فروشی برای تحلیل سرعت وجود ندارد.</p>;
  }

  return (
    <div className="ops-panel">
      <p className="ops-intro">سرعت فروش و روزهای باقی‌ماندهٔ موجودی در {report.windowDays.toLocaleString("fa-IR")} روز گذشته.</p>
      <div className="ops-table-wrap">
        <table className="ops-table" aria-label="سرعت فروش کالاها">
          <thead>
            <tr><th>کالا</th><th>فروش</th><th>درآمد</th><th>موجودی</th><th>پوشش</th><th>وضعیت</th></tr>
          </thead>
          <tbody>
            {report.items.map((item) => (
              <tr key={item.skuId}>
                <td><strong>{item.canonicalTitle}</strong><small>{item.internalCode}</small></td>
                <td>{item.unitsSold.toLocaleString("fa-IR")}</td>
                <td>{item.revenue.toLocaleString("fa-IR")} تومان</td>
                <td>{item.quantityOnHand.toLocaleString("fa-IR")}</td>
                <td>{item.daysOfCover === null ? "—" : `${item.daysOfCover.toLocaleString("fa-IR")} روز`}</td>
                <td><span className={`ops-chip ops-chip-${item.status}`}>{STATUS_LABELS[item.status] ?? item.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
