import type { SalesReport as SalesReportData } from "@/lib/types";

interface SalesReportProps {
  report: SalesReportData;
}

const STATUS_LABELS: Record<string, string> = {
  new: "جدید",
  processing: "در حال ارسال",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  returned: "مرجوع‌شده",
  cancelled: "لغوشده"
};

export function SalesReport({ report }: SalesReportProps) {
  if (report.byChannel.length === 0 && report.byStatus.length === 0) return null;

  return (
    <section className="sales-report" id="reports" aria-label="گزارش فروش">
      <div className="section-heading">
        <div>
          <p className="eyebrow">گزارش‌ها</p>
          <h2>خلاصهٔ فروش</h2>
        </div>
      </div>
      <div className="report-grid">
        <div>
          <h3>فروش به تفکیک کانال</h3>
          <ul className="report-list">
            {report.byChannel.map((channel) => (
              <li key={channel.channelCode}>
                <span>{channel.channelDisplayName}</span>
                <strong>{channel.totalAmount.toLocaleString("fa-IR")} تومان</strong>
                <small>{channel.orderCount.toLocaleString("fa-IR")} سفارش</small>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>وضعیت سفارش‌ها</h3>
          <ul className="report-list">
            {report.byStatus.map((status) => (
              <li key={status.status}>
                <span>{STATUS_LABELS[status.status] ?? status.status}</span>
                <strong>{status.orderCount.toLocaleString("fa-IR")}</strong>
                <small>سفارش</small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
