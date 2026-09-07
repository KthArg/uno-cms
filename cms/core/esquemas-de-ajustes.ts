import 'server-only';
import { z } from 'zod';
import { isSafeLink } from '@/cms/links';

/**
 * Los esquemas de los ajustes (ADR-410), **en un módulo aparte y sin nada más dentro**.
 *
 * ## Por qué no viven ya en `settings.ts`
 *
 * Porque desde #243 hacen falta en dos sitios que no se pueden importar entre sí.
 * `defineConfig` (`cms/core/config.ts`) tiene que validar el `siteName` con el mismo esquema
 * que lo guarda — si no, la misma cadena está prohibida por un camino y permitida por el otro —
 * y `settings.ts` importa `cms.config.ts`, que a su vez importa `config.ts`. Importarlos
 * mutuamente sería un ciclo.
 *
 * Así que el esquema baja a una hoja: sin base de datos, sin configuración, sin nadie por
 * debajo. Los dos lo importan y ninguno depende del otro.
 *
 * **Esa es toda la razón de este fichero.** Si algún día el ciclo desaparece, esto vuelve a
 * `settings.ts` y no se pierde nada.
 */

/** Esquemas de los ajustes editables. Ver ADR-410. */
export const SETTINGS_SCHEMAS = {
  site: z
    .object({
      siteName: z.string().trim().min(1).max(120),
    })
    .strict(),
  seo: z
    .object({
      defaultTitle: z.string().trim().max(60).optional(),
      defaultDescription: z.string().trim().max(160).optional(),
      // Sin `url()` **y con `isSafeLink`**: aquí caben rutas internas (`/og.png`) además de
      // absolutas, y el criterio de qué destino es aceptable ya está escrito en un sitio.
      // Reutilizarlo evita que dos validaciones del mismo concepto acaben discrepando; no
      // ponerlo dejaría entrar cualquier cadena, `javascript:` incluido, en una URL que sale
      // en el HTML de todas las páginas.
      ogImageUrl: z
        .string()
        .trim()
        .max(2048)
        .refine(isSafeLink, 'Usa una ruta interna o una dirección http(s).')
        .optional(),
    })
    .strict(),
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
