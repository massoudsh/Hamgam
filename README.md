# همگام (Hamgam)

**سیستم‌عامل هوشمند عملیات فروش برای فروشندگان چندکاناله ایرانی.**

همگام موجودی، SKU، سفارش و مرجوعی را از باسلام، ووکامرس و اینستاگرام در یک هاب واحد یکپارچه می‌کند تا فروشنده‌ی چندکاناله بدون ترس از overselling، رشد کند.

## اسناد پروژه
- [PRD / مستند محصول MVP](docs/prd.md)
- [معماری فنی](docs/architecture.md)
- [معماری و جریان داده](ARCHITECTURE.md)
- [اسکیمای دیتابیس](docs/database-schema.md)

## ساختار مخزن

```
backend/    API نود+تایپ‌اسکریپت — inventory idempotent، Order Hub، کانکتورهای Basalam/WooCommerce/Instagram
frontend/   داشبورد RTL Next.js — KPI Cards + Order Hub (با حالت نمایشی/دمو تا اتصال کامل بک‌اند)
docs/       PRD، معماری، اسکیمای دیتابیس
```

## شروع سریع توسعه

```bash
# بک‌اند
cd backend && npm install && cp .env.example .env
npm run migrate   # نیازمند PostgreSQL واقعی — DATABASE_URL را در .env تنظیم کن
npm run dev        # http://localhost:4000  (GET /health)

# فرانت‌اند (در ترمینال جدا)
cd frontend && npm install
npm run dev         # http://localhost:3000 — بدون بک‌اند هم در حالت Demo کار می‌کند
```

برای اتصال فرانت‌اند به بک‌اند واقعی: `NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev`

## اجرای کامل با Docker (هر سه سرویس)

`docker-compose.yml` سه سرویس را با هم بالا می‌آورد: `db` (PostgreSQL 16)، `backend` (API روی پورت ۴۰۰۰) و `frontend` (داشبورد روی پورت ۳۰۰۰). migrationها هنگام روشن‌شدن بک‌اند اجرا می‌شوند و idempotent هستند (`IF NOT EXISTS`).

```bash
cp .env.docker.example .env      # رمز دیتابیس و پورت‌ها را در .env تنظیم کن
docker compose up -d --build     # ساخت ایمیج‌ها و اجرای همه سرویس‌ها
docker compose ps                # وضعیت و سلامت سرویس‌ها
docker compose logs -f backend   # لاگ API
```

پس از آماده‌شدن: داشبورد `http://localhost:3000`، API `http://localhost:4000/health` و دیتابیس `localhost:5432`.

دستورهای روزمره:

```bash
docker compose stop              # توقف بدون حذف داده
docker compose up -d             # اجرای دوباره
docker compose down              # حذف کانتینرها (داده در volume می‌ماند)
docker compose down -v           # حذف کانتینرها و دادهٔ دیتابیس
docker compose up -d --build backend   # بازسازی فقط یک سرویس
```

نکته‌های استقرار:
- `NEXT_PUBLIC_API_URL` هنگام **ساخت ایمیج** فرانت‌اند داخل bundle قرار می‌گیرد؛ برای دامنهٔ واقعی مقدار آن را در `.env` بگذار و فرانت‌اند را دوباره build کن. آدرسی که می‌گذاری باید از **مرورگر کاربر** قابل دسترسی باشد، نه فقط داخل شبکهٔ Docker.
- `CORS_ORIGIN` دامنه‌های مجاز مرورگر را کنترل می‌کند (با کاما جدا شود، یا `*`). برای دامنهٔ واقعی باید همان origin داشبورد باشد.
- بک‌اند و فرانت‌اند با کاربر غیر root (`node`) اجرا می‌شوند و هر دو healthcheck دارند؛ فرانت‌اند تا سالم‌شدن بک‌اند و بک‌اند تا آماده‌شدن دیتابیس صبر می‌کند.

## قابلیت‌های عملیاتی (نسخهٔ رقابتی)

پنج قابلیتی که رقبای ایرانی و بین‌المللی (هم‌سلام، کورسل، بلنسیفای، Cin7 Core، Linnworks) به‌عنوان محور محصول ارائه می‌دهند، به همگام اضافه شده است:

