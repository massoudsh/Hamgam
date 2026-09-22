# Hamgam Frontend — داشبورد فروشنده (RTL)

پیاده‌سازی `docs/prd.md` (F1/F5) — داشبورد RTL با KPI Cards و Order Hub یکپارچه.

## نصب

```bash
cd frontend
npm install
```

## اجرا (توسعه)

```bash
npm run dev
```

پیش‌فرض بدون بک‌اند در **حالت نمایشی (Demo mode)** اجرا می‌شود (داده‌های `src/lib/demoData.ts`). برای اتصال به بک‌اند واقعی:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000 npm run dev
```

## تست

```bash
npm test         # تست کامپوننت‌ها با Vitest + Testing Library (jsdom, بدون مرورگر واقعی)
npm run typecheck
```

> ⚠️ طبق سیاست پلتفرم، اجرای `npm run build` (بیلد production سنگین Next.js) در محیط توسعه/کانتینر انجام نشده — این مرحله باید روی سرور استقرار (SSH) اجرا شود. صحت کد در این‌جا با `typecheck` + تست‌های واحد (jsdom، بدون Chrome/Playwright) تأیید شده است.

## ساختار

```
src/app/            صفحات Next.js App Router (layout با dir="rtl" lang="fa")
src/components/      KpiCards, OrderHubFilters, OrderHubTable, Dashboard
src/lib/apiClient.ts  کلاینت تایپ‌شده با fallback خودکار به داده نمایشی
src/lib/demoData.ts   داده دمو برای حالت آفلاین/بدون بک‌اند
```

## محدودیت‌های شناخته‌شده (MVP)
- بدون auth واقعی؛ `sellerId` دمو ثابت در `Dashboard.tsx` استفاده می‌شود.
- برخی CVEهای شناخته‌شده Next.js 14.x (مربوط به Server Actions/Middleware/Image Optimizer در دیپلوی‌های خاص) در نسخه فعلی (`14.2.35`، آخرین پچ امن خط 14) هنوز باز هستند و فقط در Next 15/16 (major، breaking) رفع شده‌اند؛ ارتقا به آن نسخه‌ها در این commit انجام نشد تا از تغییرات شکننده بدون تست کامل جلوگیری شود — قبل از قرار گرفتن پشت اینترنت عمومی باید ارزیابی و آپدیت شود.
