import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-S-20: las rutas públicas leen por la caché de datos, no directamente de la base (spec 19).
 *
 * **Lee el código fuente**, por el mismo motivo que `content-cache-layers.test.ts`:
 * `unstable_cache` lanza fuera de una petición (ADR-405), así que su efecto no se observa desde
 * Vitest. Lo que se afirma es que las rutas llaman a las variantes con caché y no a las que van
 * a la base; que esas variantes cachean de verdad lo vigila el otro test.
 */

function fuente(ruta: string): string {
  return readFileSync(join(REPO_ROOT, ruta), 'utf8');
}

describe('T-S-20 — una URL distinta no es una consulta distinta', () => {
  it('/api/content/:key lee con getContent y getCollection', () => {
    const ruta = fuente('app/api/content/[key]/route.ts');

    expect(ruta).toMatch(/await getContent\(/);
    expect(ruta).toMatch(/await getCollection\(/);
    expect(ruta).not.toMatch(/\breadContent\(|\breadCollection\(/);
  });

  it('/api/settings lee con getSettings', () => {
    const ruta = fuente('app/api/settings/route.ts');

    expect(ruta).toMatch(/getSettings\('site'\)/);
    expect(ruta).not.toMatch(/\breadSettings\(/);
  });

  it('y getSettings se invalida con el tag que limpia updateSettings', () => {
    const ajustes = fuente('cms/core/settings.ts');
    const getSettings = ajustes.slice(ajustes.indexOf('export function getSettings'));
    const cuerpo = getSettings.slice(0, getSettings.indexOf('\n}'));

    expect(cuerpo).toContain('unstable_cache(');
    expect(cuerpo).toContain('tags: [SETTINGS_TAG]');
    expect(fuente('cms/actions/settings.actions.ts')).toContain('revalidateTag(SETTINGS_TAG)');
  });
});
