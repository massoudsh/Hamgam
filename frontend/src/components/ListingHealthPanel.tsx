import type { ListingHealthSummary, ListingIssue } from "@/lib/types";

const ISSUE_LABELS: Record<ListingIssue, string> = {
  unmatched: "بدون تطبیق کالا",
  stock_mismatch: "اختلاف موجودی",
  inactive_with_stock: "غیرفعال با موجودی",
  active_out_of_stock: "فعال بدون موجودی",
  stale_sync: "همگام‌سازی قدیمی"
};

export function ListingHealthPanel({ health }: { health: ListingHealthSummary }) {
  if (health.totalListings === 0) {
    return <p className="panel-empty">آگهی‌ای برای بررسی وجود ندارد.</p>;
  }

  const problems = health.items.filter((item) => item.severity !== "ok");

  return (
    <div className="ops-panel">
      <div className="ops-stats">
        <div><span>کل آگهی‌ها</span><strong>{health.totalListings.toLocaleString("fa-IR")}</strong></div>
        <div className="ops-stat-ok"><span>سالم</span><strong>{health.healthy.toLocaleString("fa-IR")}</strong></div>
        <div className="ops-stat-warn"><span>هشدار</span><strong>{health.withWarnings.toLocaleString("fa-IR")}</strong></div>
        <div className="ops-stat-bad"><span>خطا</span><strong>{health.withErrors.toLocaleString("fa-IR")}</strong></div>
      </div>
      {problems.length === 0 ? (
        <p className="panel-empty">همهٔ آگهی‌ها با موجودی اصلی هماهنگ‌اند.</p>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="اختلاف کانال‌ها">
            <thead>
              <tr><th>کالا</th><th>کانال</th><th>موجودی اصلی</th><th>موجودی کانال</th><th>وضعیت</th></tr>
            </thead>
            <tbody>
              {problems.map((item) => (
                <tr key={item.channelListingId}>
                  <td><strong>{item.canonicalTitle}</strong><small>{item.internalCode ?? item.externalProductId}</small></td>
                  <td>{item.channelDisplayName}</td>
                  <td>{item.quantityOnHand === null ? "—" : item.quantityOnHand.toLocaleString("fa-IR")}</td>
                  <td>{item.channelStock === null ? "—" : item.channelStock.toLocaleString("fa-IR")}</td>
                  <td>
                    <span className={`ops-chip ops-chip-${item.severity}`}>
                      {item.issues.map((issue) => ISSUE_LABELS[issue]).join("، ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
