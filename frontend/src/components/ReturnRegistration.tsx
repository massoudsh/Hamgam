"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ApiClient } from "@/lib/apiClient";
import type { OrderHubRow, ReturnableOrderItem } from "@/lib/types";

interface ReturnRegistrationProps {
  client: ApiClient;
  orders: OrderHubRow[];
  isDemo: boolean;
  onCreated: () => void;
}

export function ReturnRegistration({ client, orders, isDemo, onCreated }: ReturnRegistrationProps) {
  const shippedOrders = orders.filter((order) => order.status === "shipped");
  const [orderId, setOrderId] = useState("");
  const [items, setItems] = useState<ReturnableOrderItem[]>([]);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!orderId || isDemo) {
      setItems([]);
      setItemId("");
      return;
    }
    let cancelled = false;
    client.getReturnableOrderItems(orderId).then((nextItems) => {
      if (cancelled) return;
      setItems(nextItems);
      setItemId(nextItems[0]?.id ?? "");
      setQuantity(1);
    }).catch(() => {
      if (!cancelled) setMessage("بارگذاری اقلام سفارش انجام نشد.");
    });
    return () => {
      cancelled = true;
    };
  }, [client, isDemo, orderId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orderId || !itemId || isDemo) return;
    setSubmitting(true);
    setMessage("");
    try {
      await client.createReturn({ orderId, orderItemId: itemId, quantity, reason });
      setReason("");
      setMessage("مرجوعی ثبت و موجودی کالا به‌روزرسانی شد.");
      onCreated();
    } catch {
      setMessage("ثبت مرجوعی انجام نشد. وضعیت سفارش و تعداد کالا را بررسی کنید.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="return-registration" aria-label="ثبت مرجوعی">
      <div className="section-heading">
        <div><p className="eyebrow">مرجوعی</p><h2>ثبت مرجوعی کالا</h2></div>
      </div>
      {shippedOrders.length === 0 ? <p className="channel-connections-empty">سفارش ارسال‌شده‌ای برای ثبت مرجوعی وجود ندارد.</p> : (
        <form onSubmit={submit} className="return-form">
          <label>سفارش
            <select value={orderId} onChange={(event) => setOrderId(event.target.value)} disabled={isDemo} required>
              <option value="">انتخاب سفارش ارسال‌شده</option>
              {shippedOrders.map((order) => <option key={order.id} value={order.id}>{order.externalOrderId}</option>)}
            </select>
          </label>
          <label>کالا
            <select value={itemId} onChange={(event) => setItemId(event.target.value)} disabled={!orderId || isDemo} required>
              <option value="">انتخاب کالا</option>
              {items.map((item) => <option key={item.id} value={item.id}>{item.canonicalTitle}</option>)}
            </select>
          </label>
          <label>تعداد
            <input type="number" min="1" max={items.find((item) => item.id === itemId)?.quantity ?? 1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={!itemId || isDemo} required />
          </label>
          <label>دلیل مرجوعی
            <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} disabled={isDemo} />
          </label>
          <button type="submit" disabled={!itemId || submitting || isDemo}>{submitting ? "در حال ثبت…" : "ثبت مرجوعی و بازگردانی موجودی"}</button>
        </form>
      )}
      {isDemo && <p className="form-message">ثبت مرجوعی در حالت نمایشی در دسترس نیست.</p>}
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}
