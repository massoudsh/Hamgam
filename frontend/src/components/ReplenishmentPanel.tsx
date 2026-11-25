"use client";

import { useState } from "react";
import type { ApiClient } from "@/lib/apiClient";
import type { PurchaseOrder, ReplenishmentSuggestion } from "@/lib/types";

interface ReplenishmentPanelProps {
  client: ApiClient;
  suggestions: ReplenishmentSuggestion[];
  purchaseOrders: PurchaseOrder[];
  isDemo: boolean;
  onRefresh: () => void;
}

export function ReplenishmentPanel({ client, suggestions, purchaseOrders, isDemo, onRefresh }: ReplenishmentPanelProps) {
  const [selectedSku, setSelectedSku] = useState("");
  const [quantity, setQuantity] = useState("");
  const [supplier, setSupplier] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});

  const selected = suggestions.find((item) => item.skuId === selectedSku);

  async function submitOrder(event: React.FormEvent) {
    event.preventDefault();
    if (isDemo) {
      setMessage("در حالت نمایشی امکان ساخت سفارش خرید نیست.");
      return;
    }
    const qty = Number(quantity);
    if (!selected || !Number.isInteger(qty) || qty <= 0) {
      setMessage("کالا و مقدار معتبر را انتخاب کنید.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await client.createPurchaseOrder({
        supplierName: supplier.trim() || undefined,
        items: [{ skuId: selected.skuId, quantity: qty }]
      });
      setMessage("سفارش خرید ثبت شد.");
      setSelectedSku("");
      setQuantity("");
      setSupplier("");
      onRefresh();
    } catch {
      setMessage("ثبت سفارش خرید ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  async function receive(order: PurchaseOrder, itemId: string, remaining: number) {
    const requested = Number(receiveQty[itemId] || remaining);
    if (!Number.isInteger(requested) || requested <= 0) {
      setMessage("مقدار تحویل باید عددی مثبت باشد.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await client.receivePurchaseOrderItem(order.id, itemId, requested);
      setReceiveQty((prev) => ({ ...prev, [itemId]: "" }));
      setMessage("ورود کالا ثبت و موجودی به‌روزرسانی شد.");
      onRefresh();
    } catch {
      setMessage("ثبت ورود کالا ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-panel">
      <p className="ops-intro">
        پیشنهاد تأمین بر پایهٔ فروش ۳۰ روز گذشته و موجودی راه است؛ مقدار در راه از پیشنهاد کسر می‌شود.
      </p>
      {suggestions.length === 0 ? (
        <p className="panel-empty">فعلاً نیازی به تأمین وجود ندارد.</p>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-table" aria-label="پیشنهادهای تأمین">
            <thead>
              <tr><th>کالا</th><th>موجودی</th><th>فروش ۳۰ روز</th><th>پوشش</th><th>در راه</th><th>پیشنهاد</th></tr>
            </thead>
            <tbody>
              {suggestions.map((item) => (
                <tr key={item.skuId}>
                  <td><strong>{item.canonicalTitle}</strong><small>{item.internalCode}</small></td>
                  <td>{item.quantityOnHand.toLocaleString("fa-IR")}</td>
                  <td>{item.unitsSold.toLocaleString("fa-IR")}</td>
                  <td className={item.daysOfCover !== null && item.daysOfCover <= 7 ? "ops-danger" : ""}>
                    {item.daysOfCover === null ? "—" : `${item.daysOfCover.toLocaleString("fa-IR")} روز`}
                  </td>
                  <td>{item.onOrder.toLocaleString("fa-IR")}</td>
                  <td><b>{item.suggestedQty.toLocaleString("fa-IR")}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="ops-form" onSubmit={submitOrder}>
        <label>کالا
          <select value={selectedSku} onChange={(event) => {
            setSelectedSku(event.target.value);
            const match = suggestions.find((item) => item.skuId === event.target.value);
            setQuantity(match ? String(match.suggestedQty) : "");
          }}>
            <option value="">انتخاب کالا</option>
            {suggestions.map((item) => (
              <option key={item.skuId} value={item.skuId}>{item.canonicalTitle}</option>
            ))}
          </select>
        </label>
        <label>تعداد<input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label>تأمین‌کننده<input type="text" value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="اختیاری" /></label>
        <button type="submit" disabled={busy || !selectedSku}>ثبت سفارش خرید</button>
      </form>

      <h3 className="ops-subheading">سفارش‌های خرید</h3>
      {purchaseOrders.length === 0 ? (
        <p className="panel-empty">سفارش خریدی ثبت نشده است.</p>
      ) : (
        <ul className="ops-order-list">
          {purchaseOrders.map((order) => (
            <li key={order.id}>
              <div className="ops-order-head">
                <strong>{order.supplierName ?? "بدون تأمین‌کننده"}</strong>
                <span className={`status-badge ops-status-${order.status}`}>{PO_STATUS[order.status] ?? order.status}</span>
                <time>{new Date(order.createdAt).toLocaleDateString("fa-IR-u-ca-persian", { month: "short", day: "numeric" })}</time>
              </div>
              <ul className="ops-order-items">
                {order.items.map((item) => {
                  const remaining = item.quantityOrdered - item.quantityReceived;
                  return (
                    <li key={item.id}>
                      <span>{item.canonicalTitle} · {item.quantityReceived.toLocaleString("fa-IR")}/{item.quantityOrdered.toLocaleString("fa-IR")}</span>
                      {remaining > 0 && order.status !== "cancelled" && (
                        <span className="ops-receive">
                          <input
                            type="number"
                            min="1"
                            max={remaining}
                            placeholder={String(remaining)}
                            aria-label={`مقدار ورود ${item.canonicalTitle}`}
                            value={receiveQty[item.id] ?? ""}
                            onChange={(event) => setReceiveQty((prev) => ({ ...prev, [item.id]: event.target.value }))}
                          />
                          <button type="button" disabled={busy || isDemo} onClick={() => receive(order, item.id, remaining)}>ثبت ورود</button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="form-message" role="status">{message}</p>}
    </div>
  );
}

const PO_STATUS: Record<string, string> = {
  ordered: "در انتظار",
  partially_received: "تحویل جزئی",
  received: "تحویل کامل",
  cancelled: "لغوشده"
};
