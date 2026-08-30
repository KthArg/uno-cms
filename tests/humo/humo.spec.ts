import { expect, test } from '@playwright/test';
import { leerDestino } from './entorno';

/**
 * T-207-4 … T-207-8: **el despliegue de verdad, visto desde fuera** (spec 09, issue #207).
 *
 * ## Por qué esta suite existe
 *
 * Porque el camino que se despliega no lo ejercita ninguna otra. En local las imágenes van al
 * disco (ADR-700) y la base es Postgres a secas; Vercel Blob, Neon y los avisos de terceros no
 * corren en ninguna de las tres suites. **Cinco fallos de producción salieron de ahí en una
 * sola sesión**, cada uno tapando al siguiente.
 *
 * ## La regla que la gobierna
 *
 * **No toca nada que no haya creado ella.** No publica, no guarda borradores, no edita
 * contenido existente. Lo único que crea es una imagen, y la borra al terminar — y si no puede
 * borrarla, falla diciéndolo en vez de dejar basura.
 *
 * Un sitio en línea puede tener contenido real de alguien. Una suite de humo que rompa algo una
 * vez es una suite que nadie vuelve a ejecutar. Hay una guarda estructural sobre este mismo
 * fichero en `tests/unit/suite-de-humo.test.ts`, porque una regla que solo vive en un comentario
 * dura hasta el siguiente que tenga prisa.
 */

const lectura = leerDestino();

// `test.skip` con el motivo delante, en vez de un fichero vacío: un salto silencioso se lee
// como un verde, que es justo lo que esta suite existe para no hacer.
//
// Y el `console.warn` además del motivo del `skip`, porque **el reporter `list` no enseña la
// anotación**: sin esto sale «4 skipped» a secas, que es exactamente el salto silencioso que se
// quería evitar. Se vio ejecutándola, no leyéndola.
if (!lectura.hay) console.warn(`\n[humo] ${lectura.motivo}\n`);
test.skip(!lectura.hay, lectura.hay ? '' : lectura.motivo);

const destino = lectura.hay ? lectura.destino : { url: '', email: '', password: '' };

test.beforeAll(() => {
  if (lectura.hay) {
    for (const aviso of lectura.avisos) console.warn(`[humo] ${aviso}`);
    console.warn(`[humo] contra ${destino.url}`);
  }
});

/**
 * Un PNG de 1×1 hecho aquí, no un fichero del repositorio.
 *
 * Lo que sube tiene que ser lo más pequeño que sea una imagen de verdad: esto viaja a un
 * almacén que se paga por bytes y por peticiones, y la suite puede ejecutarse muchas veces.
 */
const PNG_MINIMO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** El nombre con el que sube: lleva marca para que sea evidente de dónde salió si algo se queda. */
const FICHERO = { name: 'humo-no-borrar-si-esto-aparece.png', mimeType: 'image/png' } as const;

async function entrar(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`${destino.url}/admin/login`);
  await page.getByLabel('Correo').fill(destino.email);
  await page.getByLabel('Contraseña').fill(destino.password);
  await page.getByRole('button', { name: /entrar/i }).click();

  // El mensaje del formulario, no un `waitForURL` a secas: si las credenciales están mal, el
  // rojo tiene que decir «no entró», no «tardó 30 segundos» (spec 09 §4.4).
  const fallo = page.getByText(/no.*correcto|no.*coincide|inténtalo/i);
  await expect
    .poll(
      async () => {
        if (await fallo.isVisible().catch(() => false)) return 'rechazado';

        return new URL(page.url()).pathname.startsWith('/admin/login') ? 'esperando' : 'dentro';
      },
      { message: `no se pudo entrar en ${destino.url} con ${destino.email}`, timeout: 30_000 }
    )
    .toBe('dentro');
}

/**
 * Sube una imagen desde la biblioteca, y no vuelve hasta que ha subido o ha fallado.
 *
 * Quien cuenta imágenes es el caso, no esto: contar aquí obligaría a decidir en dos sitios qué
 * es «una de las nuestras», y el día que se separaran ganaría el equivocado.
 */
async function subirUna(page: import('@playwright/test').Page): Promise<void> {
  const selector = page.getByRole('dialog', { name: 'Elegir una imagen' });

  await page.getByRole('button', { name: 'Subir una imagen' }).click();
  await selector
    .getByLabel('Subir una imagen nueva')
    .setInputFiles({ ...FICHERO, buffer: PNG_MINIMO });

  // **El selector se cierra solo cuando la subida sale bien**, y se queda abierto con un
  // mensaje si no. Así que lo que se espera es que desaparezca, y si no desaparece el rojo
  // lleva dentro lo que el panel estaba enseñando — que es un texto nuestro y en español
  // (#164), o sea legible por quien lea el fallo (spec 09 §4.4).
  await expect
    .poll(
      async () => {
        if (!(await selector.isVisible().catch(() => false))) return 'subida';

        const texto = (await selector.innerText().catch(() => '')).replace(/\s+/g, ' ');
        const queja =
          /(No se ha podido|no se puede subir|pesa demasiado|no se ha podido añadir)[^.]*\./.exec(
            texto
          );

        return queja === null ? 'subiendo' : `el panel dijo: ${queja[0]}`;
      },
      { message: `no se pudo subir una imagen en ${destino.url}`, timeout: 60_000 }
    )
    .toBe('subida');
}

