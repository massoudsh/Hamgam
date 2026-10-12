import type { OrderHubRow } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  new: "جدید",
  processing: "در حال ارسال",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  returned: "مرجوع‌شده",
  cancelled: "لغوشده"
};

interface OrderHubTableProps {
  orders: OrderHubRow[];
}

export function OrderHubTable({ orders }: OrderHubTableProps) {
  if (orders.length === 0) {
    return <p className="order-hub-empty">سفارشی با این فیلترها یافت نشد.</p>;
  }

  return (
    <table className="order-hub-table" aria-label="جدول سفارش‌ها">
      <thead>
        <tr>
          <th>شناسه سفارش</th>
          <th>کانال</th>
          <th>مشتری</th>
          <th>وضعیت</th>
          <th>مبلغ</th>
          <th>تاریخ ثبت</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id} data-testid="order-row">
            <td className="order-id">{order.externalOrderId}</td>
            <td><span className="channel-name">{order.channelDisplayName}</span></td>
            <td>{order.customerName ?? "—"}</td>
            <td>
              <span className={`status-badge status-${order.status}`}>
                {STATUS_LABELS[order.status] ?? order.status}
              </span>
            </td>
            <td className="amount">{order.totalAmount != null ? `${order.totalAmount.toLocaleString("fa-IR")} تومان` : "—"}</td>
            <td>{new Date(order.placedAt).toLocaleDateString("fa-IR-u-ca-persian", { year: "numeric", month: "short", day: "numeric" })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
