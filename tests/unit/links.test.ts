import { describe, expect, it } from 'vitest';
import { isSafeLink } from '@/cms/core/links';

/**
 * T-39-6 y T-39-7: la mitigación de XSS por URL de SPEC §7.1.
 *
 * Es el test más importante de M1. Una allowlist de protocolos solo vale si resiste
 * ofuscación: la cadena literal `javascript:alert(1)` no la escribe ningún atacante real.
 */

describe('T-39-6 — javascript: se bloquea, incluso ofuscado', () => {
  const bloqueados = [
    ['literal', 'javascript:alert(1)'],
    ['mayúsculas', 'JavaScript:alert(1)'],
    ['todo en mayúsculas', 'JAVASCRIPT:alert(1)'],
    ['espacios delante', '   javascript:alert(1)'],
    ['tabulador delante', '\tjavascript:alert(1)'],
    ['salto de línea delante', '\njavascript:alert(1)'],
    ['byte nulo dentro de la palabra', 'java\u0000script:alert(1)'],
    ['tabulador dentro de la palabra', 'java\tscript:alert(1)'],
    ['salto de línea dentro de la palabra', 'java\nscript:alert(1)'],
    ['retorno de carro dentro', 'java\rscript:alert(1)'],
    ['carácter de control alto', 'javascript:\u007Falert(1)'],
  ] as const;

  it.each(bloqueados)('rechaza %s', (_caso, valor) => {
    expect(isSafeLink(valor)).toBe(false);
  });
});

describe('otros esquemas peligrosos', () => {
  it.each([
    ['data: puede transportar HTML', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['file:', 'file:///etc/passwd'],
    ['blob:', 'blob:https://ejemplo.com/abc'],
  ])('rechaza %s', (_caso, valor) => {
    expect(isSafeLink(valor)).toBe(false);
  });
});

describe('T-39-7 — la allowlist acepta lo que debe', () => {
  it.each([
    'https://ejemplo.com',
    'https://ejemplo.com/ruta?a=1#b',
    'http://ejemplo.com',
    'mailto:hola@ejemplo.com',
    'tel:+34600123456',
    '/contacto',
    '/',
    '#seccion',
    '?filtro=1',
  ])('acepta %s', (valor) => {
    expect(isSafeLink(valor)).toBe(true);
  });
});

describe('el filtro de caracteres de control hace algo por sí mismo', () => {
  // Los casos ofuscados de arriba los bloquea ya la allowlist de protocolos: `new URL`
  // normaliza o falla, y `javascript:` nunca está en la lista. Comprobado por mutación —
  // al quitar el filtro de controles, aquellos 11 casos seguían pasando.
  //
  // Estos son los casos donde el filtro **cambia el resultado**: un protocolo permitido con
  // un carácter de control incrustado. Sin el filtro se aceptarían, porque `URL` los
  // tolera y el protocolo sí está en la allowlist.
  it.each([
    ['byte nulo en la ruta', 'https://ejemplo.com/\u0000'],
    ['byte nulo en el host', 'https://ejem\u0000plo.com'],
    ['salto de línea al final, para partir cabeceras', 'https://ejemplo.com/\n'],
    ['retorno de carro incrustado', 'https://ejemplo.com/a\rb'],
    ['DEL en la ruta', 'https://ejemplo.com/\u007F'],
  ])('rechaza %s', (_caso, valor) => {
    expect(isSafeLink(valor)).toBe(false);
  });
});

describe('casos límite que no son obvios', () => {
  it('rechaza //evil.com, que parece una ruta y es una URL externa', () => {
    // Empieza por barra igual que `/contacto`, pero el navegador la resuelve como
    // `https://evil.com`. Una comprobación de "empieza por /" la dejaría pasar.
    expect(isSafeLink('//evil.com')).toBe(false);
    expect(isSafeLink('//evil.com/phishing')).toBe(false);
  });

  it('rechaza una cadena vacía o solo espacios', () => {
    expect(isSafeLink('')).toBe(false);
    expect(isSafeLink('   ')).toBe(false);
  });

  it('rechaza texto que no es ni ruta ni URL', () => {
    // No se adivina: adivinar aquí es como se acaba aceptando `javascript:` escrito raro.
    expect(isSafeLink('ejemplo.com')).toBe(false);
    expect(isSafeLink('hola qué tal')).toBe(false);
  });

  it('rechaza lo que no es una cadena', () => {
    expect(isSafeLink(undefined)).toBe(false);
    expect(isSafeLink(null)).toBe(false);
    expect(isSafeLink(42)).toBe(false);
    expect(isSafeLink({ toString: () => 'https://ejemplo.com' })).toBe(false);
  });
});
