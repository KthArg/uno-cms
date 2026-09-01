import { expect, test, type Page } from '@playwright/test';
import { dejarSinPublicar } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * T-213-1, T-213-2, T-213-3 y T-213-5: **el panel se puede usar desde un móvil** (spec 10 §5,
 * issue #220).
 *
 * ## Por qué esto tiene que ser e2e y no un test de componentes
 *
 * Porque lo que se comprueba son **medidas**, y jsdom no maqueta: no aplica la hoja de estilos,
 * no resuelve `@media` y todas las cajas miden cero. Un test de componentes puede decir que la
 * barra de secciones existe; no puede decir que el contenido dispone del 92 % del ancho ni que
 * la página no desborda.
 *
 * Y era exactamente lo que fallaba. Medido antes de este cambio, en un móvil de 390 px:
 *
 * | Medido                        | Antes            | Ahora |
 * | ----------------------------- | ---------------- | ----- |
 * | Ancho útil del contenido      | 102 px (**26 %**) | 358 px (92 %) |
 * | Ancho real de la página       | 524 px (desborda) | 390 px |
 * | Zonas pulsables bajo 44 px    | 3 en el editor    | 0 |
 *
 * No es que se viera apretado: no se podía usar. Por eso #220 es funcionalidad y no acabado.
 */

/**
 * **Una entrada propia**, no `hero`.
 *
 * Un CMS acoplado 1:1 a una landing es un solo sitio: `hero` lo comparten media docena de
 * ficheros de e2e, y este mide *el editor* —cualquier sección sirve— así que no hay motivo para
 * meterse en la que se pelean los demás. Es la regla que este repositorio ya aprendió tres veces
 * (#105, #134): crear el estado que se necesita, y cuando no se puede aislar, crear uno propio.
 *
 * No es teórico aquí: al añadir estos casos, la suite local en paralelo empezó a fallar en
 * `historial.spec.ts`. Con un worker —como CI— pasa entera, así que es una carrera, no un fallo
 * funcional; y lo que un test nuevo debe hacer ante eso es **no ampliar la superficie**.
 */
const MIA = 'faqs.movil-e2e';

test.beforeAll(() => {
  dejarSinPublicar(
    MIA,
    {
      question: 'Cabe en un móvil',
      answer: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sí.' }] }],
      },
    },
    'faqs'
  );
});

/** Un teléfono corriente, y el más estrecho que se sigue vendiendo. */
const MOVIL = { width: 390, height: 844 };
const ESTRECHO = { width: 320, height: 568 };

/** Las pantallas del panel que hay que poder usar. Todas, que es el punto. */
const PANTALLAS = [
  ['el contenido', '/admin'],
  ['el editor', `/admin/content/${MIA}`],
  ['las imágenes', '/admin/media'],
  ['las personas', '/admin/users'],
  ['los ajustes', '/admin/settings'],
] as const;

/** Lo que mide el navegador de la página tal y como está pintada. */
async function medir(page: Page) {
  return page.evaluate(() => {
    const ventana = document.documentElement.clientWidth;
    const principal = document.querySelector('main');

    return {
      ventana,
      anchoReal: document.documentElement.scrollWidth,
      util: principal === null ? 0 : Math.round(principal.getBoundingClientRect().width),
    };
  });
}

