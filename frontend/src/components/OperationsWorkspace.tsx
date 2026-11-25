"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "@/lib/apiClient";
import type {
  CustomerInsights,
  ListingHealthSummary,
  OrderHubRow,
  PurchaseOrder,
  ReplenishmentSuggestion,
  VelocityReport
} from "@/lib/types";
import { ReplenishmentPanel } from "./ReplenishmentPanel";
import { ListingHealthPanel } from "./ListingHealthPanel";
import { FulfillmentPanel } from "./FulfillmentPanel";
import { VelocityPanel } from "./VelocityPanel";
import { CustomersPanel } from "./CustomersPanel";

type TabKey = "replenishment" | "health" | "fulfillment" | "velocity" | "customers";

interface OperationsWorkspaceProps {
  client: ApiClient;
  orders: OrderHubRow[];
  isDemo: boolean;
  onOrdersChanged: () => void;
}

const EMPTY_HEALTH: ListingHealthSummary = {
  totalListings: 0,
  healthy: 0,
  withWarnings: 0,
  withErrors: 0,
  items: []
};
const EMPTY_VELOCITY: VelocityReport = { windowDays: 30, items: [] };
const EMPTY_CUSTOMERS: CustomerInsights = { totalCustomers: 0, repeatCustomers: 0, repeatRate: 0, topCustomers: [] };

export function OperationsWorkspace({ client, orders, isDemo, onOrdersChanged }: OperationsWorkspaceProps) {
  const [tab, setTab] = useState<TabKey>("replenishment");
  const [suggestions, setSuggestions] = useState<ReplenishmentSuggestion[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [health, setHealth] = useState<ListingHealthSummary>(EMPTY_HEALTH);
  const [velocity, setVelocity] = useState<VelocityReport>(EMPTY_VELOCITY);
  const [customers, setCustomers] = useState<CustomerInsights>(EMPTY_CUSTOMERS);

  const loadPurchasing = useCallback(() => {
    client.getReplenishmentSuggestions().then(({ data }) => setSuggestions(data));
    client.getPurchaseOrders().then(({ data }) => setPurchaseOrders(data));
  }, [client]);

  useEffect(() => {
    loadPurchasing();
  }, [loadPurchasing]);

  useEffect(() => {
    client.getListingHealth().then(({ data }) => setHealth(data));
    client.getVelocityReport().then(({ data }) => setVelocity(data));
    client.getCustomerInsights().then(({ data }) => setCustomers(data));
  }, [client]);

  const actionableOrders = orders.filter((order) => ["new", "processing", "shipped"].includes(order.status)).length;

  const tabs: Array<{ key: TabKey; label: string; badge?: number }> = [
    { key: "replenishment", label: "تأمین و خرید", badge: suggestions.length },
    { key: "health", label: "اختلاف کانال‌ها", badge: health.withErrors + health.withWarnings },
    { key: "fulfillment", label: "تحویل سفارش", badge: actionableOrders },
    { key: "velocity", label: "سرعت فروش" },
    { key: "customers", label: "مشتریان" }
  ];

  return (
    <section className="operations" id="operations" aria-label="عملیات و رشد">
      <div className="section-heading">
        <div>
          <p className="eyebrow">عملیات روزانه</p>
          <h2>تأمین، تحویل و بینش فروش</h2>
        </div>
        {isDemo && <span className="demo-badge" role="status">حالت نمایشی</span>}
      </div>

      <div className="ops-tabs" role="tablist" aria-label="بخش‌های عملیاتی">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`panel-${item.key}`}
            className={`ops-tab ${tab === item.key ? "ops-tab-active" : ""}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.badge ? <span className="ops-tab-badge">{item.badge.toLocaleString("fa-IR")}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="ops-tabpanel">
        {tab === "replenishment" && (
          <ReplenishmentPanel
            client={client}
            suggestions={suggestions}
            purchaseOrders={purchaseOrders}
            isDemo={isDemo}
            onRefresh={loadPurchasing}
          />
        )}
        {tab === "health" && <ListingHealthPanel health={health} />}
        {tab === "fulfillment" && (
          <FulfillmentPanel client={client} orders={orders} isDemo={isDemo} onUpdated={onOrdersChanged} />
        )}
        {tab === "velocity" && <VelocityPanel report={velocity} />}
        {tab === "customers" && <CustomersPanel insights={customers} />}
      </div>
    </section>
  );
}