/** Cuántas copias de nuestra imagen hay ahora mismo en la biblioteca. */
async function cuantasNuestras(page: import('@playwright/test').Page): Promise<number> {
  return await page.getByTitle(FICHERO.name, { exact: true }).count();
}

test('T-207-4: el despliegue responde y su base de datos tiene el esquema', async ({ request }) => {
  const respuesta = await request.get(`${destino.url}/api/health`);

  expect(respuesta.status(), `GET ${destino.url}/api/health`).toBe(200);

  const cuerpo = (await respuesta.json()) as { ok?: boolean; dbLatencyMs?: number };

  // **Esto ya ejercita el driver de Neon contra el esquema real** (#43): la ruta no comprueba
  // que la conexión abra, sino que `settings` exista.
  expect(cuerpo.ok, `respondió ${JSON.stringify(cuerpo)}`).toBe(true);
  expect(typeof cuerpo.dbLatencyMs).toBe('number');
});

test('T-207-5: se entra con una cuenta de verdad', async ({ page }) => {
  await entrar(page);

  // Ejercita Auth.js con `trustHost`, la cookie sobre https y el claim `pwdV` contra la base
  // (ADR-301) — tres cosas que en local van por otro camino.
  await expect(page.getByRole('navigation')).toBeVisible();
});

test('T-207-6 y T-207-8: sube una imagen, sigue ahí al recargar, y se borra', async ({ page }) => {
  await entrar(page);
  await page.goto(`${destino.url}/admin/media`);

  const antes = await cuantasNuestras(page);

  await subirUna(page);

  // **Recargando, que es lo que decide.** El estado local del selector la enseña aunque no se
  // haya escrito ninguna fila: es exactamente el fallo de #205, donde el refresco salía un
  // segundo antes que la escritura y la biblioteca se pintaba sin ella.
  await page.reload();
  await expect
    .poll(() => cuantasNuestras(page), {
      message: 'la imagen subida no aparece en la biblioteca tras recargar (#205)',
      timeout: 30_000,
    })
    .toBe(antes + 1);

  // T-207-8. Va aquí y no en un `afterAll` a propósito: si el borrado falla, tiene que salir
  // como un rojo de este caso. Un `afterAll` que se queja se lee como ruido.
  await borrarLasNuestras(page, antes);
});

test('T-207-7: el mismo fichero dos veces no choca', async ({ page }) => {
  // **Así se encontró #199.** Con el nombre del fichero de quien sube, la segunda rebotaba con
  // «This blob already exists». Con un UUID no puede pasar, y esto es lo único que lo mira
  // desde fuera.
  await entrar(page);
  await page.goto(`${destino.url}/admin/media`);

  const antes = await cuantasNuestras(page);

  await subirUna(page);
  await subirUna(page);

  await page.reload();
  await expect
    .poll(() => cuantasNuestras(page), {
      message: 'subir el mismo fichero dos veces no dejó dos imágenes (#199)',
      timeout: 30_000,
    })
    .toBe(antes + 2);

  await borrarLasNuestras(page, antes);
});

/**
 * Borra las imágenes que ha dejado esta suite, hasta volver a la cuenta de partida.
 *
 * **Si no puede, falla.** Dejar basura en silencio en un almacén ajeno es lo que convierte una
 * suite de humo en un problema; y hay tres objetos huérfanos ahí de depurar todo esto
 * ([#206](https://github.com/KthArg/uno-cms/issues/206)), que es la prueba de que pasa.
 */
async function borrarLasNuestras(
  page: import('@playwright/test').Page,
  hasta: number
): Promise<void> {
  for (let intento = await cuantasNuestras(page); intento > hasta; intento--) {
    const tarjeta = page.getByTitle(FICHERO.name, { exact: true }).first().locator('..');

    await tarjeta.getByRole('button', { name: 'Eliminar' }).click();
    await page.getByRole('button', { name: 'Sí, eliminar' }).click();
    await expect.poll(() => cuantasNuestras(page), { timeout: 20_000 }).toBe(intento - 1);
  }

  await page.reload();
  await expect
    .poll(() => cuantasNuestras(page), {
      message:
        `quedaron imágenes «${FICHERO.name}» sin borrar en ${destino.url}. ` +
        'Hay que quitarlas a mano: la suite no puede dejar basura en un almacén de verdad',
      timeout: 30_000,
    })
    .toBe(hasta);
}
