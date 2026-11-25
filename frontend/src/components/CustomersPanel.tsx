import type { CustomerInsights } from "@/lib/types";

export function CustomersPanel({ insights }: { insights: CustomerInsights }) {
  if (insights.totalCustomers === 0) {
    return <p className="panel-empty">هنوز مشتری‌ای ثبت نشده است.</p>;
  }

  return (
    <div className="ops-panel">
      <div className="ops-stats">
        <div><span>مشتریان</span><strong>{insights.totalCustomers.toLocaleString("fa-IR")}</strong></div>
        <div><span>خرید تکراری</span><strong>{insights.repeatCustomers.toLocaleString("fa-IR")}</strong></div>
        <div className="ops-stat-ok"><span>نرخ بازگشت</span><strong>{insights.repeatRate.toLocaleString("fa-IR")}٪</strong></div>
      </div>
      <div className="ops-table-wrap">
        <table className="ops-table" aria-label="مشتریان برتر">
          <thead>
            <tr><th>مشتری</th><th>سفارش</th><th>مجموع خرید</th><th>آخرین خرید</th></tr>
          </thead>
          <tbody>
            {insights.topCustomers.map((customer, index) => (
              <tr key={`${customer.phone ?? customer.name}-${index}`}>
                <td>
                  <strong>{customer.name ?? "بدون نام"}</strong>
                  <small className="order-id">{customer.phone ?? "—"}</small>
                </td>
                <td>
                  {customer.orderCount.toLocaleString("fa-IR")}
                  {customer.isRepeat && <span className="ops-chip ops-chip-ok">تکراری</span>}
                </td>
                <td>{customer.totalSpent.toLocaleString("fa-IR")} تومان</td>
                <td>{new Date(customer.lastOrderAt).toLocaleDateString("fa-IR-u-ca-persian", { year: "numeric", month: "short", day: "numeric" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
