/**
 * Modo claro y oscuro del panel (spec 10 §4, issue #219).
 *
 * ## Por qué una cookie y no `localStorage`
 *
 * Con `localStorage` el servidor no sabe qué modo toca: manda el HTML en claro y un script lo
 * corrige después de pintar. Eso es el parpadeo blanco que da cualquier panel oscuro al abrirse,
 * y evitarlo obliga a un script **en línea antes de pintar** — que aquí significa abrir un
 * hueco en una CSP estricta con nonce por petición.
 *
 * Con cookie el servidor ya lo sabe cuando compone el HTML: cero parpadeo y **cero JavaScript**.
 * Lo que cuesta es que cambiar de modo da una vuelta al servidor, como «Salir». Se cambia una
 * vez; el parpadeo se vería en cada apertura.
 *
 * ## Y por qué el atributo va en el panel y no en el `<html>`
 *
 * Porque `color-scheme` lo hereda todo lo que hay debajo, y el `<html>` es compartido con la
 * landing pública, que **no** entra en esta fase y sigue con sus colores claros. Un
 * `color-scheme: dark` allí le pondría barras de desplazamiento y controles oscuros a una
 * página clara.
 *
 * Lo que se pierde diciéndolo claro: la barra de desplazamiento de la ventana la pinta el
 * navegador desde la raíz, así que en el panel oscuro puede quedarse clara. Es cosmético y no
 * justifica teñir la landing.
 */

/** El nombre de la cookie. Sin prefijo `__Host-`: tiene que poder leerse en desarrollo por http. */
export const COOKIE_DE_TEMA = 'unocms_tema';

export type Tema = 'claro' | 'oscuro';

/**
 * Qué modo pide una cookie, si es que pide alguno.
 *
 * `null` no es un fallo: es **«no hay preferencia guardada»**, y significa que manda el sistema
 * operativo por `prefers-color-scheme`. Por eso no se devuelve `'claro'` por defecto — eso
 * ignoraría el ajuste del sistema de quien nunca ha tocado el interruptor, que es casi todo el
 * mundo.
 */
export function leerTema(valor: string | undefined): Tema | null {
  return valor === 'claro' || valor === 'oscuro' ? valor : null;
}

/** El modo contrario, para el interruptor. Sin preferencia se asume claro, que es el de partida. */
export function elContrario(tema: Tema | null): Tema {
  return tema === 'oscuro' ? 'claro' : 'oscuro';
}

/** Un año: es una preferencia, no una sesión. Se guarda para no volver a preguntarla. */
export const DURACION_DE_LA_COOKIE = 60 * 60 * 24 * 365;
