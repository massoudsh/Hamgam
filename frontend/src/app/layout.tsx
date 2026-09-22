import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "همگام | داشبورد فروشنده",
  description: "هاب واحد موجودی و سفارش برای فروشندگان چندکاناله"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
