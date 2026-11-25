"use client";

import { useState } from "react";
import type { ApiClient } from "@/lib/apiClient";
import type { FulfillmentStatus, OrderHubRow } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  new: "جدید",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  returned: "مرجوع‌شده",
  cancelled: "لغوشده"
};

interface FulfillmentPanelProps {
  client: ApiClient;
  orders: OrderHubRow[];
  isDemo: boolean;
  onUpdated: () => void;
}

export function FulfillmentPanel({ client, orders, isDemo, onUpdated }: FulfillmentPanelProps) {
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const queue = orders.filter((order) => ["new", "processing", "shipped"].includes(order.status));

  async function move(order: OrderHubRow, status: FulfillmentStatus) {
    if (isDemo) {
      setMessage("در حالت نمایشی تغییر وضعیت سفارش فعال نیست.");
      return;
    }
    setBusyId(order.id);
    setMessage("");
    try {
      await client.updateOrderStatus(order.id, status, tracking[order.id]);
      setMessage(`${order.externalOrderId}: ${STATUS_LABELS[status]} شد.`);
      onUpdated();
    } catch {
      setMessage("تغییر وضعیت ناموفق بود؛ ترتیب مراحل را بررسی کنید.");
    } finally {
      setBusyId(null);
    }
  }

  if (queue.length === 0) {
    return <p className="panel-empty">سفارش باز برای تحویل وجود ندارد.</p>;
  }

  return (
    <div className="ops-panel">
      <ul className="ops-order-list">
        {queue.map((order) => (
          <li key={order.id}>
            <div className="ops-order-head">
              <strong>{order.externalOrderId}</strong>
              <span className={`status-badge status-${order.status}`}>{STATUS_LABELS[order.status] ?? order.status}</span>
              <span className="ops-muted">{order.channelDisplayName} · {order.customerName ?? "بدون نام"}</span>
            </div>
            {order.trackingCode && <p className="ops-muted">کد رهگیری: <span className="order-id">{order.trackingCode}</span></p>}
            <div className="ops-actions">
              {order.status === "new" && (
                <>
                  <button type="button" disabled={busyId === order.id} onClick={() => move(order, "processing")}>شروع آماده‌سازی</button>
                  <button type="button" className="ops-secondary" disabled={busyId === order.id} onClick={() => move(order, "cancelled")}>لغو سفارش</button>
                </>
              )}
              {order.status === "processing" && (
                <>
                  <input
                    type="text"
                    placeholder="کد رهگیری پستی"
                    aria-label={`کد رهگیری ${order.externalOrderId}`}
                    value={tracking[order.id] ?? ""}
                    onChange={(event) => setTracking((prev) => ({ ...prev, [order.id]: event.target.value }))}
                  />
                  <button type="button" disabled={busyId === order.id} onClick={() => move(order, "shipped")}>ثبت ارسال</button>
                  <button type="button" className="ops-secondary" disabled={busyId === order.id} onClick={() => move(order, "cancelled")}>لغو سفارش</button>
                </>
              )}
              {order.status === "shipped" && (
                <button type="button" disabled={busyId === order.id} onClick={() => move(order, "delivered")}>تأیید تحویل</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {message && <p className="form-message" role="status">{message}</p>}
    </div>
  );
}
