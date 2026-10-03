import 'server-only';
import appConfig from '@/cms.config';
import type { Idioma } from './config';

/**
 * Los idiomas del contenido y su traducción a la columna `locale` (spec 17, ADR-1100).
 *
 * ## Por qué el idioma por defecto se guarda como `''`
 *
 * Porque así las filas que existían antes de esta fase **ya son** del idioma por defecto, sin
 * una migración que tenga que adivinar cuál es —la migración es SQL y no lee `cms.config.ts`—, y
 * porque cambiar el código del idioma principal en `cms.config.ts` no deja el contenido apuntando
 * a un idioma que ya no lo es. ADR-1100 cuenta lo que se paga a cambio.
 *
 * La consecuencia es que `''` **no puede escribirse en ningún otro sitio**: si una consulta lo
 * pone a mano y otra usa `columnaDeIdioma`, el día que esto cambie una de las dos mentirá. Toda
 * traducción entre código y columna pasa por las dos funciones de abajo.
 */

/**
 * Lo que guarda la columna `locale` para el idioma por defecto. Es la única aparición de `''`
 * con ese significado en todo el código; el valor por defecto de la columna en
 * `cms/db/schema.ts` es la otra, y la migración la fija en SQL.
 */
export const COLUMNA_DEL_IDIOMA_POR_DEFECTO = '';

/** La lista completa, en el orden de `cms.config.ts`. */
export function idiomas(): readonly Idioma[] {
  return appConfig.idiomas;
}

/** El primero de la lista (spec 17 §5.1). */
export function idiomaPorDefecto(): Idioma {
  return appConfig.idiomas[0];
}

/** Si el sitio tiene más de un idioma. Con uno solo, el panel y la landing no cambian (§6). */
export function hayVariosIdiomas(): boolean {
  return appConfig.idiomas.length > 1;
}

/** El idioma con ese código, o `null` si `cms.config.ts` no lo declara. */
export function idiomaDeCodigo(codigo: string): Idioma | null {
  return appConfig.idiomas.find((idioma) => idioma.codigo === codigo) ?? null;
}

/**
 * El valor de la columna `locale` para un código, o `null` si el código no está declarado.
 *
 * `null` y no una excepción porque quien llama casi siempre tiene un dato del cliente —una
 * action, un parámetro de la API— y lo que toca es responder que no existe, no tumbar la
 * petición.
 */
export function columnaDeIdioma(codigo: string): string | null {
  if (codigo === idiomaPorDefecto().codigo) return COLUMNA_DEL_IDIOMA_POR_DEFECTO;
  return idiomaDeCodigo(codigo) === null ? null : codigo;
}

/**
 * Lo mismo, para cuando el código es opcional: sin él, el idioma por defecto.
 *
 * Es la forma de todas las actions (spec 17 §5.3): una llamada de antes de esta fase no trae
 * idioma y tiene que seguir escribiendo donde escribía.
 */
export function columnaDeIdiomaOpcional(codigo: string | undefined): string | null {
  return codigo === undefined ? COLUMNA_DEL_IDIOMA_POR_DEFECTO : columnaDeIdioma(codigo);
}

/** La vuelta: el código del idioma que guarda una columna. */
export function codigoDeColumna(columna: string): string {
  return columna === COLUMNA_DEL_IDIOMA_POR_DEFECTO ? idiomaPorDefecto().codigo : columna;
}

/**
 * La columna de un código que **tiene** que estar declarado, o una excepción.
 *
 * Es para la lectura de la landing (spec 17 §5.4): ahí un código desconocido no lo trae un
 * visitante —la ruta y la API ya lo han filtrado— sino quien monta la landing al escribir
 * `getContent('hero', 'en')` con un idioma que no declaró. Devolver vacío lo escondería; lanzar
 * lo deja en la primera carga de la página, con el nombre del idioma en el mensaje.
 */
export function columnaDeIdiomaDeclarado(codigo: string | undefined): string {
  const columna = columnaDeIdiomaOpcional(codigo);
  if (columna === null) {
    const declarados = idiomas()
      .map((idioma) => idioma.codigo)
      .join(', ');
    throw new Error(
      `El idioma '${String(codigo)}' no está declarado en cms.config.ts. Los declarados son: ${declarados}.`
    );
  }
  return columna;
}
