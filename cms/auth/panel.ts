import 'server-only';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { auth } from './index';

/**
 * Guards de rol a nivel de página del panel (SPEC §7.1: "chequeo de rol").
 *
 * El layout de `(panel)` comprueba que **haya sesión**, que es lo que separa a quien ha entrado
 * de quien no. Lo que no puede comprobar es el rol, porque no todas las pantallas del panel
 * piden lo mismo. Eso se decide en cada página, y esta función es la forma de hacerlo.
 *
 * ## Por qué `notFound()` y no un 403
 *
 * Un 403 confirma que la ruta existe y que hay algo detrás que no te dejan ver. A un `editor`
 * eso no le sirve de nada y a quien esté tanteando sí: le dice dónde seguir. El 404 es la misma
 * respuesta que daría una ruta inventada.
 *
 * **Ocultar el enlace en el menú no es esto.** El menú es comodidad; esto es la puerta. Hay un
 * test que recorre las rutas del panel para que ninguna pantalla de administración se quede
 * solo con lo primero (#70, T-E-4).
 */
export async function soloAdmin(): Promise<{ userId: string; email: string; nombre: string }> {
  const session = await auth();

  // Sin sesión también es 404 y no una redirección al acceso: llegar aquí sin sesión solo pasa
  // si el layout ha dejado de hacer su trabajo, y en ese caso lo prudente es cerrar, no
  // adivinar a dónde llevar a nadie.
  if (session === null || session.user.role !== 'admin') notFound();

  return {
    userId: session.user.id,
    email: session.user.email,
    nombre: session.user.name || session.user.email,
  };
}

/**
 * La dirección pública del sitio, para construir enlaces que se comparten fuera.
 *
 * `AUTH_URL` manda cuando está definida, y la cabecera `Host` es el último recurso. El orden no
 * es capricho: un proxy mal configurado delante puede inyectar `Host`, y un enlace de
 * invitación construido con ese valor llevaría a quien lo abra **a otro dominio, con un token
 * válido en la URL**. Es el mismo motivo por el que `.env.example` insiste en definir
 * `AUTH_URL` fuera de Vercel, escrito aquí porque aquí es donde muerde.
 */
export async function direccionDelSitio(): Promise<string> {
  const configurada = process.env['AUTH_URL'];
  if (configurada !== undefined && configurada !== '') return configurada.replace(/\/+$/, '');

  const cabeceras = await headers();
  const host = cabeceras.get('host') ?? 'localhost:3000';

  // Next rellena `x-forwarded-proto` él mismo, así que en la práctica siempre está — lo
  // comprobé con una sonda antes de escribir esto, porque un `https` de más habría dado
  // enlaces que no abren en un servidor de pruebas por HTTP. El valor por defecto es el
  // seguro: si algún día falta, un enlace `https` que no cargue se nota; uno `http` que sí
  // cargue mandaría la credencial en claro sin que nadie lo notara.
  const protocolo = cabeceras.get('x-forwarded-proto') ?? 'https';

  return `${protocolo}://${host}`;
}
