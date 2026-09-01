import 'server-only';
import { readEntryForEditor, schemaForType } from './content';
import type { SectionSummary } from './content';

/**
 * Lo que la pieza principal del panel de inicio enseña de la primera sección (spec 12 §2).
 *
 * ## Por qué esto existe, en vez de leer `hero` y ya
 *
 * Porque **`hero` es una clave de `cms.config.ts`, no del producto**. La promesa de `SPEC.md`
 * §5.1 —y lo que hace que este CMS sirva para otra landing— es que las secciones las decide quien
 * lo monta: añadir un campo lo hace aparecer en el panel sin tocar un componente. Un panel de
 * inicio que lee `hero` a pelo se rompe en la primera configuración que no lo tenga, y lo hace
 * en la pantalla que se abre primero.
 *
 * La primera versión de #229 lo leía a pelo. Se cambió en la autorrevisión.
 *
 * ## Y por qué el título y la imagen salen del esquema
 *
 * Por lo mismo: **el nombre de los campos también es de quien configura**. `title` e `image` son
 * los de este `cms.config.ts`; en otro serán `heading` y `foto`. Lo que sí es estable es el
 * **tipo** de cada campo, que es lo que declara el esquema — así que se busca el primer texto y
 * la primera imagen, y no una clave escrita a mano.
 */

export interface PortadaDelPanel {
  /** El texto que encabeza la pieza. Vacío si esa sección no tiene ningún campo de texto. */
  readonly titulo: string;
  /** La imagen que sangra por la derecha. Vacía si no hay campo de imagen o no está puesta. */
  readonly imagen: string;
}

const VACIA: PortadaDelPanel = { titulo: '', imagen: '' };

/**
 * Lee la sección que va en la pieza principal: **la primera declarada como singleton**.
 *
 * La primera y no una elegida: el orden de `cms.config.ts` es el que decide quien lo monta, y la
 * primera sección de una landing es la portada en todas las que he visto. Si algún día hay que
 * poder elegirla, es un ajuste y una decisión aparte.
 */
export async function leerPortadaDelPanel(
  secciones: readonly SectionSummary[]
): Promise<PortadaDelPanel> {
  const primera = secciones.find((seccion) => seccion.tipo === 'singleton');
  if (primera === undefined) return VACIA;

  const entrada = await readEntryForEditor(primera.key);
  if (entrada === null) return VACIA;

  const schema = schemaForType(entrada.type);
  if (schema === null) return VACIA;

  let titulo = '';
  let imagen = '';

  for (const [nombre, campo] of Object.entries(schema.fields)) {
    const valor = entrada.draft[nombre];

    if (titulo === '' && campo.kind === 'text' && typeof valor === 'string') {
      titulo = valor;
    }

    if (
      imagen === '' &&
      campo.kind === 'image' &&
      typeof valor === 'object' &&
      valor !== null &&
      'url' in valor &&
      typeof (valor as { url: unknown }).url === 'string'
    ) {
      imagen = (valor as { url: string }).url;
    }
  }

  return { titulo, imagen };
}
