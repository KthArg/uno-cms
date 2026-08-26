import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/preview/contenido/route';
import {
  origenesDeVistaPreviaRemota,
  urlDeVistaPreviaRemota,
  vistaPreviaRemotaActiva,
} from '@/cms/vista-previa-remota';

/**
 * T-R-1: **el interruptor de la vista previa remota** (spec 08 §4.1 y §6.1, ADR-701).
 *
 * Esta lista decide quién puede leer contenido sin publicar, que es la propiedad de seguridad
 * más fuerte que tenía el proyecto hasta ADR-701. Por eso se prueba entrando el entorno y
 * saliendo una lista, sin servidor y sin base de datos: una condición de seguridad que solo se
 * ejercita de pasada, dentro de un manejador que va de otra cosa, es una condición que nadie
 * prueba. Es la misma razón por la que `usarAlmacenLocal()` vive sola.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('T-R-1 — sin PREVIEW_ORIGINS no hay nada', () => {
  it('la variable ausente deja la lista vacía', () => {
    vi.stubEnv('PREVIEW_ORIGINS', undefined);

    expect(origenesDeVistaPreviaRemota()).toEqual([]);
    expect(vistaPreviaRemotaActiva()).toBe(false);
  });

  it('una variable declarada y vacía es lo mismo que ausente', () => {
    // Es lo que queda al copiar `.env.example` sin rellenar. Tratarlo como "hay lista" dejaría
    // la fase medio encendida, que es peor que apagada y que encendida.
    for (const vacia of ['', '   ', ',', ' , ']) {
      expect(origenesDeVistaPreviaRemota(vacia), JSON.stringify(vacia)).toEqual([]);
    }
  });

  it('la ruta de borradores responde 404', async () => {
    vi.stubEnv('PREVIEW_ORIGINS', undefined);

    const respuesta = await GET();

    // 404 y no 403: un 403 confirmaría que ahí hay un endpoint y que solo falta la credencial.
    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).toBe('');
  });

  it('con la variable, la ruta deja de responder 404', async () => {
    // El caso que hace que el anterior pueda fallar. Sin este, quitar la comprobación del
    // manejador dejaría el 404 igual —porque hoy no hay nada que servir— y T-R-1 pasaría sin
    // probar nada. El 501 lo sustituye #179 por la respuesta de §4.3.
    vi.stubEnv('PREVIEW_ORIGINS', 'https://mi-web.com');

    expect((await GET()).status).not.toBe(404);
  });
});

describe('qué se acepta como origen', () => {
  it('un origen a secas, con y sin barra final', () => {
    // La barra final es lo que devuelve el navegador al copiar la dirección de la raíz, y no
    // amplía el permiso ni un carácter.
    expect(origenesDeVistaPreviaRemota('https://mi-web.com')).toEqual(['https://mi-web.com']);
    expect(origenesDeVistaPreviaRemota('https://mi-web.com/')).toEqual(['https://mi-web.com']);
  });

  it('varios separados por comas, con espacios alrededor', () => {
    expect(origenesDeVistaPreviaRemota(' https://a.example , https://b.example ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('http con puerto, que es el caso de la web en local', () => {
    // «CMS desplegado, web en local» es uno de los tres despliegues que la spec §1 declara
    // soportados. Exigir https aquí lo dejaría fuera.
    expect(origenesDeVistaPreviaRemota('http://localhost:3000')).toEqual(['http://localhost:3000']);
  });

  it('normaliza el host y el puerto por defecto, como hace el navegador con Origin', () => {
    // Contra esta forma se comparará la cabecera `Origin` en #179, y llega ya normalizada. Si
    // aquí se guardara lo escrito tal cual, `https://MI-WEB.com` no coincidiría nunca y la
    // vista previa fallaría sin que nada dijera por qué.
    expect(origenesDeVistaPreviaRemota('https://MI-WEB.com:443')).toEqual(['https://mi-web.com']);
  });

  it('no repite un origen escrito dos veces', () => {
    expect(origenesDeVistaPreviaRemota('https://a.example,https://a.example/')).toEqual([
      'https://a.example',
    ]);
  });
});

describe('una lista mal escrita apaga la lista entera', () => {
  it.each([
    ['con ruta', 'https://mi-web.com/es'],
    ['con query', 'https://mi-web.com?a=1'],
    ['con fragmento', 'https://mi-web.com#x'],
    ['con credenciales', 'https://usuario:clave@mi-web.com'],
    ['sin protocolo', 'mi-web.com'],
    ['que no es una URL', 'no es una url'],
    ['con protocolo peligroso', 'javascript:alert(1)'],
    ['con protocolo que no habla HTTP', 'ftp://mi-web.com'],
    // `URL` acepta este: el punto y coma se queda dentro del host y sobrevive a `origin`. El
    // navegador leería `frame-src 'self' https://a` y tiraría el resto como una directiva
    // desconocida, o sea un permiso más ancho del escrito y sin aviso.
    ['con un punto y coma en el host', 'https://a;b.com'],
  ])('%s no se acepta', (_caso, valor) => {
    expect(origenesDeVistaPreviaRemota(valor)).toEqual([]);
  });

  it('una entrada mala tira también a las buenas', () => {
    // Quedarse con lo que se entienda dejaría media configuración funcionando y la otra media
    // callada, que es la clase de fallo que nadie encuentra. Apagándose entera se nota al
    // primer intento.
    expect(
      origenesDeVistaPreviaRemota('https://buena.example,https://mala.example/con/ruta')
    ).toEqual([]);
  });

  it('una ruta no se recorta a su origen en silencio', () => {
    // Recortar `https://mi-web.com/es` a `https://mi-web.com` ampliaría el permiso a más de lo
    // que quien lo escribió puso por escrito, y en la dirección insegura.
    expect(origenesDeVistaPreviaRemota('https://mi-web.com/es')).not.toContain(
      'https://mi-web.com'
    );
  });
});

describe('PREVIEW_URL, que es a dónde apunta el iframe', () => {
  const ORIGENES = 'https://mi-web.com';

  it('la misma URL vale con lista y no vale sin ella', () => {
    // Los dos lados en el mismo caso a propósito. La primera versión de este test solo miraba
    // el lado de «sin lista» y **no probaba nada**: devolvía `null` porque el origen no estaba
    // en la lista, no porque no hubiera lista, y pasaba igual con el interruptor quitado. Lo
    // enseñó la octava mutación, y de ahí salió que aquel corte sobraba.
    expect(urlDeVistaPreviaRemota('https://mi-web.com/es/', ORIGENES)).toBe(
      'https://mi-web.com/es/'
    );
    expect(urlDeVistaPreviaRemota('https://mi-web.com/es/', '')).toBeNull();
  });

  it('puede llevar ruta, que es la razón de que sean dos variables', () => {
    // Un origen no puede llevarla; esta sí. Derivar una de la otra funcionaría hasta el primer
    // caso raro.
    expect(urlDeVistaPreviaRemota('https://mi-web.com/es/', ORIGENES)).toBe(
      'https://mi-web.com/es/'
    );
  });

  it('se ignora si su origen no está en la lista', () => {
    // Si no está, nuestra propia CSP bloquea el iframe: `frame-src` se construye con
    // PREVIEW_ORIGINS. Aceptarla daría una vista previa en blanco con el motivo solo en la
    // consola del navegador.
    expect(urlDeVistaPreviaRemota('https://otra.example/', ORIGENES)).toBeNull();
  });

  it('vacía o no siendo una URL, es null', () => {
    for (const valor of ['', '   ', 'no es una url', 'javascript:alert(1)']) {
      expect(urlDeVistaPreviaRemota(valor, ORIGENES), String(valor)).toBeNull();
    }
  });

  it('ausente también, y aquí hay que quitarla del entorno para preguntarlo', () => {
    // Pasar `undefined` no significa «ausente»: significa «usa el valor por defecto», que es
    // `process.env.PREVIEW_URL`. Sin este `stubEnv`, el caso mediría lo que tenga puesto la
    // máquina donde corra la suite.
    vi.stubEnv('PREVIEW_URL', undefined);

    expect(urlDeVistaPreviaRemota(undefined, ORIGENES)).toBeNull();
  });
});
