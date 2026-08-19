import { expect, test } from '@playwright/test';
import { ponerBorrador } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * El editor de una entrada, contra un servidor y un navegador de verdad.
 *
 * Aquí van los casos que los tests de componentes **no pueden** cubrir:
 *
 * - Que la Server Action llegue al servidor y vuelva. Un componente montado con Testing
 *   Library nunca cruza esa frontera, y ahí es donde se rompió el panel en #108.
 * - Que el cursor se quede donde el editor lo dejó. jsdom no maqueta, así que ProseMirror no
 *   puede situar el punto de inserción: allí todo lo tecleado entra al principio del
 *   documento, con y sin el código que se quería probar (#121).
 *
 * ## En serie, y no por comodidad
 *
 * Un CMS acoplado 1:1 a una landing es **un solo sitio**: no hay forma de darle a cada test su
 * propia sección `hero`. En paralelo, dos tests editando la misma sección son dos editores
 * peleándose por ella, y el segundo recibe un `VERSION_CONFLICT` — que es el comportamiento
 * correcto y no lo que estos casos quieren medir.
 *
 * Lo aprendí al primer intento: el test de guardado falló con el aviso de conflicto en
 * pantalla, y el aviso decía exactamente la verdad.
 */

test.describe.configure({ mode: 'serial' });

test('el editor carga, guarda solo y lo dice', async ({ page }) => {
  await crearYEntrar(page, { email: 'editor-e2e@ejemplo.com', role: 'admin' });

  await page.goto('/admin/content/hero');
  await expect(page.getByRole('heading', { name: 'Portada', level: 1 })).toBeVisible();

  await page.getByLabel(/Título principal/).fill('Bienvenidos a mi empresa');

  // El indicador es la única señal de que el trabajo está a salvo (SPEC §8).
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  // Y sobrevive a una recarga: es lo que demuestra que llegó a la base de datos y no se quedó
  // en el estado de React.
  await page.reload();
  await expect(page.getByLabel(/Título principal/)).toHaveValue('Bienvenidos a mi empresa');
});

test('publicar dice que se ha publicado', async ({ page }) => {
  await crearYEntrar(page, { email: 'editor-publica@ejemplo.com', role: 'admin' });

  await page.goto('/admin/content/hero');
  await page.getByLabel(/Título principal/).fill('Un título publicable');
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Publicar cambios' }).click();

  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });
});

test('publicar tras vaciar un campo obligatorio dice cuál y dónde', async ({ page }) => {
  // **El estado de partida lo pone el test.** La primera versión daba por hecho que
  // `about.heading` tendría algo, y en una base que ya había visto otra ejecución estaba
  // vacío: `fill('')` no cambiaba nada, no había guardado pendiente, y el test recorría un
  // camino distinto del que creía. Fallaba una de cada tres.
  ponerBorrador('about', { heading: 'Un encabezado que voy a borrar' });

  await crearYEntrar(page, { email: 'editor-valida@ejemplo.com', role: 'admin' });

  await page.goto('/admin/content/about');
  await page.getByLabel(/Encabezado/).fill('');

  // **Se espera a que el guardado asiente antes de pulsar**, y es lo que faltaba (#134). Este
  // era el único test del fichero que pulsaba nada más escribir, y fallaba una de cada once:
  // la captura del fallo enseña «Guardado ✓» y ninguna respuesta al publicar, o sea que el
  // clic cayó encima del guardado en vuelo.
  //
  // Que la aplicación aguante ese solape es otra cuestión, y tiene su propio caso —publicar
  // justo después de escribir, sin conflicto espurio, se arregló en #124—. Lo que este test
  // mide es el mensaje de campo obligatorio, y para medirlo tiene que llegar a pulsarlo.
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Publicar cambios' }).click();

  // SPEC §9: "Falta el Título principal en Portada". Nombre del campo y de la sección, nunca
  // la clave técnica.
  await expect(page.getByText(/Falta Encabezado en Sobre nosotros/)).toBeVisible({
    timeout: 10_000,
  });
});

test('publicar sin haber tocado nada también avisa', async ({ page }) => {
  // El otro camino, y merece su propio test: publicar cuando **no hay nada pendiente** es una
  // acción legítima —"no he cambiado nada, publica igual"— y recorre el código por otro sitio,
  // porque el guardado no llega a mandarse. Los dos estaban mezclados en un solo test cuyo
  // camino dependía de lo que hubiera dejado la ejecución anterior.
  ponerBorrador('about', { visible: true });

  await crearYEntrar(page, { email: 'editor-sin-tocar@ejemplo.com', role: 'admin' });

  await page.goto('/admin/content/about');
  await page.getByRole('button', { name: 'Publicar cambios' }).click();

  await expect(page.getByText(/Falta Encabezado en Sobre nosotros/)).toBeVisible({
    timeout: 10_000,
  });
});

test('#121: el cursor se queda donde el editor lo dejó', async ({ page }) => {
  // El caso que jsdom no puede comprobar. Con navegador de verdad sí hay maquetación, así que
  // ProseMirror sitúa el punto de inserción y se puede escribir en medio de un párrafo.
  //
  // El borrador se pone en blanco primero: este test **escribe**, así que en una base que ya
  // ha visto otra ejecución arrastraría el texto anterior y compararía contra un párrafo que
  // no puso él.
  ponerBorrador('about', { heading: 'Sobre nosotras' });

  await crearYEntrar(page, { email: 'editor-cursor@ejemplo.com', role: 'admin' });

  await page.goto('/admin/content/about');

  const cuerpo = page.locator('#campo-body');
  await cuerpo.click();
  await page.keyboard.type('hola mundo');

  // **Se espera al guardado antes de mover el cursor.** Lo que este test mide es dónde entra
  // el texto, no cómo convive con el autosave: con un guardado en vuelo, el editor recibe el
  // valor de vuelta mientras se teclea y el cursor se va al final por un motivo que no tiene
  // nada que ver con lo que se quiere comprobar. Salió al ejecutar la suite dos veces
  // seguidas, con los tiempos justo distintos.
  await expect(page.getByText('Guardado ✓')).toBeVisible({ timeout: 10_000 });

  // Se coloca el cursor detrás de «hola» y se escribe: el texto tiene que quedar ahí, no al
  // principio ni al final del documento.
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' cruel');

  await expect(cuerpo).toContainText('hola cruel mundo');
});

test('una clave que no existe da 404', async ({ page }) => {
  await crearYEntrar(page, { email: 'editor-404@ejemplo.com', role: 'admin' });

  const respuesta = await page.goto('/admin/content/inventada');

  expect(respuesta?.status()).toBe(404);
});
