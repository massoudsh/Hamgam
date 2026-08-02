-- Hamgam MVP — core schema (matches docs/database-schema.md)
-- Note: gen_random_uuid() requires the pgcrypto extension on real PostgreSQL.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ Tenant / Seller ============
CREATE TABLE IF NOT EXISTS seller (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    phone           VARCHAR(20) UNIQUE,
    email           VARCHAR(200) UNIQUE,
    plan            VARCHAR(30) NOT NULL DEFAULT 'trial',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ Channel (کاتالوگ انواع کانال، ثابت سیستمی) ============
CREATE TABLE IF NOT EXISTS channel (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(30) UNIQUE NOT NULL,
    display_name    VARCHAR(100) NOT NULL,
    supports_webhook BOOLEAN NOT NULL DEFAULT false
);

-- ============ اتصال هر فروشنده به یک کانال ============
CREATE TABLE IF NOT EXISTS channel_connection (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    channel_id      INTEGER NOT NULL REFERENCES channel(id),
    credentials     JSONB NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    last_synced_at  TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (seller_id, channel_id)
);

-- ============ Product ============
CREATE TABLE IF NOT EXISTS product (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    title           VARCHAR(300) NOT NULL,
    category        VARCHAR(120),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ SKU (Master SKU) ============
CREATE TABLE IF NOT EXISTS sku (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES product(id) ON DELETE SET NULL,
    internal_code   VARCHAR(80) NOT NULL,
    canonical_title VARCHAR(300) NOT NULL,
    attributes      JSONB NOT NULL DEFAULT '{}',
    barcode         VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (seller_id, internal_code)
);

-- ============ Inventory (per Master SKU) ============
CREATE TABLE IF NOT EXISTS inventory (
    sku_id          UUID PRIMARY KEY REFERENCES sku(id) ON DELETE CASCADE,
    quantity_on_hand    INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    quantity_reserved   INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 3,
    version         INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ InventoryLedger ============
CREATE TABLE IF NOT EXISTS inventory_ledger (
    id              BIGSERIAL PRIMARY KEY,
    sku_id          UUID NOT NULL REFERENCES sku(id) ON DELETE CASCADE,
    change_qty      INTEGER NOT NULL,
    reason          VARCHAR(30) NOT NULL,
    reference_id    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ ChannelListing ============
CREATE TABLE IF NOT EXISTS channel_listing (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_connection_id UUID NOT NULL REFERENCES channel_connection(id) ON DELETE CASCADE,
    sku_id              UUID REFERENCES sku(id) ON DELETE SET NULL,
    external_product_id VARCHAR(120) NOT NULL,
    external_variant_id VARCHAR(120),
    channel_title       VARCHAR(300) NOT NULL,
    channel_price       NUMERIC(14,2),
    channel_stock       INTEGER,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    match_status         VARCHAR(20) NOT NULL DEFAULT 'unmatched',
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_connection_id, external_product_id, external_variant_id)
);

-- ============ SkuMatchSuggestion ============
CREATE TABLE IF NOT EXISTS sku_match_suggestion (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_listing_id  UUID NOT NULL REFERENCES channel_listing(id) ON DELETE CASCADE,
    candidate_sku_id    UUID NOT NULL REFERENCES sku(id) ON DELETE CASCADE,
    confidence          NUMERIC(4,3) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    decided_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ Order ============
CREATE TABLE IF NOT EXISTS "order" (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id           UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    channel_connection_id UUID NOT NULL REFERENCES channel_connection(id),
    external_order_id   VARCHAR(120) NOT NULL,
    status               VARCHAR(30) NOT NULL DEFAULT 'new',
    customer_name        VARCHAR(200),
    customer_phone       VARCHAR(20),
    total_amount         NUMERIC(14,2),
    placed_at            TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_connection_id, external_order_id)
);

CREATE TABLE IF NOT EXISTS order_item (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
    sku_id          UUID NOT NULL REFERENCES sku(id),
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(14,2) NOT NULL
);

-- ============ Return / RMA ============
CREATE TABLE IF NOT EXISTS return_request (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL DEFAULT 'requested',
    reason          VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS return_item (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_request_id   UUID NOT NULL REFERENCES return_request(id) ON DELETE CASCADE,
    order_item_id       UUID NOT NULL REFERENCES order_item(id),
    quantity             INTEGER NOT NULL CHECK (quantity > 0),
    restock              BOOLEAN NOT NULL DEFAULT true
);

-- ============ Sync / Event لاگ ============
CREATE TABLE IF NOT EXISTS sync_job (
    id                  BIGSERIAL PRIMARY KEY,
    seller_id           UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    channel_listing_id  UUID REFERENCES channel_listing(id) ON DELETE CASCADE,
    job_type            VARCHAR(30) NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempt_count        SMALLINT NOT NULL DEFAULT 0,
    error_message         TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at            TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS processed_event (
    event_id        VARCHAR(150) PRIMARY KEY,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_listing_sku ON channel_listing(sku_id);
CREATE INDEX IF NOT EXISTS idx_channel_listing_match_status ON channel_listing(match_status) WHERE match_status = 'unmatched';
CREATE INDEX IF NOT EXISTS idx_order_seller_status ON "order"(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_order_item_sku ON order_item(sku_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_sku ON inventory_ledger(sku_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_job_status ON sync_job(status) WHERE status IN ('pending', 'failed');

INSERT INTO channel (code, display_name, supports_webhook) VALUES
    ('basalam', 'باسلام', true),
    ('woocommerce', 'ووکامرس', true),
    ('instagram', 'اینستاگرام (دستی)', false)
ON CONFLICT (code) DO NOTHING;
