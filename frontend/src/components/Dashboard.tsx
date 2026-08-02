"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiClient } from "@/lib/apiClient";
import type { DashboardKpis, OrderHubFilters as Filters, OrderHubRow } from "@/lib/types";
import { KpiCards } from "./KpiCards";
import { OrderHubFilters } from "./OrderHubFilters";
import { OrderHubTable } from "./OrderHubTable";

const DEMO_SELLER_ID = "00000000-0000-0000-0000-000000000000";

export function Dashboard() {
  const client = useMemo(() => new ApiClient({ sellerId: DEMO_SELLER_ID }), []);
  const [filters, setFilters] = useState<Filters>({});
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [orders, setOrders] = useState<OrderHubRow[]>([]);
  const [isDemo, setIsDemo] = useState(client.isDemoMode);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    client.getDashboardKpis().then(({ data, demo }) => {
      if (cancelled) return;
      setKpis(data);
      setIsDemo(demo);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client.getOrderHub(filters).then(({ data, demo }) => {
      if (cancelled) return;
      setOrders(data);
      setIsDemo((prev) => prev || demo);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [client, filters]);

  return (
    <main dir="rtl" className="dashboard">
      <header className="dashboard-header">
        <h1>داشبورد همگام</h1>
        {isDemo && (
          <span className="demo-badge" role="status">
            حالت نمایشی (Demo) — بدون اتصال به بک‌اند
          </span>
        )}
      </header>

      {kpis && <KpiCards kpis={kpis} />}

      <section className="order-hub" aria-label="Order Hub">
        <h2>Order Hub</h2>
        <OrderHubFilters value={filters} onChange={setFilters} />
        {loading ? <p>در حال بارگذاری…</p> : <OrderHubTable orders={orders} />}
      </section>
    </main>
  );
}
