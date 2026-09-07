import { expect, test } from '@playwright/test';
import { crearYEntrar } from './support/session';

/**
 * El movimiento, medido en un navegador (spec 15, issue #239).
 *
 * ## Por qué esto no puede ser un test de componentes
 *
 * Porque lo que hay que comprobar es el resultado de la **cascada**: qué duración acaba teniendo
 * un botón después de que el navegador resuelva la utilidad, la media query de
 * `prefers-reduced-motion` y el `!important`. En jsdom no hay cascada que resolver —
 * `getComputedStyle` devuelve lo que se le escribió, no lo que ganaría en pantalla— así que un
 * test de componentes aquí mediría la intención en vez del efecto.
 *
 * Y la guarda de `tests/unit/movimiento.test.ts` lee el CSS, que es útil y no es lo mismo: puede
 * confirmar que el bloque está escrito y no que llegue a aplicarse.
 */

/**
 * A partir de cuántos segundos se considera que algo se mueve.
 *
 * **Se compara el número, no la cadena, y eso salió de que el test fallara.** La primera versión
 * buscaba `'0.00001s'`, que es como se escribe 0,01 ms — y Chromium lo devuelve como `1e-05s`.
 * El caso reventó listando la página entera como culpable mientras el corte de movimiento
 * funcionaba perfectamente: el fallo estaba en el test.
 *
 * Un milisegundo separa las dos poblaciones sin ambigüedad: lo cortado son 0,01 ms y la animación
 * más corta del panel son 90.
 */
const UMBRAL_EN_SEGUNDOS = 0.001;

// Cada `page.evaluate` repite el umbral en vez de leer la constante porque su cuerpo corre en el
// navegador y no ve este ámbito; se le pasa como argumento.

test('T-237-2: con movimiento reducido no se mueve nada', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await crearYEntrar(page, { email: 'movimiento-reducido@ejemplo.com', role: 'admin' });

  await expect(page.getByRole('heading', { name: 'Contenido', level: 1 })).toBeVisible();

  /**
   * **Todos los elementos de la página, no una muestra.**
   *
   * Comprobar tres botones elegidos a mano diría que esos tres cumplen. Lo que se quiere saber es
   * que no queda **ninguno** moviéndose, y eso incluye los que añada quien venga después sin
   * leer esta spec — que es el caso para el que sirve el test.
   */
  const enMovimiento = await page.evaluate((umbral) => {
    const culpables: string[] = [];

    for (const elemento of document.querySelectorAll('*')) {
      const estilo = getComputedStyle(elemento);
      // `className` en un SVG es un objeto, no una cadena: sin `getAttribute` el mensaje de
      // fallo se llena de «[object SVGAnimatedString]» y no dice qué elemento es.
      const nombre = `${elemento.tagName.toLowerCase()}.${elemento.getAttribute('class') ?? ''}`;

      for (const duracion of [
        ...estilo.transitionDuration.split(', '),
        ...estilo.animationDuration.split(', '),
      ]) {
        if (Number.parseFloat(duracion) > umbral) culpables.push(`${nombre}: ${duracion}`);
      }
    }

    return culpables;
  }, UMBRAL_EN_SEGUNDOS);

  expect(
    enMovimiento,
    'siguen animándose con prefers-reduced-motion: reduce. El bloque que lo corta está en ' +
      'app/globals.css y el motivo en docs/specs/15-movimiento.md §4'
  ).toEqual([]);
});

test('T-237-2: sin la preferencia puesta, el panel sí se mueve', async ({ page }) => {
  /**
   * **El caso que impide que el anterior mienta.**
   *
   * Un panel con todo el movimiento borrado por error pasaría el test de arriba perfectamente:
   * «nada se mueve» es el resultado esperado allí. Sin esta pareja, cargarse las animaciones de
   * golpe dejaría la suite en verde, que es la forma más cara de tener una guarda.
   */
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await crearYEntrar(page, { email: 'movimiento-normal@ejemplo.com', role: 'admin' });

  await expect(page.getByRole('heading', { name: 'Contenido', level: 1 })).toBeVisible();

  const seMueven = await page.evaluate((umbral) => {
    let cuenta = 0;

    for (const elemento of document.querySelectorAll('*')) {
      const estilo = getComputedStyle(elemento);
      const duraciones = [
        ...estilo.transitionDuration.split(', '),
        ...estilo.animationDuration.split(', '),
      ];
      if (duraciones.some((duracion) => Number.parseFloat(duracion) > umbral)) cuenta += 1;
    }

    return cuenta;
  }, UMBRAL_EN_SEGUNDOS);

  // El rail tiene cinco entradas, la cabecera dos botones y el contenido sus tarjetas: por
  // debajo de diez el movimiento se habría perdido por el camino aunque el CSS siga escrito.
  expect(seMueven).toBeGreaterThanOrEqual(10);
});

test('T-237-3: el contenido se remonta al cambiar de sección', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await crearYEntrar(page, { email: 'movimiento-navega@ejemplo.com', role: 'admin' });

  const principal = page.getByRole('main');
  await expect(principal).toBeVisible();

  /**
   * Se marca el nodo, se navega, y se mira si la marca sigue ahí.
   *
   * ## Por qué así y no contando animaciones
   *
   * Porque contarlas fue la primera versión de este caso y **sobrevivió a la mutación**: quitando
   * la `key={ruta}` del armazón el test seguía verde. El motivo es que las utilidades de entrada
   * llevan `animation-fill-mode: both`, y una animación con relleno **no desaparece al terminar**
   * — `getAnimations()` seguía devolviendo la de la carga inicial, así que el caso medía que la
   * página había cargado alguna vez, no que se hubiera reanimado.
   *
   * La identidad del nodo no tiene ese problema: una marca puesta a mano sobrevive a cualquier
   * re-render de React y **solo** desaparece si el elemento se destruye y se crea otro, que es
   * exactamente lo que hace la `key` y exactamente lo que rearma la animación.
   */
  await principal.evaluate((elemento) => elemento.setAttribute('data-marca', 'antes'));

  await page.getByRole('link', { name: /Imágenes/ }).click();
  await expect(page.getByRole('heading', { name: 'Imágenes', level: 1 })).toBeVisible();

  await expect(
    page.getByRole('main'),
    'el <main> es el mismo nodo tras navegar, así que la animación de entrada no se rearma: ' +
      'revisa la `key` del <main> en cms/ui/PanelShell.tsx'
  ).not.toHaveAttribute('data-marca');

  // Y que además haya animación de entrada declarada, para que lo anterior signifique algo: un
  // remontaje sin animación pasaría igual el caso de arriba.
  await expect(page.getByRole('main')).toHaveClass(/entra/);
});
