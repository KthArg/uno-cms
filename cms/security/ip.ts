import 'server-only';

/**
 * La IP de quien hace la petición, para el límite de intentos y la auditoría (ADR-1302).
 *
 * ## Lo que había, y por qué era al revés
 *
 * Tres sitios cogían **la primera** entrada de `X-Forwarded-For`, con un comentario que decía
 * que las siguientes las podía escribir el cliente. Es justo al revés: cada proxy **añade** al
 * final la dirección de quien le habló, así que la primera es la que traía la petición al
 * salir del navegador, y esa la escribe quien quiera. Con una cabecera inventada distinta en
 * cada intento, el límite por IP de `/setup`, del acceso y de las invitaciones no limitaba nada.
 *
 * ## De dónde sale ahora
 *
 * - **En Vercel**, de `x-real-ip`: la escribe la plataforma con la dirección de la conexión y
 *   pisa lo que traiga el cliente. `VERCEL=1` lo pone también la plataforma, no nosotros.
 * - **Fuera**, de la **última** entrada de `X-Forwarded-For`, que es la que añadió el proxy que
 *   tenemos delante con la dirección real de quien le habló. Detrás de un nginx con
 *   `proxy_add_x_forwarded_for`, que es lo habitual, es la buena.
 * - **Sin ninguna de las dos**, `undefined`, y quien llama usa `desconocida`.
 *
 * Lo que **no** cubre, y está en `.env.example`: `next start` expuesto a internet sin nada
 * delante. Ahí no hay proxy que añada nada, todo lo que llega en la cabecera es del cliente y
 * Next no deja leer la dirección del socket. No hay forma fiable, y se dice en vez de fingirla.
 */
export function ipDelCliente(
  cabeceras: Pick<Headers, 'get'>,
  entorno: Readonly<Record<string, string | undefined>> = process.env
): string | undefined {
  if (entorno['VERCEL'] === '1') {
    const real = cabeceras.get('x-real-ip')?.trim();
    if (real !== undefined && real !== '') return real;
  }

  const entradas = (cabeceras.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada !== '');

  return entradas.at(-1);
}
