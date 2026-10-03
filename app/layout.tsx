import type { Metadata } from 'next';
import { idiomaPorDefecto } from '@/cms/core/idiomas';
import './globals.css';

export const metadata: Metadata = {
  title: 'UnoCMS',
  description: 'CMS acoplado 1:1 a una landing, auto-hospedable en Vercel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // El idioma por defecto, de `cms.config.ts` y no escrito a mano (spec 17 §5.6). Las páginas
    // en otro idioma lo corrigen en su `<main lang>`: este `<html>` lo comparte el panel, y
    // saber aquí la ruta obligaría a leer la petición en cada página del sitio.
    <html lang={idiomaPorDefecto().codigo}>
      <body className="min-h-dvh bg-white text-slate-900 antialiased">{children}</body>
    </html>
  );
}
