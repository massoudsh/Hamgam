# Hamgam Backend

API و موتور sync/inventory پروژه همگام — پیاده‌سازی `docs/prd.md`, `docs/architecture.md`, `docs/database-schema.md`.

## نصب

```bash
cd backend
npm install
cp .env.example .env   # DATABASE_URL را به یک PostgreSQL واقعی اشاره بده
```

## اجرا

```bash
npm run migrate   # اعمال migration های PostgreSQL (نیازمند DATABASE_URL واقعی)
npm run dev        # سرور توسعه روی PORT (پیش‌فرض 4000)
```

سلامت سرویس: `GET /health`

## تست

```bash
npm test        # کل تست‌های خودکار (اینونتوری، سفارش، تنانت-ایزوله، کانکتورها، API)
npm run typecheck
```

تست‌ها به PostgreSQL واقعی نیاز ندارند — از [pg-mem](https://github.com/oguimbal/pg-mem) (شبیه‌ساز درون‌حافظه‌ای Postgres) استفاده می‌کنند تا SQL واقعی migration ها (تراکنش، FK، CHECK، UNIQUE، `FOR UPDATE`) روی هر تست اجرا شود، بدون نیاز به سرور دیتابیس یا Docker.

## ساختار

```
migrations/            SQL migration ها (منبع حقیقت schema)
src/db/                Pool اتصال Postgres + اجراکننده migration
src/domain/            منطق دامنه: inventory (idempotent + optimistic concurrency)، orders، sku، dashboard KPIs
src/connectors/        ChannelConnector مشترک + آداپتورهای Basalam/WooCommerce/Instagram
src/routes/            REST endpoint های Express
src/app.ts             فکتوری Express app (برای تست با supertest)
src/server.ts          نقطه ورود اجرای واقعی سرور
```

## نکات امنیتی
- هیچ secret ای در ریپو کامیت نشده؛ `credentials` هر `channel_connection` باید در production رمزنگاری‌شده ذخیره شود (فیلد JSONB فعلاً plain برای MVP — TODO قبل از production).
- Tenant isolation: همه کوئری‌های دامنه بر اساس `seller_id` فیلتر می‌شوند؛ در production توصیه‌شده Row-Level Security فعال شود (طبق `docs/database-schema.md` §۴).

## محدودیت‌های شناخته‌شده (MVP)
- کانکتور **Basalam** بر اساس مسیرهای REST مستندشده در `docs/architecture.md` **فرض** شده و با اکانت واقعی/Sandbox تأیید نشده — جزئیات در بالای `src/connectors/basalam.ts`.
- AI SKU Matching (F4 در PRD) در این لایه پیاده‌سازی نشده؛ `channel_listing.match_status` و `sku_match_suggestion` در schema آماده‌اند اما matching engine خارج از scope این commit است.
- احراز هویت/نشست کاربر (auth) پیاده نشده؛ endpoint ها فعلاً `sellerId` را به‌صورت پارامتر می‌گیرند (برای احراز هویت واقعی باید middleware session/JWT اضافه شود).
- بیلد production (`npm run build` سنگین) طبق سیاست پلتفرم باید روی سرور استقرار اجرا شود، نه داخل کانتینر توسعه.
