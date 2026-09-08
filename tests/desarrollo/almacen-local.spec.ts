import { expect, test } from '@playwright/test';
import { consultarValor, ejecutarSql } from '../e2e/support/db';
import { crearYEntrar } from '../e2e/support/session';

/**
 * T-170-1 a T-170-3: **el almacén local, de punta a punta en un navegador** (issue #170, ADR-700).
 *
 * ## El hueco que cierra
 *
 * Lo cubierto eran los manejadores llamados directamente (T-A-5 … T-A-13b) y la bifurcación del
 * editor con componentes (T-A-14 … T-A-16b). Lo que **no lo estaba por nada** era el bucle entero:
 * elegir el fichero, que llegue, que la fila se cree, y que la imagen se sirva desde
 * `/api/media/local/…`.
 *
 * No se podía: la suite normal corre en producción y ahí este almacén está apagado a propósito.
 * Esta corre contra `next dev`, que es donde el almacén existe. El porqué de que eso no sea una
 * trampa está en `playwright.desarrollo.config.ts`.
 *
 * ## Cómo se sabe que se prueba el almacén de verdad
 *
 * **Mirando a dónde va la subida.** La pantalla no dice en ningún sitio qué almacén hay detrás
 * —`almacenLocal` solo decide a qué dirección se sube— así que un caso que buscara un texto se
 * estaría inventando la señal. Lo primero que escribí hacía justo eso y falló, que es como se
 * descubrió.
 *
 * Lo que sí se observa desde el navegador es la petición: al disco va un `POST /api/media/local`.
 * Sin esa comprobación, los otros dos casos podrían pasar contra el camino de Vercel y la suite
 * diría que cubre algo que no toca.
 */

/** Un PNG de un píxel. Lo justo para que el sniff de magic bytes lo acepte. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const CORREO = 'almacen-local-e2e@ejemplo.com';
const FICHERO = 'almacen-local-e2e.png';
const DE_ESTE_FICHERO = `select url from media where filename like 'almacen-local-e2e%' limit 1`;

/**
 * La dirección guardada, ya como texto.
 *
 * `consultarValor` devuelve **JSON**, así que un `text` llega entrecomillado. El resto de la suite
 * no se entera porque compara con `toContain`, y las comillas caen fuera del trozo que busca. Aquí
 * la cadena se usa entera —se pide por HTTP— y sin decodificar produce un 404 con la dirección
 * `/%22/api/...%22`. Costó una sonda descubrirlo, así que queda escrito.
 */
function urlGuardada(): string {
  return JSON.parse(consultarValor(DE_ESTE_FICHERO)) as string;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  // Estado propio: una fila de una pasada anterior haría que el segundo caso leyera la de antes y
  // pasara sin haber subido nada.
  ejecutarSql(`delete from media where filename like 'almacen-local-e2e%'`);
});

test('T-170-1 y T-170-2: subir va al disco, y la fila queda anotada', async ({ page }) => {
  await crearYEntrar(page, { email: CORREO, role: 'admin' });
  await page.goto('/admin/media');

  // Todas las peticiones de escritura que salgan, sea a donde sea.
  const enviadas: string[] = [];
  page.on('request', (peticion) => {
    if (peticion.method() === 'POST') enviadas.push(new URL(peticion.url()).pathname);
  });

  await page.getByRole('button', { name: 'Subir una imagen' }).click();
  await page.setInputFiles('input[type="file"]', {
    name: FICHERO,
    mimeType: 'image/png',
    buffer: PNG_1PX,
  });

  // La fila la escribe el servidor al recibir el fichero, así que la biblioteca la enseña sin
  // recargar. Es el bucle entero: navegador → ruta → disco → base de datos → pantalla.
  await expect(page.getByAltText(new RegExp(FICHERO, 'i')).first()).toBeVisible({
    timeout: 30_000,
  });

  // **T-170-1**: fue al disco. Si esto fallara, lo de abajo estaría probando el otro camino.
  expect(enviadas, `peticiones que salieron: ${enviadas.join(', ') || '(ninguna)'}`).toContain(
    '/api/media/local'
  );

  // **T-170-2**: y la fila apunta al disco, no a Vercel.
  expect(urlGuardada()).toContain('/api/media/local/');
});

test('T-170-3: y esa dirección sirve la imagen de verdad', async ({ page }) => {
  await crearYEntrar(page, { email: CORREO, role: 'admin' });

  const url = urlGuardada();
  expect(url, 'no hay fila que servir: el caso anterior no dejó nada').not.toBe('');

  const respuesta = await page.request.get(url, { failOnStatusCode: false });

  expect(respuesta.status()).toBe(200);
  expect(respuesta.headers()['content-type']).toContain('image/png');
  // Los mismos bytes que se subieron. Un 200 con otra cosa dentro no prueba nada.
  expect(Buffer.from(await respuesta.body())).toEqual(PNG_1PX);
});
