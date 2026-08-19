import { expect, test } from '@playwright/test';
import { crearYEntrar } from './support/session';

/**
 * T-D-4 y T-D-1: la ruta de subida, contra un servidor de verdad.
 *
 * Aquí se comprueba lo que el test de las reglas no puede: que la ruta **existe**, que exige
 * sesión antes de mirar nada, y que un cliente que miente sobre el tipo se lleva un rechazo del
 * servidor. Las reglas en sí están probadas aparte, sin red ni proveedor.
 *
 * No hay caso de subida con éxito: eso necesita un token real de Vercel Blob, que no existe en
 * CI. Lo que se puede probar es todo el camino de rechazo, que es el que importa para la fila
 * de "abuso de uploads" de §7.1.
 */

test('T-D-4: sin sesión no se emite ningún token', async ({ request }) => {
  const respuesta = await request.post('/api/media/upload', {
    data: { type: 'blob.generate-client-token', payload: { pathname: 'x.png' } },
  });

  // Un endpoint que reparte permisos de escritura en un almacén sin comprobar quién llama es
  // un almacén de cualquiera.
  expect(respuesta.status()).toBe(401);
});

test('T-D-1: con sesión, un tipo fuera de la lista se rechaza en el servidor', async ({ page }) => {
  await crearYEntrar(page, { email: 'media-e2e@ejemplo.com', role: 'admin' });

  // `page.request` y no el `request` suelto: el segundo es un contexto aparte y **no lleva la
  // cookie de sesión**, así que la ruta respondería 401 y el test daría por bueno un rechazo
  // que no es el que quiere probar. Lo aprendí viendo un 401 donde esperaba un 400.
  const respuesta = await page.request.post('/api/media/upload', {
    data: {
      type: 'blob.generate-client-token',
      payload: {
        pathname: 'malicioso.svg',
        callbackUrl: 'http://127.0.0.1/api/media/upload',
        clientPayload: JSON.stringify({
          contentType: 'image/svg+xml',
          sizeBytes: 1024,
          filename: 'malicioso.svg',
        }),
        multipart: false,
      },
    },
  });

  // El `accept` del formulario viaja en el cliente: quien quiera saltárselo llama aquí
  // directamente, y aquí es donde se decide.
  expect(respuesta.status()).toBe(400);
  expect(await respuesta.text()).toContain('no se puede subir');
});

test('T-D-3: un tamaño por encima del límite se rechaza en el servidor', async ({ page }) => {
  await crearYEntrar(page, { email: 'media-grande@ejemplo.com', role: 'admin' });

  const respuesta = await page.request.post('/api/media/upload', {
    data: {
      type: 'blob.generate-client-token',
      payload: {
        pathname: 'enorme.png',
        callbackUrl: 'http://127.0.0.1/api/media/upload',
        clientPayload: JSON.stringify({
          contentType: 'image/png',
          sizeBytes: 50 * 1024 * 1024,
          filename: 'enorme.png',
        }),
        multipart: false,
      },
    },
  });

  expect(respuesta.status()).toBe(400);
  expect(await respuesta.text()).toContain('pesa demasiado');
});

test('la biblioteca carga y explica qué hacer cuando está vacía', async ({ page }) => {
  await crearYEntrar(page, { email: 'media-biblioteca@ejemplo.com', role: 'admin' });

  await page.goto('/admin/media');

  await expect(page.getByRole('heading', { name: 'Imágenes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subir una imagen' })).toBeVisible();
});
