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

/**
 * La única ruta del panel que admite una sesión **a medio entrar**: la contraseña es buena pero
 * la cuenta todavía no tiene segundo factor (spec 20 §3).
 *
 * Vive fuera del grupo `(panel)` a propósito y tiene su propio guard: el layout de `(panel)`
 * rechaza las sesiones `alta`, y meterla dentro obligaría a hacerle una excepción justo al guard
 * autoritativo. La comparten el middleware, que manda aquí cualquier otra ruta del panel, y el
 * test estructural de #70, que la acepta fuera del grupo solo por estar en esta lista.
 */
export const RUTA_DE_ALTA_DEL_SEGUNDO_FACTOR = '/admin/verificacion';

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

/** Caracteres de control C0 y DEL. */
function tieneControles(valor: string): boolean {
  for (const caracter of valor) {
    const codigo = caracter.codePointAt(0) ?? 0;
    if (codigo <= 0x1f || codigo === 0x7f) return true;
  }
  return false;
}

/**
 * A dónde se manda a alguien después de entrar, a partir del `?next=` de la página de acceso
 * (spec 19, T-S-1).
 *
 * ## Por qué una función y no la comprobación que había
 *
 * Había una, pero **solo en la rama del formulario**. La otra —quien llega con sesión—
 * redirigía a lo que trajera `?next=` sin mirar, y `redirect()` acepta URL absolutas: un enlace
 * de nuestro propio dominio llevaba a quien ya estaba dentro a una copia de esta página en otro,
 * que le pedía la contraseña «porque la sesión ha caducado». Dos ramas con dos comprobaciones
 * divergen; una función compartida no puede.
 *
 * ## Lo que protege es el prefijo, y nada más
 *
 * Solo se admite `/admin`, `/admin/…` o `/admin?…`: es lo único a lo que el guard manda aquí, y
 * una lista de lo permitido no tiene los agujeros de una de lo prohibido. Una ruta que empieza
 * por `/admin/` no puede cambiar de host —el host solo se lee al principio—, así que `//host`,
 * `/\host` y sus variantes quedan fuera por no empezar así, no por una comprobación aparte. La
 * hubo, y la mutación demostró que no protegía nada.
 *
 * Los caracteres de control se rechazan por otro motivo: un salto de línea en `Location` hace
 * que Node lance al escribir la cabecera, y eso sería un 500 en vez de una redirección.
 */
export function destinoInterno(next: unknown): string {
  const porDefecto = '/admin';
  if (typeof next !== 'string' || tieneControles(next)) return porDefecto;
  const delPanel =
    next === porDefecto || next.startsWith(`${porDefecto}/`) || next.startsWith(`${porDefecto}?`);
  return delPanel ? next : porDefecto;
}
