import type { Metadata } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "همگام | داشبورد فروشنده",
  description: "هاب واحد موجودی و سفارش برای فروشندگان چندکاناله"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body><a className="skip-link" href="#main-content">رفتن به محتوای اصلی</a>{children}</body>
    </html>
  );
}
