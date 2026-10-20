import type { ChannelConnection } from "@/lib/types";

interface ChannelConnectionsProps {
  connections: ChannelConnection[];
}

export function ChannelConnections({ connections }: ChannelConnectionsProps) {
  return (
    <section className="channel-connections" id="channels" aria-label="کانال‌های فروش">
      <div className="section-heading">
        <div>
          <p className="eyebrow">کانال‌های فروش</p>
          <h2>وضعیت اتصال کانال‌ها</h2>
        </div>
        <span className="result-count">{connections.length.toLocaleString("fa-IR")} اتصال</span>
      </div>
      {connections.length === 0 ? (
        <p className="channel-connections-empty">هنوز کانالی متصل نشده است.</p>
      ) : (
        <ul className="channel-connection-list">
          {connections.map((connection) => (
            <li key={connection.id}>
              <div>
                <strong>{connection.displayName}</strong>
                <span>{connection.lastError ?? "اتصال فعال و آمادهٔ همگام‌سازی"}</span>
              </div>
              <b className={`connection-status connection-status-${connection.status}`}>
                {connection.status === "active" ? "فعال" : "نیازمند بررسی"}
              </b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
