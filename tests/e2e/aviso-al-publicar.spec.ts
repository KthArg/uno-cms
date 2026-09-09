import { expect, test } from '@playwright/test';
import { consultarSql, ejecutarSql } from './support/db';
import { crearYEntrar } from './support/session';

/**
 * T-A-42: **el `after()` de Next se ejecuta de verdad** (issue #291).
 *
 * ## El hueco que cierra, y por qué era un hueco de verdad
 *
 * El aviso al publicar se manda con `after()`, que corre **después** de responderle al editor.
 * Ninguna de las otras suites lo ejecuta:
 *
 * | Suite | Por qué no |
 * | ----- | ---------- |
 * | `unit` | Sustituye `next/server`: `after` lanza fuera del contexto de una petición |
 * | `integration` | Igual |
 * | `e2e`, hasta ahora | Corría con la fase apagada, así que `avisar` salía antes de llegar |
 *
 * O sea que lo probado era **que se le pide la tarea correcta a `after`**, no que Next la
 * ejecute. Es la fragilidad 2 de la fase en `docs/PROGRESS.md`, y estaba escrita como tal.
 *
 * ## Cómo se comprueba sin salir de la máquina
 *
 * `playwright.config.ts` apunta `WEBHOOK_URL` **al propio servidor de la suite**, a `/api/health`,
 * que solo exporta `GET` y contesta 405 a un `POST`. Un `4xx` no se reintenta (ADR-1003), así que
 * el aviso cuesta un viaje local y queda registrado como `webhook.fallido`.
 *
 * **Esa fila es la prueba.** No la escribe nadie más: se escribe dentro del `after()`, después de
 * que `entregar` haya hecho la petición. Si `after` no se ejecutara, no existiría.
 *
 * ## Lo que este caso NO prueba, dicho para que nadie lo dé por hecho
 *
 * Que una entrega **buena** funcione contra un destino real. Aquí el destino somos nosotros
 * rechazándonos con un 405. Lo que queda demostrado es el camino: publicar → `after` → petición
 * saliente → auditoría. La entrega buena contra una web de verdad sigue siendo la fragilidad 6, y
 * necesita un despliegue (#279).
 */

test.describe.configure({ mode: 'serial' });

const CLAVE = 'faqs.aviso-e2e';

const RESPUESTA = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sí.' }] }],
};

test.beforeAll(() => {
  ejecutarSql('delete from content_entries where key = $1', [CLAVE]);
  // **La auditoría se limpia antes de mirar**, no después. Otros casos de la suite publican, y
  // sus avisos dejan filas: sin esto, este caso podría estar afirmando sobre la de otro y daría
  // verde aunque el `after()` de esta publicación no se ejecutara.
  ejecutarSql("delete from audit_log where action like 'webhook.%'");
  ejecutarSql(
    `insert into content_entries (key, type, draft, published, status)
     values ($1, 'faqs', $2::jsonb, null, 'changed')`,
    [CLAVE, JSON.stringify({ question: 'Una pregunta del aviso', answer: RESPUESTA })]
  );
});

test('T-A-42: publicar ejecuta el after() de verdad y deja su rastro', async ({ page }) => {
  await crearYEntrar(page, { email: 'aviso-e2e@ejemplo.com', role: 'admin' });

  await page.goto(`/admin/content/${CLAVE}`);
  // El nombre exacto del botón, como en `publicacion.spec.ts`. La primera versión de este caso
  // buscaba `/^publicar$/i` y se quedó esperando treinta segundos: el botón se llama «Publicar
  // cambios», y una expresión anclada al final no lo encuentra.
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText(/Publicado/)).toBeVisible({ timeout: 10_000 });

  // El `after()` corre **después** de la respuesta, así que hay que darle margen: no es un
  // `waitForTimeout` por si acaso, es que la fila no existe todavía cuando la página ya cambió.
  // Ese desfase es exactamente la propiedad que se está comprobando.
  await expect
    .poll(() => consultarSql("select action from audit_log where action like 'webhook.%'").length, {
      timeout: 15_000,
      message: 'el after() no dejó ninguna fila de aviso',
    })
    .toBeGreaterThan(0);

  const filas = consultarSql<{ action: string; meta: { estado?: number; evento?: string } }>(
    "select action, meta from audit_log where action like 'webhook.%'"
  );

  // Y no vale con que exista: tiene que contar **lo que pasó de verdad**. 405 es lo que devuelve
  // `/api/health` a un POST, así que esta fila demuestra que la petición salió y llegó.
  expect(filas[0]?.action).toBe('webhook.fallido');
  expect(filas[0]?.meta.evento).toBe('content.published');
  expect(filas[0]?.meta.estado).toBe(405);
});

test('T-A-42b: y el panel lo enseña, con la fase encendida', async ({ page }) => {
  await crearYEntrar(page, { email: 'aviso-panel-e2e@ejemplo.com', role: 'admin' });
  await page.goto('/admin');

  // El otro extremo de #286: no que el componente pinte lo que se le pasa —eso ya está en `ui`—
  // sino que el dato llegue desde `audit_log` hasta la pantalla, en la aplicación servida.
  await expect(page.getByText(/El aviso a tu web falló/)).toBeVisible();
});
