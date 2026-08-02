"use client";

import type { OrderHubFilters as Filters } from "@/lib/types";

const CHANNELS = [
  { value: "", label: "همه کانال‌ها" },
  { value: "basalam", label: "باسلام" },
  { value: "woocommerce", label: "ووکامرس" },
  { value: "instagram", label: "اینستاگرام" }
];

const STATUSES = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "new", label: "جدید" },
  { value: "processing", label: "در حال ارسال" },
  { value: "shipped", label: "ارسال‌شده" },
  { value: "delivered", label: "تحویل‌شده" },
  { value: "cancelled", label: "لغوشده" }
];

interface OrderHubFiltersProps {
  value: Filters;
  onChange: (next: Filters) => void;
}

export function OrderHubFilters({ value, onChange }: OrderHubFiltersProps) {
  return (
    <div className="order-hub-filters" role="group" aria-label="فیلترهای سفارش">
      <label>
        کانال
        <select
          aria-label="فیلتر کانال"
          value={value.channel ?? ""}
          onChange={(e) => onChange({ ...value, channel: e.target.value || undefined })}
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        وضعیت
        <select
          aria-label="فیلتر وضعیت"
          value={value.status ?? ""}
          onChange={(e) => onChange({ ...value, status: e.target.value || undefined })}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        از تاریخ
        <input
          aria-label="فیلتر از تاریخ"
          type="date"
          value={value.from?.slice(0, 10) ?? ""}
          onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
        />
      </label>

      <label>
        تا تاریخ
        <input
          aria-label="فیلتر تا تاریخ"
          type="date"
          value={value.to?.slice(0, 10) ?? ""}
          onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
        />
      </label>
    </div>
  );
}
