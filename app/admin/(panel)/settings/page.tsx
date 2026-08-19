import { updateSettings } from '@/cms/actions';
import type { ActionFieldError } from '@/cms/actions/pipeline';
import { soloAdmin } from '@/cms/auth/panel';
import { readSettings } from '@/cms/core/settings';
import { SettingsScreen } from '@/cms/ui/SettingsScreen';

/**
 * Ajustes del sitio (ADR-410, SPEC §5.3).
 *
 * Cerrada a `admin` por la misma razón que la action: esto no es contenido, cambia cómo se
 * comporta el sitio entero.
 */
export const dynamic = 'force-dynamic';

export default async function PantallaDeAjustes() {
  await soloAdmin();

  const site = await readSettings('site');
  const seo = await readSettings('seo');

  async function guardar(
    clave: 'site' | 'seo',
    valores: Record<string, string>
  ): Promise<{ ok: boolean; message?: string; errores?: readonly ActionFieldError[] }> {
    'use server';

    // Los campos opcionales vacíos se quitan en vez de mandarse como cadena vacía: sus
    // esquemas son `.optional()`, y "sin valor" y "valor vacío" tienen que acabar siendo lo
    // mismo en la base de datos o el sitio leería un título por defecto que es una cadena
    // vacía, que no es lo mismo que no tener título por defecto.
    const limpios: Record<string, string> = {};
    for (const [nombre, valor] of Object.entries(valores)) {
      if (valor.trim() !== '') limpios[nombre] = valor;
    }

    const resultado = await updateSettings({ key: clave, value: limpios });

    if (resultado.ok) return { ok: true };

    return {
      ok: false,
      message: resultado.message,
      ...(resultado.fields === undefined ? {} : { errores: resultado.fields }),
    };
  }

  return (
    <SettingsScreen
      nombreDelSitio={String(site['siteName'] ?? '')}
      seo={{
        ...(typeof seo['defaultTitle'] === 'string' ? { defaultTitle: seo['defaultTitle'] } : {}),
        ...(typeof seo['defaultDescription'] === 'string'
          ? { defaultDescription: seo['defaultDescription'] }
          : {}),
        ...(typeof seo['ogImageUrl'] === 'string' ? { ogImageUrl: seo['ogImageUrl'] } : {}),
      }}
      onGuardar={guardar}
    />
  );
}
