import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { laWebViveFuera, urlDeVistaPreviaRemota } from '@/cms/vista-previa-remota';
import { sinComentarios } from '../support/codigo';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-248-1 a T-248-7: con la web fuera, la raíz lleva al panel (spec 14, issue #248).
 *
 * ## Lo que se puede comprobar aquí y lo que no
 *
 * La **condición** se ejercita de verdad: es una función pura con sus dos variables por
 * parámetro, y los tres estados que importan tienen su caso.
 *
 * El **cableado** —que la landing la consulte, y en el orden correcto— se comprueba leyendo el
 * fichero, que es análisis de texto y detecta lo que se puede detectar así: que la llamada esté,
 * y que esté **después** de la comprobación del sitio sin configurar. No demuestra que Next
 * redirija; eso lo demostraría un e2e, y esta fase no lo tiene por el motivo que la spec 08 ya
 * aceptó: la suite arranca un servidor con la fase remota apagada a mano, justo para que los
 * casos de la vista previa local sigan valiendo.
 *
 * Se dice aquí en vez de dejarlo implícito, porque una guarda de texto que se lee como si fuera
 * de comportamiento es la que hace creer que algo está cubierto cuando no lo está.
 */

const ORIGENES = 'https://mi-web.com';
const LANDING = sinComentarios(readFileSync(join(REPO_ROOT, 'app', '(site)', 'page.tsx'), 'utf8'));
const SITEMAP = sinComentarios(readFileSync(join(REPO_ROOT, 'app', 'sitemap.ts'), 'utf8'));

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

describe('T-248-4 y T-248-5 — la landing pregunta, y en el orden correcto', () => {
  it('T-248-5: usa `laWebViveFuera` y no una condición propia', () => {
    expect(LANDING).toContain("from '@/cms/vista-previa-remota'");
    expect(LANDING).toContain('laWebViveFuera()');

    // Y no se ha colado una copia leyendo el entorno por su cuenta, que es como nacen las dos
    // verdades que el caso de arriba impide en la función.
    expect(LANDING).not.toContain('PREVIEW_URL');
    expect(LANDING).not.toContain('PREVIEW_ORIGINS');
  });

  it('T-248-4: el sitio sin configurar se comprueba ANTES de redirigir', () => {
    /**
     * El orden es el caso, no un detalle de estilo.
     *
     * Hoy **nada más en la aplicación lleva a `/setup`**: la pantalla de "todavía no está listo"
     * es la única forma de descubrir esa dirección en un despliegue recién hecho. Con el orden
     * invertido, quien despliegue el CMS para una web de fuera se queda sin puerta de entrada.
     */
    const sinConfigurar = LANDING.indexOf('isSiteConfigured()');
    const redirige = LANDING.indexOf('laWebViveFuera()');

    expect(
      sinConfigurar,
      'la landing ya no comprueba si el sitio está configurado'
    ).toBeGreaterThan(-1);
    expect(redirige, 'la landing ya no consulta si la web vive fuera').toBeGreaterThan(-1);
    expect(
      sinConfigurar,
      'redirigir antes de comprobar el sitio deja un despliegue nuevo sin camino a /setup'
    ).toBeLessThan(redirige);
  });

  it('y redirige al panel, no a otra parte', () => {
    expect(LANDING).toContain("redirect('/admin')");
  });
});

describe('T-248-6 y T-248-7 — el sitemap', () => {
  it('T-248-6: con la web fuera no anuncia nada', () => {
    expect(SITEMAP).toContain('laWebViveFuera()');
    expect(SITEMAP).toContain('return [];');
  });

  it('T-248-7: y el corte va antes de construir la lista', () => {
    // Si estuviera después, el sitemap anunciaría `/` igualmente: una dirección que redirige al
    // panel, que es `noindex`. Es el mismo error que este fichero evita con `/preview`, en
    // pequeño.
    const corte = SITEMAP.indexOf('laWebViveFuera()');
    const lista = SITEMAP.indexOf('changeFrequency');

    expect(corte).toBeGreaterThan(-1);
    expect(lista).toBeGreaterThan(-1);
    expect(corte).toBeLessThan(lista);
  });
});
