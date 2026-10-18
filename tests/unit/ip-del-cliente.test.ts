import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ipDelCliente } from '@/cms/security/ip';
import { REPO_ROOT } from '../support/module-boundary';

/** T-S-9: de dónde sale la IP del limitador y de la auditoría (ADR-1302). */

function cabeceras(valores: Record<string, string>): Headers {
  return new Headers(valores);
}

const FUERA_DE_VERCEL = {};
const EN_VERCEL = { VERCEL: '1' };

describe('T-S-9 — la IP es la que añadió quien tenemos delante, no la que escribe el cliente', () => {
  it('fuera de Vercel, la última entrada de X-Forwarded-For', () => {
    // El cliente mandó `1.1.1.1`; el proxy añadió al final quién le habló de verdad.
    const ip = ipDelCliente(
      cabeceras({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }),
      FUERA_DE_VERCEL
    );
    expect(ip).toBe('203.0.113.7');
  });

  it('cambiar la cabecera que manda el cliente no cambia la IP', () => {
    const una = ipDelCliente(cabeceras({ 'x-forwarded-for': 'inventada-1, 203.0.113.7' }), {});
    const otra = ipDelCliente(cabeceras({ 'x-forwarded-for': 'inventada-2, 203.0.113.7' }), {});
    expect(una).toBe(otra);
  });

  it('en Vercel, x-real-ip, que escribe la plataforma', () => {
    const ip = ipDelCliente(
      cabeceras({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }),
      EN_VERCEL
    );
    expect(ip).toBe('198.51.100.4');
  });

  it('fuera de Vercel, x-real-ip no se cree: la podría mandar cualquiera', () => {
    const ip = ipDelCliente(
      cabeceras({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '203.0.113.7' }),
      FUERA_DE_VERCEL
    );
    expect(ip).toBe('203.0.113.7');
  });

  it('sin cabeceras, nada: quien llama usa «desconocida»', () => {
    expect(ipDelCliente(cabeceras({}), FUERA_DE_VERCEL)).toBeUndefined();
    expect(ipDelCliente(cabeceras({ 'x-forwarded-for': ' , ' }), FUERA_DE_VERCEL)).toBeUndefined();
  });

  it('y nadie más en app/ ni cms/ lee x-forwarded-for por su cuenta', () => {
    // Fueron tres copias de la misma línea equivocada. Que vuelva a haber una cuarta es lo que
    // este caso impide.
    const permitido = join('cms', 'security', 'ip.ts');

    function recorrer(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) return recorrer(ruta);
        return ['.ts', '.tsx'].includes(extname(e.name)) ? [ruta] : [];
      });
    }

    const lectores = ['app', 'cms']
      .flatMap((d) => recorrer(join(REPO_ROOT, d)))
      .filter((f) => relative(REPO_ROOT, f) !== permitido)
      .filter((f) => /\.get\(\s*['"]x-forwarded-for['"]/i.test(readFileSync(f, 'utf8')))
      .map((f) => relative(REPO_ROOT, f));

    expect(lectores).toEqual([]);
  });
});
