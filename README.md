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

## تست

```bash
cd backend  && npm ci && npm test && npm run typecheck && npm run build
cd frontend && npm ci && npm test && npm run typecheck && npm run build
```

تست‌های بک‌اند به PostgreSQL واقعی نیاز ندارند (از `pg-mem` برای اجرای SQL واقعی migration بدون سرور دیتابیس استفاده می‌شود). تست‌های فرانت‌اند با jsdom اجرا می‌شوند، نه مرورگر واقعی. همین بررسی‌ها برای push و pull request به شاخهٔ `main` در GitHub Actions نیز اجرا می‌شوند.

## ارزیابی امنیت و AI

این MVP هنوز احراز هویت واقعی ندارد و `sellerId` از caller دریافت می‌شود؛ پیش از استقرار عمومی باید session/JWT، کنترل دسترسی، محافظت CSRF و رمزنگاری credentials کانال اضافه شود. matching فعلی قانون‌محور و قابل‌تأیید توسط فروشنده است و از مدل AI مولد یا دادهٔ آموزشی استفاده نمی‌کند؛ بنابراین دادهٔ کاربر برای آموزش مدل خارجی ارسال نمی‌شود. جزئیات تهدیدها و مرزهای اعتماد در [ARCHITECTURE.md](ARCHITECTURE.md) ثبت شده است.

## محدودیت‌ها و ریسک‌های باقی‌مانده
- **Basalam connector**: مسیرهای REST بر پایه فرض مستند در `docs/architecture.md` هستند و با اکانت واقعی/Sandbox تأیید نشده‌اند (جزئیات در `backend/src/connectors/basalam.ts`).
- **AI SKU Matching** (F4 در PRD) پیاده‌سازی نشده؛ ستون‌های `channel_listing.match_status` و جدول `sku_match_suggestion` در schema آماده‌اند اما matching engine خارج از scope این نسخه است.
- **Auth واقعی** پیاده نشده؛ فعلاً `sellerId` به‌صورت پارامتر/مقدار دمو استفاده می‌شود.
- **Next.js 14.2.35** (آخرین پچ امن خط 14) چند CVE شناخته‌شده دارد که فقط در Next 15/16 (major) رفع شده‌اند؛ جزئیات در `frontend/README.md`.
