import { Schibsted_Grotesk } from 'next/font/google';

/**
 * La letra del panel (spec 11 §6, ADR-803).
 *
 * ## Por qué una sola familia
 *
 * La spec 10 pedía un serif para los titulares contra el sans del sistema. **Nunca llegó a
 * existir**: la ficha `--font-serif` apuntaba a una variable que no definía nadie y ningún
 * componente usaba `font-serif`, así que lo que se veía en pantalla era el `Georgia` del final
 * de la lista de reserva. Está contado en ADR-803.
 *
 * Y no se recupera. El serif editorial era coherente con «papel y tinta»; el vidrio pide letra
 * de interfaz —asta uniforme, altura de equis generosa, legible a doce píxeles sobre un fondo
 * translúcido—. La jerarquía la lleva el **peso**, que es una variable y no una segunda descarga.
 *
 * ## Por qué se autoaloja, y no es una preferencia
 *
 * `next/font/google` descarga los ficheros **en la construcción** y los sirve desde nuestro
 * dominio. Una hoja de estilos de un CDN no cargaría siquiera: la CSP de este proyecto no
 * declara `font-src`, así que hereda `default-src 'self'`. Autoalojar es además una petición
 * menos a un tercero desde el panel de alguien.
 *
 * ## Dónde se aplica, y por qué no en el `<html>`
 *
 * En el contenedor del panel, con `className`. En la raíz teñiría también la landing pública,
 * que **está fuera de alcance** y tiene su propio presupuesto de 60 KB: cambiarle la letra desde
 * aquí sería colar un cambio de la landing dentro de una pieza que dice no tocarla.
 *
 * Por lo mismo no se toca la ficha `--font-sans` de Tailwind: `font-sans` se aplica desde la
 * raíz por el preflight, así que redefinirla llegaría a la landing por la puerta de atrás.
 */
export const fuenteDelPanel = Schibsted_Grotesk({
  subsets: ['latin'],
  // Los cuatro pesos que usa el panel y ni uno más: cada uno es un fichero que se descarga.
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  // La reserva se ajusta métricamente para que el cambio de fuente no mueva la maqueta.
  adjustFontFallback: true,
});
