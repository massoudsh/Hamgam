import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import { ThemeControl } from "@/components/ThemeControl";

export const metadata: Metadata = {
  title: "همگام | داشبورد فروشنده",
  description: "هاب واحد موجودی و سفارش برای فروشندگان چندکاناله"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body><ThemeControl />{children}</body>
    </html>
  );
}
