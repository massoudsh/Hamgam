# گزارش QA — MVP همگام (اعتبارسنجی نسخه یکپارچه)

این گزارش پاسخ به ایشوی [#5 Validate integrated MVP against PRD and security invariants](https://github.com/massoudsh/Hamgam/issues/5) است و روی کدی اجرا شده که ایشوهای [#1](https://github.com/massoudsh/Hamgam/issues/1)، [#2](https://github.com/massoudsh/Hamgam/issues/2)، [#3](https://github.com/massoudsh/Hamgam/issues/3) و [#4](https://github.com/massoudsh/Hamgam/issues/4) را روی یک شاخه (`main`) پیاده و یکپارچه کرده است.

## ۱. نتیجه تست‌های خودکار

| بخش | دستور | نتیجه |
|---|---|---|
| بک‌اند — تست‌ها | `cd backend && npm test` | ✅ ۳۰/۳۰ pass (۸ فایل تست) |
| بک‌اند — typecheck | `npm run typecheck` | ✅ بدون خطا |
| بک‌اند — build (tsc) | `npm run build` | ✅ کامپایل موفق به `dist/` |
| فرانت‌اند — تست‌ها | `cd frontend && npm test` | ✅ ۹/۹ pass |
| فرانت‌اند — typecheck | `npm run typecheck` | ✅ بدون خطا |
| فرانت‌اند — build (`next build`) | — | ⏭️ **اجرا نشده در کانتینر توسعه** طبق سیاست پلتفرم (بیلد سنگین فقط روی سرور SSH). Typecheck + تست واحد جایگزین اعتبارسنجی محلی شده‌اند. |

## ۲. اعتبارسنجی نامتغیرهای امنیتی/دامنه (طبق acceptance criteria ایشو #۵)

| نامتغیر | نحوه اعتبارسنجی | وضعیت |
|---|---|---|
| Idempotency سفارش/رویداد | `orders.test.ts` (replay وبهوک تکراری روی `channel_connection_id+external_order_id`) + `inventory.test.ts` (replay `eventId` روی `processed_event`) | ✅ |
| Optimistic concurrency موجودی | `inventory.test.ts` → دو کاهش هم‌زمان از دو کانال روی موجودی ۱۰ با `Promise.allSettled`؛ فقط یکی موفق، نتیجه نهایی هرگز منفی نمی‌شود | ✅ |
| عدم منفی‌شدن موجودی (stock invariant) | `CHECK (quantity_on_hand >= 0)` در schema + تست `never allows stock to go negative` | ✅ |
| Tenant isolation | `tenant-isolation.test.ts` — لیست موجودی بحرانی، Order Hub، KPI؛ هرکدام per-seller فیلتر و آزمایش شده (حتی با `external_order_id` تکراری بین دو seller) | ✅ |
| مدیریت secret | بدون secret کامیت‌شده؛ فقط `.env.example`؛ `credentials` هر `channel_connection` در schema JSONB است — **رمزنگاری در سطح ستون هنوز پیاده نشده** (ریسک باقی‌مانده، بخش ۴) | ⚠️ Partial |
| Retry کانکتورها | `retry-and-limiter.test.ts` (`withRetry` با backoff نمایی) + `woocommerce.test.ts` (تست شکست ۵۰۳ سپس موفقیت) | ✅ |
| رفتار RTL | `layout.tsx` با `dir="rtl" lang="fa"`؛ کامپوننت‌ها (`OrderHubFilters`, `OrderHubTable`) با متن فارسی رندر و در تست‌های jsdom بررسی شده‌اند. **بازبینی بصری واقعی (مرورگر) طبق سیاست پلتفرم انجام نشده** — فقط بررسی ساختاری/DOM. | ⚠️ ساختاری تأیید شده، بصری ارزیابی‌نشده |
| فیلتر Order Hub | `orders.test.ts` (backend، فیلتر status/channel/date سمت DB) + `OrderHubFilters.test.tsx` + `apiClient.test.ts` (فیلتر سمت دمو) | ✅ |
| Migration/schema smoke test | هر فایل تست از `tests/testDb.ts` استفاده می‌کند که migration واقعی SQL (`migrations/001_init.sql`) را روی یک Postgres شبیه‌سازی‌شده (`pg-mem`) اجرا می‌کند — یعنی هر اجرای تست یک migration smoke test هم هست | ✅ |

## ۳. Traceability نسبت به `docs/prd.md` (فیچرهای MoSCoW)

| فیچر | اولویت | وضعیت در این نسخه (vertical slice) |
|---|---|---|
| F1 اتصال باسلام (OAuth+Webhook) | Must | ⚠️ Partial — کانکتور + webhook handler + polling seam پیاده و تست‌شده؛ **UI/flow اتصال OAuth واقعی** (redirect/consent) ساخته نشده؛ مسیرهای REST فرض‌شده‌اند (نه تأییدشده با اکانت واقعی) |
| F2 اتصال ووکامرس (REST Key) | Must | ⚠️ Partial — کانکتور کامل + تست؛ صفحه تنظیمات وارد کردن Consumer Key/Secret در UI ساخته نشده |
| F3 ثبت نیمه‌دستی اینستاگرام | Must | ✅ کامل — endpoint + کانکتور + تست end-to-end |
| F4 AI SKU Matching | Must | ❌ خارج از scope این نسخه — جدول `sku_match_suggestion` و ستون `match_status` در schema آماده‌اند، matching engine ساخته نشده |
| F5 Sync دوطرفه موجودی | Must | ⚠️ Partial — مسیر **ورودی** (سفارش کانال → کاهش موجودی idempotent) کامل و تست‌شده؛ مسیر **خروجی خودکار** (push به سایر کانال‌ها بعد از هر تغییر) به‌صورت متد `pushInventoryUpdate` در کانکتورها آماده است ولی job/scheduler که آن را خودکار صدا بزند ساخته نشده |
| F6 غیرفعال‌سازی خودکار Listing | Must | ❌ ساخته نشده — به F5 خروجی خودکار وابسته است |
| F7 Order Hub یکپارچه | Must | ✅ کامل — بک‌اند + فرانت‌اند + فیلتر |
| F8 هشدار Low-stock | Should | ⚠️ Partial — آستانه per-SKU + `listCriticalStock` + KPI شمارشی موجود؛ کانال اعلان (پنل/پیامک) ساخته نشده |
| F9 ثبت/مشاهده مرجوعی | Should | ❌ ساخته نشده — جداول `return_request`/`return_item` در schema آماده‌اند |
| F10 داشبورد KPI پایه | Should | ✅ کامل — سه KPI طبق PRD |
| F11 لاگ Sync/رفع خطای اتصال | Could | ❌ ساخته نشده — جدول `sync_job` و `channel_connection.last_error` در schema آماده‌اند |

## ۴. ریسک‌های باقی‌مانده (Residual Risks)

هیچ‌کدام از موارد زیر defect نیستند؛ محدودیت‌های scope این نسخه‌اند که باید در iteration بعدی پوشش داده شوند:

1. **بدون auth واقعی** — endpoint ها `sellerId` را به‌عنوان پارامتر می‌گیرند؛ قبل از قرار گرفتن پشت اینترنت عمومی باید middleware session/JWT اضافه شود.
2. **رمزنگاری credentials** — ستون `channel_connection.credentials` باید در production در سطح اپلیکیشن رمزنگاری شود (فعلاً plain JSONB).
3. **فرضیات Basalam** — مسیرهای REST تأییدنشده؛ باید قبل از اتصال فروشنده واقعی با Sandbox تست شود (جزئیات: `backend/src/connectors/basalam.ts`).
4. **F4/F6/F9/F11** ساخته نشده‌اند (بالا).
5. **CVEهای شناخته‌شده Next.js 14.2.35** — چند CVE (عمدتاً DoS/SSRF در Server Actions/Middleware) فقط در Next 15/16 (major، breaking) رفع شده‌اند؛ ارتقا نیازمند تست کامل جداگانه است.
6. **بیلد production فرانت‌اند** طبق سیاست پلتفرم روی سرور SSH اجرا و اعتبارسنجی نهایی شود (نه صرفاً typecheck+unit test داخل کانتینر).

## نتیجه‌گیری

هسته حیاتی PRD — **جلوگیری از overselling با idempotency و optimistic concurrency، tenant isolation، و Order Hub یکپارچه با کانکتورهای سه‌کاناله** — پیاده و با ۳۹ تست خودکار (۳۰ بک‌اند + ۹ فرانت‌اند) پوشش داده شده و هیچ defect باز شناخته‌شده‌ای ندارد. موارد بخش ۳ (F4/F6/F9/F11) و بخش ۴ برای رسیدن به scope کامل PRD در نسخه‌های بعدی باقی مانده‌اند.
