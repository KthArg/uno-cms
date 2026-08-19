import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import appConfig from '@/cms.config';
import { getDb, settings } from '@/cms/db';
import { isSafeLink } from './links';

/**
 * Ajustes del sitio (SPEC §4, tabla `settings`).
 *
 * ## Qué son los "ajustes" y en qué se diferencian del contenido
 *
 * `SPEC.md` §4 define la tabla con las claves `'seo' | 'site' | 'setup_completed'`, y §5.3 da
 * a `updateSettings` la entrada `{ key: 'seo'|'site', value }` con un "valida por schema" que
 * no concreta cuál. Hay que fijarlo, y de paso deshacer una ambigüedad que se nota enseguida:
 * **`cms.config.ts` ya tiene un singleton llamado `seo`**.
 *
 * No son lo mismo y no deben confundirse (ADR-410):
 *
 * - El **singleton `seo`** es contenido: lo edita quien escribe, pasa por borrador y
 *   publicación, y tiene historial.
 * - El **ajuste `seo`** son los valores por defecto del sitio, que se aplican donde el
 *   contenido no dice nada. Los toca un administrador y tienen efecto inmediato, sin
 *   publicar: no son texto de una página, son configuración.
 *
 * Este módulo vive en `cms/core` y no en `cms/actions` porque **leer no es mutar**, y el test
 * T-75-6 exige que todo lo exportado desde `cms/actions` pase por el envoltorio. La misma
 * separación que hay entre `cms/core/content.ts` y `content.actions.ts`.
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

/**
 * El tag de caché de los ajustes.
 *
 * Uno solo para todos: los ajustes se leen en el layout, así que cualquier cambio afecta a
 * todas las páginas y separar por clave no ahorraría nada.
 */
export const SETTINGS_TAG = 'settings';

/** Valores por defecto de cada ajuste, para cuando todavía no se ha guardado ninguno. */
function defaultSettings(key: SettingsKey): Record<string, unknown> {
  return key === 'site' ? { siteName: appConfig.siteName } : {};
}

/** Lee un ajuste, con sus valores por defecto. */
export async function readSettings(key: SettingsKey): Promise<Record<string, unknown>> {
  const [row] = await getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);

  const parsed = SETTINGS_SCHEMAS[key].safeParse(row?.value ?? {});

  // Mismo criterio que ADR-404 en la lectura de contenido: un ajuste guardado que ya no
  // encaja con su esquema —porque el esquema cambió— no puede tumbar el sitio entero. Se cae
  // a los valores por defecto y se registra.
  if (!parsed.success) {
    console.error(`[settings:${key}] el valor guardado no pasa su esquema; se usan los defectos`);
    return defaultSettings(key);
  }

  return { ...defaultSettings(key), ...(parsed.data as Record<string, unknown>) };
}
