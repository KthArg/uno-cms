import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esNoIndexable, PREFIJOS_NO_INDEXABLES } from '@/cms/routes';
import { sinComentarios } from '../support/codigo';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-L-2 y T-L-3: el sitemap no puede anunciar lo que el middleware esconde (SPEC §7.2, #146).
 *
 * ## Por qué esto no es simetría por elegancia
 *
 * `X-Robots-Tag: noindex` le dice al buscador que no indexe **después de haber ido a mirar**. Un
 * sitemap que anuncia `/preview` invita a ir, y basta con que un enlace de vista previa siga
 * vivo para que lo que se sirva ahí sea contenido sin publicar de alguien.
 *
 * Con dos listas, añadir un prefijo al middleware y olvidarlo en el sitemap deja ese agujero
 * **y en verde**. Por eso lo que se comprueba aquí es que sea una sola.
 */

// Sin los comentarios: el sitemap **explica** qué prefijos deja fuera, y nombrarlos ahí no
// es anunciarlos. La pieza es compartida porque este mismo tropiezo ya lo tuvo el test de
// `postMessage`.
const SITEMAP = sinComentarios(readFileSync(join(REPO_ROOT, 'app', 'sitemap.ts'), 'utf8'));
const MIDDLEWARE = sinComentarios(readFileSync(join(REPO_ROOT, 'middleware.ts'), 'utf8'));

describe('T-L-3 — una sola lista de rutas no indexables', () => {
  it('el middleware la consulta en vez de tener la suya', () => {
    expect(MIDDLEWARE).toContain("from '@/cms/routes'");
    expect(MIDDLEWARE).toContain('esNoIndexable(path)');

    // Y no queda una copia escrita a mano al lado.
    expect(MIDDLEWARE).not.toContain("'/preview'");
    expect(MIDDLEWARE).not.toContain("'/setup'");
  });

  it('la lista tiene los cuatro prefijos de §7.2', () => {
    // Se fija el conjunto entero: que crezca o encoja sin que nadie lo note es exactamente cómo
    // se acaba indexando el panel.
    expect([...PREFIJOS_NO_INDEXABLES].sort()).toEqual(['/admin', '/api', '/preview', '/setup']);
  });
});

describe('T-L-2 — el sitemap deja fuera lo no indexable', () => {
  it('no menciona ninguno de los prefijos', () => {
    // El sitemap de este proyecto anuncia una sola dirección, así que la comprobación es
    // literal: si algún día alguien añade rutas, este test le obliga a mirar la lista.
    for (const prefijo of PREFIJOS_NO_INDEXABLES) {
      expect(SITEMAP, `el sitemap menciona ${prefijo}`).not.toContain(`${prefijo}`);
    }
  });

  it('la función que decide cubre el prefijo y lo que cuelga de él', () => {
    expect(esNoIndexable('/admin')).toBe(true);
    expect(esNoIndexable('/admin/users')).toBe(true);
    expect(esNoIndexable('/preview')).toBe(true);

    // Y no cubre lo que solo se le parece: `/administracion` no es `/admin`, y marcarla como no
    // indexable sería sacar del buscador una página pública sin que nadie lo note.
    expect(esNoIndexable('/administracion')).toBe(false);
    expect(esNoIndexable('/')).toBe(false);
  });
});
