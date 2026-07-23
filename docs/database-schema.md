# اسکیمای دیتابیس — همگام (Hamgam) | Seller Ops OS (MVP، PostgreSQL)

## ۱. ERD (مفهومی)

```
Seller 1───* ChannelConnection *───1 Channel
Seller 1───* Product 1───* SKU 1───1 Inventory
SKU 1───* ChannelListing *───1 Channel
SKU 1───* InventoryLedger
Seller 1───* Order 1───* OrderItem *───1 SKU
Order 1───1 ChannelConnection (مبدأ سفارش)
Order 1───* ReturnRequest 1───* ReturnItem *───1 OrderItem
Seller 1───* SyncJob
SyncJob *───1 ChannelListing
Seller 1───* SkuMatchSuggestion *───1 ChannelListing
```

## ۲. DDL

```sql
-- ============ Tenant / Seller ============
CREATE TABLE seller (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(200) NOT NULL,
    phone           VARCHAR(20) UNIQUE,
    email           VARCHAR(200) UNIQUE,
    plan            VARCHAR(30) NOT NULL DEFAULT 'trial',   -- trial, starter, growth
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ Channel (کاتالوگ انواع کانال، ثابت سیستمی) ============
CREATE TABLE channel (
    id              SMALLSERIAL PRIMARY KEY,
    code            VARCHAR(30) UNIQUE NOT NULL,   -- 'basalam' | 'woocommerce' | 'instagram'
    display_name    VARCHAR(100) NOT NULL,
    supports_webhook BOOLEAN NOT NULL DEFAULT false
);

-- ============ اتصال هر فروشنده به یک کانال ============
CREATE TABLE channel_connection (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    channel_id      SMALLINT NOT NULL REFERENCES channel(id),
    -- اطلاعات اتصال (توکن/کلید) رمزنگاری‌شده نگه‌داری شود
    credentials     JSONB NOT NULL,                -- {access_token, refresh_token, site_url, consumer_key, ...}
    status          VARCHAR(20) NOT NULL DEFAULT 'active', -- active, error, disconnected
    last_synced_at  TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (seller_id, channel_id)   -- MVP: یک اتصال فعال به ازای هر کانال (چند غرفه هم‌کانال در فاز بعد)
);

-- ============ Product (گروه‌بندی سطح بالا، اختیاری برای دسته‌بندی) ============
CREATE TABLE product (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    title           VARCHAR(300) NOT NULL,          -- عنوان کانونی محصول، مثلا «کتونی رانینگ»
    category        VARCHAR(120),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ SKU (Master SKU — کالای فیزیکی واحد) ============
CREATE TABLE sku (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id       UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES product(id) ON DELETE SET NULL,
    internal_code   VARCHAR(80) NOT NULL,           -- کد داخلی فروشنده، مثلا NK-RN-BK-40
    canonical_title VARCHAR(300) NOT NULL,           -- عنوان یکپارچه نمایشی
    attributes      JSONB NOT NULL DEFAULT '{}',     -- {"color":"مشکی","size":"40","brand":"Nike"}
    barcode         VARCHAR(64),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (seller_id, internal_code)
);

-- ============ Inventory (موجودی واقعی per Master SKU) ============
CREATE TABLE inventory (
    sku_id          UUID PRIMARY KEY REFERENCES sku(id) ON DELETE CASCADE,
    quantity_on_hand    INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    quantity_reserved   INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 3,
    version         INTEGER NOT NULL DEFAULT 0,      -- optimistic concurrency control
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ InventoryLedger (تاریخچه تغییرات موجودی، source of truth تاریخی) ============
CREATE TABLE inventory_ledger (
    id              BIGSERIAL PRIMARY KEY,
    sku_id          UUID NOT NULL REFERENCES sku(id) ON DELETE CASCADE,
    change_qty      INTEGER NOT NULL,                -- منفی=کاهش (فروش)، مثبت=افزایش (تأمین/مرجوعی)
    reason          VARCHAR(30) NOT NULL,             -- 'order', 'return', 'manual_adjustment', 'reconciliation'
    reference_id    UUID,                             -- order_id یا return_id مرتبط
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ ChannelListing (نمایندگی SKU در یک کانال خاص) ============
CREATE TABLE channel_listing (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_connection_id UUID NOT NULL REFERENCES channel_connection(id) ON DELETE CASCADE,
    sku_id              UUID REFERENCES sku(id) ON DELETE SET NULL,   -- NULL تا زمان تطبیق
    external_product_id VARCHAR(120) NOT NULL,       -- شناسه محصول در کانال
    external_variant_id VARCHAR(120),                -- شناسه واریانت (رنگ/سایز) در کانال
    channel_title       VARCHAR(300) NOT NULL,
    channel_price       NUMERIC(14,2),
    channel_stock       INTEGER,                     -- آخرین موجودی گزارش‌شده توسط خودِ کانال (برای reconciliation)
    is_active           BOOLEAN NOT NULL DEFAULT true,
    match_status         VARCHAR(20) NOT NULL DEFAULT 'unmatched', -- unmatched, suggested, matched, independent
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_connection_id, external_product_id, external_variant_id)
);

-- ============ SkuMatchSuggestion (پیشنهادهای AI برای تأیید فروشنده) ============
CREATE TABLE sku_match_suggestion (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_listing_id  UUID NOT NULL REFERENCES channel_listing(id) ON DELETE CASCADE,
    candidate_sku_id    UUID NOT NULL REFERENCES sku(id) ON DELETE CASCADE,
    confidence          NUMERIC(4,3) NOT NULL,        -- 0.000 - 1.000
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, accepted, rejected
    decided_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ Order (سفارش یکپارچه در Order Hub) ============
CREATE TABLE "order" (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id           UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    channel_connection_id UUID NOT NULL REFERENCES channel_connection(id),
    external_order_id   VARCHAR(120) NOT NULL,        -- شناسه سفارش در کانال مبدأ (یا internal برای اینستاگرام دستی)
    status               VARCHAR(30) NOT NULL DEFAULT 'new', -- new, processing, shipped, delivered, cancelled
    customer_name        VARCHAR(200),
    customer_phone       VARCHAR(20),
    total_amount         NUMERIC(14,2),
    placed_at            TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_connection_id, external_order_id)
);

CREATE TABLE order_item (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
    sku_id          UUID NOT NULL REFERENCES sku(id),
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(14,2) NOT NULL
);

-- ============ Return / RMA ============
CREATE TABLE return_request (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL DEFAULT 'requested', -- requested, approved, received, refunded, rejected
    reason          VARCHAR(200),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE return_item (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_request_id   UUID NOT NULL REFERENCES return_request(id) ON DELETE CASCADE,
    order_item_id       UUID NOT NULL REFERENCES order_item(id),
    quantity             INTEGER NOT NULL CHECK (quantity > 0),
    restock              BOOLEAN NOT NULL DEFAULT true   -- آیا به موجودی برگردد
);

-- ============ Sync / Event لاگ ============
CREATE TABLE sync_job (
    id                  BIGSERIAL PRIMARY KEY,
    seller_id           UUID NOT NULL REFERENCES seller(id) ON DELETE CASCADE,
    channel_listing_id  UUID REFERENCES channel_listing(id) ON DELETE CASCADE,
    job_type            VARCHAR(30) NOT NULL,          -- 'inventory_push', 'order_pull', 'reconciliation'
    status               VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, success, failed
    attempt_count        SMALLINT NOT NULL DEFAULT 0,
    error_message         TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at            TIMESTAMPTZ
);

CREATE TABLE processed_event (
    event_id        VARCHAR(150) PRIMARY KEY,          -- کلید idempotency (channel_code:external_event_id)
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## ۳. ایندکس‌های مهم

```sql
CREATE INDEX idx_channel_listing_sku ON channel_listing(sku_id);
CREATE INDEX idx_channel_listing_match_status ON channel_listing(match_status) WHERE match_status = 'unmatched';
CREATE INDEX idx_order_seller_status ON "order"(seller_id, status);
CREATE INDEX idx_order_item_sku ON order_item(sku_id);
CREATE INDEX idx_inventory_ledger_sku ON inventory_ledger(sku_id, created_at DESC);
CREATE INDEX idx_sync_job_status ON sync_job(status) WHERE status IN ('pending', 'failed');
```

## ۴. نکات طراحی

- **Master SKU vs Listing**: موجودی فقط روی `inventory.sku_id` نگه داشته می‌شود؛ `channel_listing.channel_stock` صرفاً «آخرین عدد گزارش‌شده توسط کانال» است و برای reconciliation استفاده می‌شود، نه به‌عنوان source of truth.
- **Idempotency**: هر رویداد ورودی از کانال (webhook) قبل از پردازش در `processed_event` چک/ثبت می‌شود تا پردازش تکراری رخ ندهد.
- **Optimistic locking**: به‌روزرسانی `inventory.quantity_on_hand` همیشه با شرط `WHERE version = :expected_version` انجام و `version` افزایش می‌یابد؛ در برخورد هم‌زمان، عملیات retry می‌شود.
- **مرجوعی و بازگشت موجودی**: تأیید `return_item.restock = true` یک رکورد مثبت در `inventory_ledger` ایجاد و `inventory.quantity_on_hand` را افزایش می‌دهد که به‌صورت خودکار وارد چرخه Sync به همه کانال‌ها می‌شود.
- **چندمستأجری (multi-tenant)**: تمام جداول اصلی از طریق `seller_id` (مستقیم یا از طریق FK زنجیره‌ای) ایزوله شده‌اند؛ در فاز production توصیه می‌شود Row-Level Security روی `seller_id` فعال شود.