| قابلیت | مسیر API | کاربرد |
|---|---|---|
| پیشنهاد تأمین و سفارش خرید | `GET /api/purchasing/suggestions`، `GET/POST /api/purchasing/orders`، `POST /api/purchasing/orders/:id/items/:itemId/receive` | مقدار پیشنهادی از فروش ۳۰ روز، موجودی و کالای در راه محاسبه می‌شود؛ ثبت ورود کالا موجودی را افزایش و کانال‌ها را همگام می‌کند |
| گزارش اختلاف کانال‌ها | `GET /api/listing-health` | اختلاف موجودی، آگهی غیرفعال با موجودی، آگهی فعال بدون موجودی، کالای بدون تطبیق و همگام‌سازی قدیمی را نشان می‌دهد |
| گردش کار تحویل سفارش | `PATCH /api/orders/:orderId/status` | سفارش از جدید → آماده‌سازی → ارسال (با کد رهگیری) → تحویل؛ لغو سفارش موجودی کسرشده را برمی‌گرداند |
| تحلیل سرعت فروش | `GET /api/analytics/velocity` | فروش، درآمد، روزهای پوشش موجودی و تفکیک پرفروش/کند/راکد |
| بینش مشتریان | `GET /api/analytics/customers` | تجمیع سفارش‌ها بر اساس شماره، مشتریان برتر و نرخ خرید تکراری |

همهٔ این‌ها در داشبورد زیر بخش «عملیات» با تب‌های فارسی در دسترس‌اند. migration جدید `backend/migrations/002_operations.sql` است و idempotent اجرا می‌شود.

## تست

```bash
cd backend  && npm ci && npm test && npm run typecheck && npm run build
cd frontend && npm ci && npm test && npm run typecheck && npm run build
```

تست‌های بک‌اند به PostgreSQL واقعی نیاز ندارند (از `pg-mem` برای اجرای SQL واقعی migration بدون سرور دیتابیس استفاده می‌شود). تست‌های فرانت‌اند با jsdom اجرا می‌شوند، نه مرورگر واقعی. همین بررسی‌ها برای push و pull request به شاخهٔ `main` در GitHub Actions نیز اجرا می‌شوند. CodeQL تحلیل ایستای JavaScript/TypeScript را روی همان رویدادها و هر هفته اجرا می‌کند؛ Dependabot نیز وابستگی‌های npm هر دو workspace را هفتگی بررسی می‌کند.

## ارزیابی امنیت و AI

این MVP هنوز احراز هویت واقعی ندارد و `sellerId` از caller دریافت می‌شود؛ پیش از استقرار عمومی باید session/JWT، کنترل دسترسی، محافظت CSRF و رمزنگاری credentials کانال اضافه شود. matching فعلی قانون‌محور و قابل‌تأیید توسط فروشنده است و از مدل AI مولد یا دادهٔ آموزشی استفاده نمی‌کند؛ بنابراین دادهٔ کاربر برای آموزش مدل خارجی ارسال نمی‌شود. جزئیات تهدیدها و مرزهای اعتماد در [ARCHITECTURE.md](ARCHITECTURE.md) ثبت شده است.

## محدودیت‌ها و ریسک‌های باقی‌مانده
- **Basalam connector**: مسیرهای REST بر پایه فرض مستند در `docs/architecture.md` هستند و با اکانت واقعی/Sandbox تأیید نشده‌اند (جزئیات در `backend/src/connectors/basalam.ts`).
- **AI SKU Matching** (F4 در PRD) پیاده‌سازی نشده؛ ستون‌های `channel_listing.match_status` و جدول `sku_match_suggestion` در schema آماده‌اند اما matching engine خارج از scope این نسخه است.
- **Auth واقعی** پیاده نشده؛ فعلاً `sellerId` به‌صورت پارامتر/مقدار دمو استفاده می‌شود.
- **Next.js 14.2.35** (آخرین پچ امن خط 14) چند CVE شناخته‌شده دارد که فقط در Next 15/16 (major) رفع شده‌اند؛ جزئیات در `frontend/README.md`.
