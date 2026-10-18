import { describe, expect, it } from 'vitest';
import { laWebViveFuera, urlDeVistaPreviaRemota } from '@/cms/vista-previa-remota';

/**
 * T-248-1 a T-248-3: cuándo está puesta la vista previa remota (spec 14, issue #248).
 *
 * ## Lo que se puede comprobar aquí y lo que no
 *
 * La **condición** se ejercita de verdad: es una función pura con sus dos variables por
 * parámetro, y los tres estados que importan tienen su caso.
 *
 * El cableado —que la landing y el sitemap la usen— lo prueba la spec 18, en
 * `tests/ui/la-raiz-con-la-web-fuera.test.tsx`.
 */

const ORIGENES = 'https://mi-web.com';

describe('T-248-1 a T-248-3 — cuándo se considera que la web vive fuera', () => {
  it('T-248-1: sin `PREVIEW_URL`, no vive fuera', () => {
    expect(laWebViveFuera(undefined, ORIGENES)).toBe(false);
    expect(laWebViveFuera('', ORIGENES)).toBe(false);
    // Y con espacios, que es lo que deja una variable "vacía" escrita a mano.
    expect(laWebViveFuera('   ', ORIGENES)).toBe(false);
  });

  it('T-248-2: con la dirección y su origen en la lista, sí', () => {
    expect(laWebViveFuera('https://mi-web.com/es/', ORIGENES)).toBe(true);
  });

  it('T-248-3: con la dirección pero su origen fuera de la lista, no', () => {
    // El estado incoherente de la spec 08 §4.1. Ahí la CSP bloquearía el iframe, así que la web
    // de fuera no está configurada de verdad y la landing local sigue siendo lo que hay.
    expect(laWebViveFuera('https://otra-web.com/', ORIGENES)).toBe(false);
    // Y sin lista, tampoco: la lista **es** el interruptor de la fase.
    expect(laWebViveFuera('https://mi-web.com/', '')).toBe(false);
  });

  it('es exactamente la condición que decide a dónde apunta el iframe', () => {
    // Lo que este caso protege no es el valor: es que **no puedan discrepar**. Si algún día
    // `laWebViveFuera` cogiera vida propia, existiría un estado con la raíz redirigiendo al panel
    // y el iframe apuntando a casa.
    for (const url of ['https://mi-web.com/', 'https://otra-web.com/', '', undefined]) {
      expect(laWebViveFuera(url, ORIGENES)).toBe(urlDeVistaPreviaRemota(url, ORIGENES) !== null);
    }
  });
});

// T-248-4 a T-248-7 los sustituye la spec 18 (ADR-1200): el cableado de la landing se prueba
// llamándola en `tests/ui/la-raiz-con-la-web-fuera.test.tsx`, y el del sitemap allí mismo.
