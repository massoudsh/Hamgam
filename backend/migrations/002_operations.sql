-- Hamgam — operations expansion (replenishment, fulfillment, cost, analytics)
-- Idempotent: AUTO_MIGRATE replays this file on every backend start.

-- ============ Cost basis for purchasing / margin reporting ============
ALTER TABLE sku ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14,2);

-- ============ Fulfillment fields on orders ============
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(120);
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- ============ Purchase orders (replenishment) ============
CREATE TABLE IF NOT EXISTS purchase_order (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    supplier_name   VARCHAR(200),
    status          VARCHAR(20) NOT NULL DEFAULT 'ordered',
    expected_at     TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_item (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id   UUID NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
    sku_id              UUID NOT NULL REFERENCES sku(id),
    quantity_ordered    INTEGER NOT NULL CHECK (quantity_ordered > 0),
    quantity_received   INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost           NUMERIC(14,2)
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_seller ON purchase_order(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_order_item_po ON purchase_order_item(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_item_sku ON purchase_order_item(sku_id);
CREATE INDEX IF NOT EXISTS idx_order_placed_at ON "order"(seller_id, placed_at DESC);
