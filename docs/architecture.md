# معماری فنی — همگام (Hamgam) | Seller Ops OS (MVP)

## ۱. اصول طراحی
- **Source of Truth واحد**: موجودی و SKU در دیتابیس داخلی سیستم master هستند؛ هر کانال یک "نمای" (view) از آن است، نه برعکس.
- **Adapter Pattern برای کانال‌ها**: هر کانال (باسلام، ووکامرس، اینستاگرام) پشت یک اینترفیس یکسان (`ChannelConnector`) پیاده می‌شود تا افزودن کانال جدید بدون تغییر core ممکن باشد.
- **Event-driven + Idempotent**: هر تغییر (فروش، ویرایش موجودی) یک event است؛ پردازش هر event باید idempotent باشد چون webhookها ممکن است تکراری یا با تأخیر برسند.
- **Human-in-the-loop برای AI**: خروجی AI matching هرگز مستقیم روی موجودی اعمال نمی‌شود مگر با اطمینان بالا یا تأیید فروشنده.

## ۲. کامپوننت‌های سیستم (High Level)

```
                        ┌─────────────────────┐
                        │   Merchant Panel     │  (Next.js)
                        │  (Dashboard/Order Hub)│
                        └──────────┬───────────┘
                                   │ REST/GraphQL
                        ┌──────────▼───────────┐
                        │      API Gateway      │
                        └──────────┬───────────┘
             ┌─────────────────────┼─────────────────────┐
             │                     │                     │
   ┌─────────▼────────┐  ┌─────────▼────────┐  ┌─────────▼────────┐
   │  Inventory Service│  │  Order Hub Service│  │ SKU Matching Svc │
   │  (stock, alerts)  │  │  (unified orders) │  │ (AI + embeddings)│
   └─────────┬────────┘  └─────────┬────────┘  └─────────┬────────┘
             │                     │                     │
             └──────────┬──────────┴──────────┬──────────┘
                         │                     │
                ┌────────▼────────┐   ┌────────▼────────┐
                │   Sync Engine    │   │  Notification    │
                │ (queue consumer) │   │     Service       │
                └────────┬────────┘   └──────────────────┘
                         │
         ┌───────────────┼───────────────────┐
         │               │                   │
┌────────▼──────┐ ┌──────▼───────┐ ┌─────────▼────────┐
│ Basalam        │ │ WooCommerce  │ │ Instagram          │
│ Connector      │ │ Connector    │ │ Connector (manual/ │
│ (webhook+API)  │ │ (REST+poll)  │ │ semi-manual form)  │
└────────┬──────┘ └──────┬───────┘ └─────────┬────────┘
         │               │                   │
    Basalam API     WooCommerce API      Manual Entry / Bot

Infra: PostgreSQL (primary DB) · Redis (queue + cache) · Background Workers
```

## ۳. مدل داده SKU یکپارچه

سه لایه مفهومی:

1. **Master SKU** — کالای فیزیکی واحد در سطح فروشنده (`sku.id`, کد داخلی، عنوان کانونی، ویژگی‌ها مثل رنگ/سایز).
2. **Channel Listing** — نمایندگی همان کالا در یک کانال خاص (عنوان محلی، قیمت محلی، شناسه/ID در کانال، موجودی گزارش‌شده توسط کانال). هر Listing دقیقاً به یک Master SKU لینک می‌شود (`channel_listing.sku_id`).
3. **Inventory** — موجودی واقعی per Master SKU (نه per Listing). Listingها فقط consumer این عدد هستند.

این جداسازی اجازه می‌دهد:
- یک SKU فیزیکی، عنوان‌ها/قیمت‌های متفاوت در هر کانال داشته باشد.
- موجودی در یک نقطه به‌روز شود و به همه Listingهای مرتبط propagate شود.

### فرآیند تطبیق (Matching)
- هنگام import اولیه یا افزودن Listing جدید بدون SKU لینک‌شده → یک job در صف SKU Matching:
  1. Embedding عنوان + ویژگی‌های استخراج‌شده (رنگ، سایز، برند) از عنوان Listing تولید می‌شود.
  2. مقایسه با Embedding سایر Listingهای بدون‌لینک/Master SKUهای موجود همان فروشنده (cosine similarity).
  3. اگر similarity > آستانه بالا (مثلاً ۰.۹۲) و هیچ ابهامی نیست → پیشنهاد auto با confidence بالا.
  4. در غیر این صورت → کاندیدهای برتر (حداکثر ۳) به فروشنده نمایش داده می‌شود؛ تصمیم او در training loop آینده استفاده می‌شود.
  5. تأیید فروشنده → `channel_listing.sku_id` ست می‌شود و رکورد در `sku_match_feedback` ذخیره می‌شود.

## ۴. استراتژی Sync چندکاناله

### حالت‌های ارتباطی هر کانال
| کانال | ورودی رویداد | خروجی به‌روزرسانی |
|-------|----------------|---------------------|
| باسلام | Webhook (سفارش جدید، تغییر وضعیت) | API PATCH موجودی/وضعیت Listing |
| ووکامرس | Webhook (اگر افزونه فعال باشد) + Polling هر ۵ دقیقه به‌عنوان fallback | REST API PUT `products/{id}` برای stock |
| اینستاگرام | فرم دستی ثبت سفارش/کاهش موجودی توسط فروشنده | نمایش وضعیت موجودی به فروشنده برای اعلام دستی در دایرکت |

