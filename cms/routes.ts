/**
 * Rutas del panel que se sirven sin sesión.
 *
 * ## Por qué está en `cms/` y no en `cms/auth/`
 *
 * Los árboles `cms/{core,db,auth,security}` no pueden llegar al cliente (SPEC §7.1), y el
 * middleware corre en el runtime **edge**, donde un módulo marcado `server-only` no se carga.
 * La exención `// isomorphic:` tampoco vale: está reservada a módulos que no emiten ni una
 * línea de JavaScript, y aquí hay una constante y una función.
 *
 * Así que vive fuera de la frontera, y eso no es esquivarla: lo que la frontera protege son
 * credenciales, consultas y sesiones. Esto es una lista de direcciones **que ya se pueden
 * deducir pidiéndolas**. No hay nada aquí que el navegador no sepa.
 */

/**
 * Las páginas de `/admin` que se sirven **sin sesión**, con su motivo (SPEC §7.1, issue #70).
 *
 * ## Por qué esta lista está aquí y no en el middleware
 *
 * Porque hay dos sitios que necesitan saberlo y **no pueden discrepar**:
 *
 * 1. El middleware, que decide a quién manda al acceso.
 * 2. El test estructural de #70, que exige que toda página del panel esté dentro del grupo
 *    `(panel)` —de donde cuelga el guard autoritativo— o declarada aquí.
 *
 * Si cada uno tuviera su copia, abrir una ruta en el middleware sin tocar el test dejaría una
 * página sin guard **y con el test en verde**. Que sea la misma constante convierte eso en
 * imposible en vez de en improbable.
 *
 * Que haya que escribir el motivo es parte del diseño: una lista de excepciones sin explicación
 * crece hasta que nadie recuerda cuáles siguen teniendo razón de ser.
 */
export const RUTAS_PUBLICAS_DEL_PANEL: readonly {
  readonly url: string;
  readonly motivo: string;
}[] = [
  {
    url: '/admin/login',
    motivo:
      'Es la página de acceso. Protegerla con el guard la haría redirigir a sí misma, en bucle.',
  },
  {
    url: '/admin/invitacion',
    motivo:
      'Es donde quien recibe una invitación elige su contraseña. Su cuenta existe pero tiene una contraseña aleatoria que no conoce nadie, así que exigirle sesión haría que la invitación no se pudiera canjear nunca. Lo que autoriza aquí no es una sesión: es el enlace firmado, de un solo uso y con 24 h de vida.',
  },
];

/** Si una ruta del panel se sirve sin sesión. */
export function esRutaPublicaDelPanel(path: string): boolean {
  return RUTAS_PUBLICAS_DEL_PANEL.some((ruta) => ruta.url === path);
}

/**
 * Prefijos que **nunca deben indexarse** (SPEC §7.2, §6.2).
 *
 * Los usan dos sitios que no pueden discrepar:
 *
 * 1. El middleware, que les pone `X-Robots-Tag: noindex`.
 * 2. El sitemap, que tiene que dejarlos fuera.
 *
 * Y la razón de compartirla es más fuerte que la de las rutas públicas del panel: `X-Robots-Tag`
 * le dice al buscador que no indexe **después de haber ido a mirar**. Un sitemap que anuncia
 * `/preview` invita a ir, y basta con que un enlace de vista previa siga vivo para que lo que se
 * sirva ahí sea contenido sin publicar de alguien.
 *
 * Con dos copias, añadir un prefijo al middleware y olvidarlo en el sitemap deja exactamente ese
 * agujero, y en verde.
 */
export const PREFIJOS_NO_INDEXABLES: readonly string[] = ['/admin', '/preview', '/api', '/setup'];

/** Si una ruta cae bajo alguno de esos prefijos. */
export function esNoIndexable(path: string): boolean {
  return PREFIJOS_NO_INDEXABLES.some(
    (prefijo) => path === prefijo || path.startsWith(`${prefijo}/`)
  );
}

/**
 * Las pantallas que se sirven **con todo el ancho de la ventana** (issue #190).
 *
 * El panel vive dentro de `max-w-6xl` —1152 px— y eso está bien para leer: una lista de
 * contenido a 1900 píxeles es peor, no mejor. La excepción es el editor de una entrada, porque
 * ahí media pantalla es una vista previa de una web de verdad y el techo la dejaba al tercio.
 *
 * Vive aquí, junto a las demás listas de rutas, por el mismo motivo que ellas: quien decide el
 * ancho es el armazón y quien conoce la ruta es el layout. Con la comprobación escrita en uno de
 * los dos, el otro no puede discrepar.
 */
export function esPantallaDeAnchoCompleto(path: string): boolean {
  // Solo el editor de una entrada, no el listado: `/admin/content` a secas es una lista.
  return path.startsWith('/admin/content/');
}
