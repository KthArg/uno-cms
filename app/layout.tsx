import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'UnoCMS',
  description: 'CMS acoplado 1:1 a una landing, auto-hospedable en Vercel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}