### جریان Sync (فروش در کانال A → کاهش در کانال B، C)
1. Webhook/Polling کانال A رویداد "سفارش جدید" را دریافت می‌کند → Connector آن را به `OrderCreatedEvent` نرمال‌سازی و در صف (`orders.incoming`) publish می‌کند.
2. **Order Hub Service** ایونت را مصرف می‌کند: سفارش را در DB ذخیره می‌کند (idempotent روی `channel_id + external_order_id`).
3. برای هر آیتم سفارش، **Inventory Service** موجودی Master SKU مربوطه را کم می‌کند و یک `InventoryChangedEvent` publish می‌کند.
4. **Sync Engine** این event را می‌گیرد و برای هر Channel Listing دیگر مرتبط با همان SKU، یک job به‌روزرسانی در صف مخصوص همان کانال (`sync.basalam`, `sync.woocommerce`) قرار می‌دهد.
5. هر Connector job را با نرخ مجاز API خودش پردازش و موجودی/وضعیت Listing را به‌روز می‌کند؛ در صورت رسیدن موجودی به صفر، Listing به «ناموجود» تغییر وضعیت می‌دهد.
6. نتیجه (موفق/ناموفق) در `sync_log` ثبت می‌شود؛ خطا → retry با backoff، و بعد از N بار شکست → هشدار به فروشنده.

### Idempotency و Conflict Resolution
- هر Event یک `event_id` یکتا دارد؛ consumerها قبل از پردازش چک می‌کنند که پردازش نشده باشد (`processed_events` جدول یا Redis SET).
- ستون `version` (optimistic concurrency) روی `inventory` برای جلوگیری از race condition هنگام کاهش هم‌زمان موجودی از دو کانال.
- **Reconciliation Job** (هر ۱۵ دقیقه برای کانال‌های بدون Webhook قابل‌اعتماد): موجودی گزارش‌شده کانال با موجودی داخلی مقایسه و در صورت انحراف، اصلاح/هشدار می‌دهد.
- تعارض همیشه به نفع «موجودی داخلی سیستم» حل می‌شود؛ کانال‌ها consumer هستند نه source of truth.

## ۵. Integration جزئیات

### باسلام
- **Auth**: OAuth2 (per-seller access token + refresh token).
- **دریافت رویداد**: Webhook subscription برای `order.created`, `order.status_changed`, `product.stock_changed` (در صورت پشتیبانی)؛ در غیر این صورت polling هر ۲-۵ دقیقه به‌عنوان fallback.
- **ارسال تغییر**: `PATCH /products/{id}/variants/{id}` برای موجودی و وضعیت active/inactive.
- **Rate limit**: صف مجزا با nrate limiting سمت worker (token bucket) مطابق سقف API باسلام.

### ووکامرس
- **Auth**: REST API Consumer Key/Secret (per site، وارد شده توسط فروشنده در تنظیمات اتصال).
- **دریافت رویداد**: اگر افزونه Webhook فعال باشد از `order.created`/`order.updated` استفاده می‌شود؛ در غیر این صورت Polling دوره‌ای روی `/wp-json/wc/v3/orders` و `/products`.
- **ارسال تغییر**: `PUT /wp-json/wc/v3/products/{id}` برای `stock_quantity` و `stock_status`.

### اینستاگرام (نیمه‌دستی)
- بدون API رسمی DM. MVP یک فرم سریع در پنل ارائه می‌دهد که فروشنده سفارش دایرکتی را با انتخاب SKU از لیست موجود ثبت می‌کند؛ این سفارش مثل بقیه کانال‌ها وارد Order Hub و Inventory Service می‌شود (به همان pipeline کاهش موجودی و sync متصل است).

## ۶. Stack پیشنهادی
- **Backend**: Node.js + NestJS یا Python + FastAPI (ماژولار، مناسب worker/queue).
- **DB**: PostgreSQL (تراکنشی، پشتیبانی خوب از JSONB برای متادیتای هر کانال).
- **Queue**: Redis + BullMQ (یا RabbitMQ اگر throughput بالاتر لازم شود).
- **AI Matching**: مدل embedding متن فارسی (یا API خارجی) + fuzzy matching (Levenshtein/token overlap) به‌عنوان لایه fallback ارزان.
- **Frontend**: Next.js (پنل فروشنده، RTL).
- **Observability**: لاگ ساختاریافته per sync job + متریک latency/error rate per channel (برای پایش KPIهای PRD).

## ۷. مقیاس‌پذیری برای فاز بعد
افزودن کانال جدید = پیاده‌سازی یک `ChannelConnector` جدید مطابق اینترفیس مشترک (`fetchListings`, `fetchOrders`, `pushInventoryUpdate`, `subscribeWebhook`) بدون تغییر Core Services — پیش‌نیاز مسیر تبدیل شدن به Seller Operations OS چندمارکت‌پلیسی.
