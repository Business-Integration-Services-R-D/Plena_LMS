import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Martı Cloud LMS — PoC",
  description: "Denenebilir eğitim yönetim sistemi PoC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased font-sans">
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">
          PoC Demo Ortamı — veriler örnek amaçlıdır · Zorunlu izleme + test + denetim logu
        </div>
        {children}
      </body>
    </html>
  );
}
