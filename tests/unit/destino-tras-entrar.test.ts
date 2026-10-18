import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { destinoInterno } from '@/cms/routes';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-S-1: a dónde se manda a alguien después de entrar (spec 19).
 *
 * La página de acceso tenía dos ramas y una sola comprobación. La de quien ya tiene sesión
 * redirigía a lo que trajera `?next=` sin mirar, y `?next=https://otro` llevaba fuera a quien
 * pinchara un enlace de nuestro propio dominio.
 */

const BASE = 'https://cms.example';

/** Lo que de verdad importa: a qué origen acaba yendo el navegador. */
function origenAlQueVa(destino: string): string {
  return new URL(destino, BASE).origin;
}

describe('T-S-1 — el destino tras entrar es siempre del panel', () => {
  it.each(['/admin', '/admin/collections/testimonios', '/admin/content/hero', '/admin?idioma=en'])(
    'deja pasar %s tal cual',
    (next) => {
      expect(destinoInterno(next)).toBe(next);
    }
  );

  it.each([
    ['una URL absoluta', 'https://ajeno.example/admin/login'],
    ['una URL relativa al protocolo', '//ajeno.example'],
    ['la barra invertida, que el navegador lee como barra', '/\\ajeno.example'],
    ['una ruta fuera del panel', '/preview?token=x'],
    ['un prefijo que solo se parece', '/administrador'],
    ['un salto de línea, que tumbaría la cabecera Location', '/admin/\r\nSet-Cookie: x=1'],
    ['nada', undefined],
    ['algo que no es texto', ['/admin']],
  ])('devuelve /admin para %s', (_caso, next) => {
    expect(destinoInterno(next)).toBe('/admin');
  });

  it.each([
    'https://ajeno.example',
    '//ajeno.example',
    '/\\ajeno.example',
    '/admin//ajeno.example',
    '/admin/\\ajeno.example',
    '/admin\\@ajeno.example',
    '\t//ajeno.example',
    ' /\\ajeno.example',
  ])('con %j, el navegador se queda en nuestro origen', (next) => {
    // La propiedad, no la lista: sea lo que sea lo que devuelva, resuelto como lo resuelve un
    // navegador no sale de aquí.
    expect(origenAlQueVa(destinoInterno(next))).toBe(BASE);
  });

  it('y la página de acceso lo usa en las dos ramas, también con sesión', () => {
    // Lo que se coló fue precisamente una segunda rama con su propia comprobación. El código
    // fuente es lo que se puede afirmar sin levantar un servidor: que no quede ningún
    // `redirect` ni `redirectTo` que lea `params.next` directamente.
    const pagina = readFileSync(join(REPO_ROOT, 'app/admin/login/page.tsx'), 'utf8');

    expect(pagina).toContain('destinoInterno(params.next)');
    expect(pagina).not.toMatch(/redirect\(\s*params\.next/);
    expect(pagina).not.toMatch(/redirectTo:(?!\s*destino\b)/);
  });
});