test.describe('en un móvil', () => {
  test.use({ viewport: MOVIL });

  test('T-213-1 y T-213-2: ninguna pantalla desborda, y el contenido tiene el ancho', async ({
    page,
  }) => {
    await crearYEntrar(page, { email: 'movil-medidas@ejemplo.com', role: 'admin' });

    for (const [nombre, ruta] of PANTALLAS) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');

      const { ventana, anchoReal, util } = await medir(page);

      // **Desbordar es lo que hace que una página se pueda arrastrar de lado**, y con ella se
      // van la mitad de los controles fuera de la vista. Un píxel de margen por el redondeo del
      // navegador; más que eso es una maqueta que no cabe.
      expect(
        anchoReal,
        `${nombre} desborda: la página mide ${String(anchoReal)}px`
      ).toBeLessThanOrEqual(ventana + 1);

      // El 85 % de la spec 10 §5. Antes de esto era el 26 %: el menú lateral se llevaba 192 px
      // fijos de los 390 que hay.
      expect(
        util / ventana,
        `${nombre} deja el contenido en ${String(util)}px de ${String(ventana)}`
      ).toBeGreaterThanOrEqual(0.85);
    }
  });

  test('T-213-3: ninguna zona pulsable baja de 44 px', async ({ page }) => {
    await crearYEntrar(page, { email: 'movil-pulsables@ejemplo.com', role: 'admin' });

    for (const [nombre, ruta] of PANTALLAS) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');

      const pequenos = await page.evaluate(() =>
        [...document.querySelectorAll('a, button, input, select, textarea')]
          .filter((elemento) => {
            const caja = elemento.getBoundingClientRect();
            // Lo que no se ve no se pulsa. Sin este filtro, cualquier control escondido
            // —la otra mitad del editor, un diálogo cerrado— saldría con altura cero y
            // pondría el test rojo sin que haya nada mal.
            return caja.width > 0 && caja.height > 0;
          })
          .filter((elemento) => elemento.getBoundingClientRect().height < 44)
          .map((elemento) => {
            const caja = elemento.getBoundingClientRect();
            return `${elemento.tagName.toLowerCase()} de ${String(Math.round(caja.height))}px «${(
              elemento.textContent ?? ''
            )
              .trim()
              .slice(0, 30)}»`;
          })
      );

      expect(pequenos, `en ${nombre}`).toEqual([]);
    }
  });

  test('T-213-4: se llega a las cuatro secciones, y la navegación está abajo', async ({ page }) => {
    await crearYEntrar(page, { email: 'movil-secciones@ejemplo.com', role: 'admin' });

    const secciones = page.getByRole('navigation', { name: 'Secciones del panel' });

    // Visible **de verdad**, no solo presente: lo que este caso protege es que exista alguna
    // forma de cambiar de sección.
    await expect(secciones).toBeVisible();

    for (const nombre of ['Contenido', 'Imágenes', 'Personas', 'Ajustes']) {
      await expect(secciones.getByRole('link', { name: nombre })).toBeVisible();
    }

    await secciones.getByRole('link', { name: 'Imágenes' }).click();
    await expect(page).toHaveURL(/\/admin\/media/);

    /**
     * **Y está donde dice la spec: abajo y a lo ancho.**
     *
     * Esta parte se añadió después, porque el caso **sobrevivió a una mutación**. Con la
     * navegación devuelta a columna lateral en todos los anchos, todo lo de arriba seguía en
     * verde: los enlaces existen, se ven y llevan a su sitio aunque el menú se coma dos tercios
     * de la pantalla. O sea que el caso decía «sin menú lateral» y pasaba con menú lateral.
     *
     * Lo que sí distingue una cosa de la otra es dónde está la caja. Y no es un detalle de
     * colocación: la spec 10 §5 lo pide abajo porque **es donde llega el pulgar** sin cambiar de
     * agarre.
     */
    const caja = await secciones.boundingBox();
    const ventana = page.viewportSize();

    expect(caja, 'la navegación no tiene caja').not.toBeNull();
    expect(ventana, 'el test no sabe de qué tamaño es la ventana').not.toBeNull();

    // Pegada al borde de abajo, con margen para el área segura de los gestos.
    expect(caja!.y + caja!.height).toBeGreaterThanOrEqual(ventana!.height - 4);

    // Y a lo ancho: una columna lateral ocupa una fracción, no el 90 %.
    expect(caja!.width / ventana!.width).toBeGreaterThanOrEqual(0.9);
  });

  test('T-213-5: el editor apila, y ofrece las dos mitades', async ({ page }) => {
    await crearYEntrar(page, { email: 'movil-editor@ejemplo.com', role: 'admin' });
    await page.goto(`/admin/content/${MIA}`);

    // El divisor arrastrable **no se ofrece donde no cabe**: repartir a mano el ancho de una
    // pantalla que solo enseña una mitad no significa nada.
    await expect(page.getByRole('separator', { name: /Repartir el espacio/ })).not.toBeVisible();

    // Y la vista previa no desaparece sin más: se llega por la otra pestaña. Antes de #220
    // estaba escondida con `hidden lg:block` y **sin nada que la sustituyera**, así que en un
    // teléfono el editor perdía la mitad de lo que hace, en silencio.
    const escribir = page.getByRole('button', { name: 'Escribir' });
    const vista = page.getByRole('button', { name: 'Vista previa' });

    // `aria-pressed` y no `aria-selected`: son dos botones que dejan pulsado el elegido, no un
    // `tablist` — que exigiría `aria-controls` y `role="tabpanel"` en cada mitad, y describiría
    // una navegación que a partir de `lg`, con las dos mitades a la vista, no existe.
    await expect(escribir).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/Pregunta/)).toBeVisible();

    await vista.click();
    await expect(vista).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel(/Pregunta/)).not.toBeVisible();
  });
});

test.describe('en la pantalla más estrecha que se vende', () => {
  test.use({ viewport: ESTRECHO });

  test('T-213-1: a 320 px tampoco desborda', async ({ page }) => {
    // 320 px es el suelo de la spec 10 §5. Va aparte del bloque de 390 porque es donde revienta
    // lo que a 390 aguanta por poco — una fila de cuatro secciones, un botón con su icono — y
    // que aparezca con su propio nombre dice de un vistazo cuál de los dos anchos falló.
    await crearYEntrar(page, { email: 'movil-estrecho@ejemplo.com', role: 'admin' });

    for (const [nombre, ruta] of PANTALLAS) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');

      const { ventana, anchoReal } = await medir(page);

      expect(anchoReal, `${nombre} a 320px mide ${String(anchoReal)}px`).toBeLessThanOrEqual(
        ventana + 1
      );
    }
  });
});
