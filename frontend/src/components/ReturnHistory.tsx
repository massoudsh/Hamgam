import type { ReturnRequest } from "@/lib/types";

interface ReturnHistoryProps {
  returns: ReturnRequest[];
}

export function ReturnHistory({ returns }: ReturnHistoryProps) {
  if (returns.length === 0) return null;

  return (
    <section className="return-history" aria-label="مرجوعی‌های اخیر">
      <div className="section-heading">
        <div>
          <p className="eyebrow">مرجوعی</p>
          <h2>مرجوعی‌های اخیر</h2>
        </div>
        <span className="result-count">{returns.length.toLocaleString("fa-IR")} درخواست</span>
      </div>
      <ul className="return-list">
        {returns.map((returned) => (
          <li key={returned.id}>
            <div>
              <strong>سفارش {returned.orderId}</strong>
              <p>{returned.reason ?? "بدون توضیح"} · {returned.items.length.toLocaleString("fa-IR")} قلم</p>
            </div>
            <time dateTime={returned.createdAt}>{new Date(returned.createdAt).toLocaleDateString("fa-IR-u-ca-persian")}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
