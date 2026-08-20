/**
 * Layout de la landing pública (SPEC §3).
 *
 * ## Aquí vivía el guard de `/setup`, y por qué ya no
 *
 * `SPEC.md` §7.3 pide que, sin usuarios en la base de datos, cualquier ruta lleve a `/setup`.
 * Hasta M5 eso era un `redirect` en este layout, y costaba caro: un layout `async` que consulta
 * la base de datos **vuelve dinámica la ruta entera**, y una ruta dinámica no se cachea con ISR
 * — que es justo lo que §8 exige para la landing.
 *
 * O sea que dos secciones de la spec pedían cosas incompatibles sobre la misma página. Está en
 * el issue #71, resuelto en **ADR-502**: la comprobación se mueve a la página, pasa por el
 * caché con el tag de los ajustes, y en vez de redirigir se enseña un aviso que lleva a
 * `/setup`. La landing vuelve a ser estática y §7.3 sigue cumpliéndose — se llega igual, sin
 * que el visitante pague un render por petición.
 *
 * Este layout se queda sin nada que hacer más que existir. Se conserva porque el grupo `(site)`
 * es el que separa la landing del panel en el árbol de §3, y borrarlo sería deshacer esa
 * separación por un fichero de tres líneas.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
