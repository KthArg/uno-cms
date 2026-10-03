import 'server-only';
import { cookies } from 'next/headers';
import appConfig from '@/cms.config';
import { hayVariosIdiomas, idiomaDeCodigo, idiomaPorDefecto } from './idiomas';

/**
 * En qué idioma está trabajando el panel (spec 17 §5.9, ADR-1102).
 *
 * ## Por qué una cookie, como el tema
 *
 * Por lo mismo que `cms/tema.ts`: el servidor tiene que saber el idioma **al componer la
 * página**, porque es él quien lee el borrador de ese idioma y quien cierra las server actions
 * sobre él. Con un parámetro en la URL también lo sabría, pero habría que llevarlo a mano en
 * cada enlace del panel —las tarjetas, la lista, el historial, el «volver»— y el primero que se
 * olvidara devolvería al editor al español sin avisar. La cookie no se olvida.
 *
 * ## Lo que no decide la cookie
 *
 * **A qué idioma va cada escritura.** Eso lo fija la página al componerse: cada pantalla lee el
 * idioma una vez y lo deja cerrado en sus server actions. Si en otra pestaña se cambia el
 * selector, lo que se guarda desde esta sigue yendo al idioma que enseña su etiqueta, que es lo
 * único que quien edita tiene delante.
 */

/** Sin prefijo `__Host-`, por lo mismo que la del tema: tiene que leerse en desarrollo por http. */
export const COOKIE_DE_IDIOMA = 'unocms_idioma';

/**
 * El código que pide una cookie, o el de por defecto.
 *
 * Un código que `cms.config.ts` ya no declara —se quitó un idioma— o una cookie manipulada se
 * leen como el de por defecto, sin error: es una preferencia guardada, no una orden, y el
 * panel tiene que abrirse igual (T-ID-43).
 */
export function leerIdiomaDelPanel(valor: string | undefined): string {
  if (valor !== undefined && idiomaDeCodigo(valor) !== null) return valor;
  return idiomaPorDefecto().codigo;
}

/**
 * A dónde ir después de cambiar de idioma, o `null` para quedarse donde se está.
 *
 * Casi siempre se queda: la portada en español y la portada en inglés están en la misma URL, y
 * cambiar de idioma es ver la otra. **Un elemento de lista no**: cada idioma tiene la suya
 * (ADR-1101), así que el testimonio que se estaba editando no existe en el otro idioma y la misma
 * URL daría un 404. Se vuelve a la lista, que sí existe en los dos.
 *
 * El destino se construye con el nombre de una colección **declarada** en `cms.config.ts`, nunca
 * copiando la ruta que llega del formulario: esa ruta la manda el navegador, y redirigir a lo
 * que diga sería una redirección abierta.
 */
export function destinoAlCambiarDeIdioma(ruta: string): string | null {
  const encontrada = /^\/admin\/(?:content|history)\/([^/]+)$/.exec(ruta);
  if (encontrada === null) return null;

  let clave: string;
  try {
    clave = decodeURIComponent(encontrada[1] ?? '');
  } catch {
    // Un `%` suelto en la ruta: no es ninguna pantalla nuestra, así que no hay a dónde volver.
    return null;
  }

  const punto = clave.indexOf('.');
  if (punto === -1) return null;

  const coleccion = clave.slice(0, punto);
  return Object.hasOwn(appConfig.collections, coleccion) ? `/admin/collections/${coleccion}` : null;
}

/** El idioma del panel para la petición en curso. */
export async function idiomaDelPanel(): Promise<string> {
  return leerIdiomaDelPanel((await cookies()).get(COOKIE_DE_IDIOMA)?.value);
}

/** Lo que necesita una pantalla del panel para trabajar en un idioma y decirlo. */
export interface IdiomaDeLaPantalla {
  /** Lo que se pasa a las lecturas y a las actions. */
  readonly codigo: string;
  readonly nombre: string;
  /** Si es el de por defecto: «Rellenar desde…» no tiene sentido en él. */
  readonly porDefecto: boolean;
  /**
   * El nombre para la etiqueta, o `undefined` en un sitio con un solo idioma, donde la etiqueta
   * no se pinta (T-ID-39). Viene ya resuelto para que cada página no repita la condición.
   */
  readonly etiqueta: string | undefined;
}

/**
 * El idioma con el que se compone esta pantalla.
 *
 * Se lee **una vez**, al principio de la página, y todo lo demás —lecturas, actions, etiqueta—
 * sale de este valor. Leer la cookie otra vez dentro de una action sería exactamente lo que
 * ADR-1102 evita: que un cambio en otra pestaña desvíe una escritura de esta.
 */
export async function idiomaDeLaPantalla(): Promise<IdiomaDeLaPantalla> {
  const codigo = await idiomaDelPanel();
  const idioma = idiomaDeCodigo(codigo) ?? idiomaPorDefecto();
  const porDefecto = idioma.codigo === idiomaPorDefecto().codigo;

  return {
    codigo: idioma.codigo,
    nombre: idioma.nombre,
    porDefecto,
    etiqueta: hayVariosIdiomas() ? idioma.nombre : undefined,
  };
}
