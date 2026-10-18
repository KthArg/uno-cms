import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T-18-4 a T-18-7 y T-18-10: a dónde va quien pide `/`, y qué anuncia el sitemap (spec 18).
 *
 * Se llama a la landing y al sitemap **de verdad**, con lo que consultan simulado: si el sitio está
 * configurado y si la web vive fuera. Lo que la spec 14 comprobaba leyendo el orden de dos cadenas
 * en el fichero, aquí se comprueba por lo que hace cada caso.
 *
 * `redirect` de Next lanza para cortar el render; el simulacro lanza igual, con el destino en el
 * mensaje, para que un caso que redirige no pueda seguir pintando por accidente.
 */

const estado = vi.hoisted(() => ({ configurado: true, fuera: false }));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT ${destino}`);
  }),
}));
vi.mock('@/cms/core/settings', () => ({
  isSiteConfigured: vi.fn(() => Promise.resolve(estado.configurado)),
}));
vi.mock('@/cms/core/web-externa', () => ({ webExterna: vi.fn(() => estado.fuera) }));
vi.mock('@/cms/core/content', () => ({
  getContent: vi.fn(() => Promise.resolve({})),
  getCollection: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@/cms/auth/panel', () => ({
  direccionDelSitio: vi.fn(() => Promise.resolve('https://mi-cms.com')),
}));

const { redirect } = await import('next/navigation');
const { getContent } = await import('@/cms/core/content');
const { Landing } = await import('@/app/(site)/landing');
const { default: sitemap } = await import('@/app/sitemap');

/** El nombre del componente que devolvió la landing, para distinguir sus dos pantallas. */
function pantalla(elemento: unknown): string {
  const tipo = (elemento as ReactElement).type;
  return typeof tipo === 'function' ? tipo.name : String(tipo);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('T-18-4 a T-18-7 — la raíz', () => {
  it('T-18-4: sin configurar y con la web fuera, va a /setup', async () => {
    Object.assign(estado, { configurado: false, fuera: true });

    await expect(Landing({ idioma: 'es' })).rejects.toThrow('REDIRECT /setup');
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it('T-18-5: sin configurar y con la web en casa, enseña el aviso y no redirige', async () => {
    Object.assign(estado, { configurado: false, fuera: false });

    const resultado = await Landing({ idioma: 'es' });

    expect(redirect).not.toHaveBeenCalled();
    expect(pantalla(resultado)).toBe('SinConfigurar');
  });

  it('T-18-6: configurado y con la web fuera, va al panel', async () => {
    Object.assign(estado, { configurado: true, fuera: true });

    await expect(Landing({ idioma: 'es' })).rejects.toThrow('REDIRECT /admin');
    expect(redirect).toHaveBeenCalledTimes(1);
    // Y no ha llegado a leer contenido: se corta antes.
    expect(getContent).not.toHaveBeenCalled();
  });

  it('T-18-7: configurado y con la web en casa, pinta la landing', async () => {
    Object.assign(estado, { configurado: true, fuera: false });

    const resultado = await Landing({ idioma: 'es' });

    expect(redirect).not.toHaveBeenCalled();
    expect(getContent).toHaveBeenCalled();
    expect(pantalla(resultado)).not.toBe('SinConfigurar');
  });
});

describe('T-18-10 — el sitemap', () => {
  it('con la web fuera no anuncia nada', async () => {
    Object.assign(estado, { fuera: true });
    await expect(sitemap()).resolves.toEqual([]);
  });

  it('con la web en casa anuncia la raíz', async () => {
    Object.assign(estado, { fuera: false });
    const entradas = await sitemap();
    expect(entradas.map((entrada) => entrada.url)).toContain('https://mi-cms.com/');
  });
});
