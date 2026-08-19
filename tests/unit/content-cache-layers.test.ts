import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Las dos capas de caché de la lectura pública (SPEC §5.2).
 *
 * **Este test lee el código fuente, y conviene decir por qué en vez de disimularlo.**
 *
 * `cache()` de React solo memoriza dentro de un render de servidor: fuera de él devuelve una
 * función que no guarda nada, así que su efecto no es observable desde Vitest. Y
 * `unstable_cache` lanza fuera de una petición (ADR-405). Es decir: ninguna de las dos capas
 * se puede comprobar por comportamiento aquí.
 *
 * Sin este test, quitar el `cache()` de React no rompería nada: los casos T-76-* seguirían en
 * verde porque atacan `readContent`, y T-76-6 seguiría en verde porque `unstable_cache` sigue
 * estando. La regresión sería invisible hasta que alguien mirase las consultas de un render.
 *
 * Lo que sí verifica esto es débil y no pretendo otra cosa: que las dos capas siguen
 * escritas. El comportamiento real se comprueba en e2e, en M5, donde hay un servidor.
 */

const SOURCE = readFileSync(
  fileURLToPath(new URL('../../cms/core/content.ts', import.meta.url)),
  'utf8'
);

describe('la lectura pública mantiene sus dos capas de caché', () => {
  it('usa unstable_cache, que guarda entre peticiones y se invalida por tag', () => {
    expect(SOURCE).toContain("import { unstable_cache } from 'next/cache'");
    // El tag es el contrato con `publish` (#78): si cambiara aquí y no allí, publicar dejaría
    // de invalidar y nadie vería un error — solo contenido viejo.
    expect(SOURCE).toContain('tags: [contentTag(key)]');
  });

  it('usa cache() de React, que deduplica dentro de una misma petición', () => {
    expect(SOURCE).toContain("import { cache } from 'react'");
    expect(SOURCE).toContain('export const getContent = cache(');
    expect(SOURCE).toContain('export const getCollection = cache(');
  });

  it('el borrador no pasa por ninguna de las dos', () => {
    // Cachear el borrador entre peticiones haría que el editor viese su propio texto con
    // retraso. Es el caso que el criterio de #76 nombra explícitamente.
    const getDraft = SOURCE.slice(SOURCE.indexOf('export async function getDraft'));
    const cuerpo = getDraft.slice(0, getDraft.indexOf('\n}'));

    expect(cuerpo).not.toContain('unstable_cache');
    expect(cuerpo).not.toContain('cache(');
  });
});
