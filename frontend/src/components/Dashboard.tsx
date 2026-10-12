"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiClient } from "@/lib/apiClient";
import type { CriticalStockItem, DashboardKpis, OrderHubFilters as Filters, OrderHubRow, SyncConnectionError } from "@/lib/types";
import { CriticalStockAlerts } from "./CriticalStockAlerts";
import { SyncConnectionErrors } from "./SyncConnectionErrors";
import { KpiCards } from "./KpiCards";
import { OrderHubFilters } from "./OrderHubFilters";
import { OrderHubTable } from "./OrderHubTable";

const DEMO_SELLER_ID = "00000000-0000-0000-0000-000000000000";

export function Dashboard() {
  const client = useMemo(() => new ApiClient({ sellerId: DEMO_SELLER_ID }), []);
  const [filters, setFilters] = useState<Filters>({});
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [orders, setOrders] = useState<OrderHubRow[]>([]);
  const [connectionErrors, setConnectionErrors] = useState<SyncConnectionError[]>([]);
  const [criticalStock, setCriticalStock] = useState<CriticalStockItem[]>([]);
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
    client.getSyncConnectionErrors().then(({ data, demo }) => {
      if (cancelled) return;
      setConnectionErrors(data);
      setIsDemo((prev) => prev || demo);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);
  useEffect(() => {
    let cancelled = false;
    client.getCriticalStock().then(({ data, demo }) => {
      if (cancelled) return;
      setCriticalStock(data);
      setIsDemo((prev) => prev || demo);
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
    <main dir="rtl" className="app-shell">
      <aside className="sidebar" aria-label="ناوبری اصلی">
        <div className="brand-mark" aria-label="همگام">ه</div>
        <div className="brand-copy">
          <strong>همگام</strong>
          <span>مدیریت هوشمند فروش</span>
        </div>
        <nav className="main-nav">
          <a className="nav-item nav-item-active" href="#dashboard">داشبورد</a>
          <a className="nav-item" href="#orders">سفارش‌ها <span>{orders.length.toLocaleString("fa-IR")}</span></a>
          <a className="nav-item" href="#inventory">موجودی</a>
          <a className="nav-item" href="#channels">کانال‌های فروش</a>
          <a className="nav-item" href="#reports">گزارش‌ها</a>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">ف</div>
          <div><strong>فروشگاه شما</strong><span>پنل فروشنده</span></div>
        </div>
      </aside>

      <div className="workspace" id="dashboard">
        <header className="topbar">
          <div>
            <p className="eyebrow">نمای کلی کسب‌وکار</p>
            <h1>سلام، خوش آمدید</h1>
            <p className="header-subtitle">وضعیت فروش و موجودی خود را یک‌جا دنبال کنید.</p>
          </div>
          <div className="topbar-actions">
            {isDemo && <span className="demo-badge" role="status">حالت نمایشی</span>}
            <button className="notification-button" type="button" aria-label="اعلان‌ها">اعلان‌ها</button>
          </div>
        </header>

        <section className="dashboard-content">
          {kpis && <KpiCards kpis={kpis} />}
          <CriticalStockAlerts items={criticalStock} />
          <SyncConnectionErrors errors={connectionErrors} />

          <section className="order-hub" id="orders" aria-label="مرکز سفارش‌ها">
            <div className="section-heading">
              <div>
                <p className="eyebrow">مدیریت سفارش</p>
                <h2>آخرین سفارش‌ها</h2>
              </div>
              <span className="result-count">{orders.length.toLocaleString("fa-IR")} سفارش</span>
            </div>
            <OrderHubFilters value={filters} onChange={setFilters} />
            {loading ? <div className="table-loading" role="status">در حال دریافت سفارش‌ها…</div> : <OrderHubTable orders={orders} />}
          </section>
        </section>
      </div>
    </main>
  );
}
