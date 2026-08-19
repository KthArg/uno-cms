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
