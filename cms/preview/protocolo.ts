// isomorphic-por-ubicación: `cms/preview/` es el único árbol de `cms/` que llega al cliente
// (ADR-106), así que no lleva `server-only` como el resto.

/**
 * El protocolo entre el panel y el iframe de la vista previa (SPEC §6.1, pasos 3–5; §6.2).
 *
 * Está en su propio módulo, sin componentes, porque lo usan **los dos lados**: quien envía
 * (`PreviewFrame`, en el panel) y quien recibe (`PreviewProvider`, dentro del iframe). Tener el
 * contrato escrito una vez es lo que impide que uno mande `cms:update` y el otro escuche
 * `cms-update`, que es la clase de fallo que solo se ve ejecutándolo.
 */

/** El cambio que manda el panel en cada tecleo. */
export interface MensajeDeCambio {
  readonly type: 'cms:update';
  /** La entrada que se está editando. El iframe solo acepta la que autoriza su token. */
  readonly key: string;
  readonly data: unknown;
  /** Orden de emisión. Ver `esMasReciente`. */
  readonly seq: number;
}

/** Lo que manda el iframe de vuelta (SPEC §6.1 paso 5). */
export type MensajeDelIframe =
  { readonly type: 'cms:ready' } | { readonly type: 'cms:section-visible'; readonly key: string };

/**
 * Cada cuánto se manda como mucho, en milisegundos.
 *
 * El número es de `SPEC.md` §6.1 y se respeta tal cual. Cambiarlo sería una desviación con su
 * ADR, no un número distinto y sin comentario.
 */
export const THROTTLE_MS = 150;

/**
 * Si un mensaje llega en orden.
 *
 * `postMessage` no promete orden de entrega entre dos ventanas, y el throttle hace que se
 * manden ráfagas. Sin esta comprobación, dos mensajes que se cruzan dejan la vista previa
 * enseñando **lo que se escribió antes** — y quien mira ve su texto retroceder solo.
 *
 * Se compara con `>` y no con `>=`: repetir el mismo `seq` es reenviar, y aplicar dos veces el
 * mismo estado no aporta nada.
 */
export function esMasReciente(seq: number, ultimoAplicado: number): boolean {
  return Number.isFinite(seq) && seq > ultimoAplicado;
}

/**
 * Comprueba la **forma** de un mensaje entrante.
 *
 * ## Qué comprueba y qué no, dicho con precisión
 *
 * `SPEC.md` §6.1 paso 4 pide validar el payload "con el schema laxo". El esquema laxo se genera
 * desde `cms.config.ts`, y toda esa maquinaria —`config`, `schema-gen`, `richtext`— es
 * `server-only` por §7.1. Llevarla al navegador para validar aquí sería mover la frontera de
 * seguridad entera por una comprobación.
 *
 * Lo que se hace en su lugar:
 *
 * 1. **La forma del sobre** se comprueba aquí: tipo, clave, `seq` numérico y `data` que sea un
 *    objeto o una lista.
 * 2. **Qué clave se acepta** lo decide el proveedor, y solo acepta la que autoriza su token
 *    (ADR-501). Un mensaje para otra sección se ignora aunque venga bien formado.
 * 3. **Qué campos tienen sentido** lo comprueban los propios hooks y componentes, que ya
 *    toleran cualquier forma sin romperse (#112), y sobre todo `<RichText>`, que emite
 *    elementos de React y no puede inyectar markup venga lo que venga (ADR-107).
 *
 * Lo que se pierde respecto al esquema laxo completo es cazar **nuestros propios errores** —un
 * campo con el nombre mal escrito llegaría y se ignoraría en silencio—, no una vía de ataque:
 * el peor mensaje posible cambia lo que se ve en un iframe que solo mira quien lo abrió, no se
 * guarda en ningún sitio y no puede pintar markup.
 */
export function esMensajeDeCambio(valor: unknown): valor is MensajeDeCambio {
  if (typeof valor !== 'object' || valor === null) return false;

  const mensaje = valor as Partial<MensajeDeCambio>;

  if (mensaje.type !== 'cms:update') return false;
  if (typeof mensaje.key !== 'string' || mensaje.key === '') return false;
  if (typeof mensaje.seq !== 'number') return false;

  // `data` tiene que ser algo que un componente pueda consumir: un objeto para una sección o
  // una lista para una colección. Una cadena o un número entrarían al contexto y harían que
  // `useContent` devolviera vacío — lo mismo que ignorarlo, pero después.
  return typeof mensaje.data === 'object' && mensaje.data !== null;
}
