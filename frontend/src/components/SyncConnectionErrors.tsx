import type { SyncConnectionError } from "@/lib/types";

interface SyncConnectionErrorsProps {
  errors: SyncConnectionError[];
}

export function SyncConnectionErrors({ errors }: SyncConnectionErrorsProps) {
  if (errors.length === 0) return null;

  return (
    <section className="sync-errors" aria-label="خطاهای اتصال کانال‌ها">
      <div className="section-heading">
        <div>
          <p className="eyebrow">نیازمند رسیدگی</p>
          <h2>خطاهای اتصال کانال‌ها</h2>
        </div>
        <span className="error-count">{errors.length.toLocaleString("fa-IR")} اتصال</span>
      </div>
      <ul className="sync-error-list">
        {errors.map((error) => (
          <li key={error.channelConnectionId}>
            <div>
              <strong>{error.channelDisplayName}</strong>
              <p>{error.lastError ?? "اتصال کانال نیاز به بررسی دارد."}</p>
            </div>
            <time dateTime={error.updatedAt}>{new Date(error.updatedAt).toLocaleDateString("fa-IR-u-ca-persian")}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
