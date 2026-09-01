import { beforeEach, expect, it } from 'vitest';
import { contentEntries, getDb } from '@/cms/db';
import type { SectionSummary } from '@/cms/core/content';
import { leerPortadaDelPanel } from '@/cms/core/portada';
import { describeIntegration } from './env';

/**
 * La pieza principal del panel de inicio **no depende de una clave concreta** (spec 12 §2).
 *
 * ## De dónde sale este fichero
 *
 * De la autorrevisión de #229. La primera versión del bento leía `getDraft('hero')` a pelo, y
 * `hero` es una clave de **este** `cms.config.ts`, no del producto: la promesa de `SPEC.md` §5.1
 * es que las secciones las decide quien monta el CMS sobre su landing. Un panel de inicio que da
 * por hecha una clave se rompe en la primera configuración que no la tenga — y lo hace en la
 * pantalla que se abre primero.
 *
 * Lo mismo con los nombres de los campos: `title` e `image` son los de aquí; en otra landing
 * serán `heading` y `foto`. Lo estable es el **tipo** que declara el esquema, y eso es lo que se
 * busca.
 */

async function crear(key: string, type: string, draft: Record<string, unknown>): Promise<void> {
  await getDb()
    .insert(contentEntries)
    .values({ key, type, draft, published: null, status: 'changed' });
}

/** Un resumen como el que devuelve `listSections()`, que es lo que recibe la función. */
function seccion(key: string, tipo: 'singleton' | 'coleccion'): SectionSummary {
  return { key, nombre: key, tipo, estado: 'sin-publicar' };
}

describeIntegration('la portada del panel de inicio', () => {
  beforeEach(async () => {
    await getDb().delete(contentEntries);
  });

  it('saca el título y la imagen por el TIPO del campo, no por su nombre', async () => {
    await crear('hero', 'hero', {
      title: 'Mi web',
      subtitle: 'lo segundo',
      image: { mediaId: 'x', url: 'https://ejemplo.test/foto.png', alt: 'una foto' },
    });

    const portada = await leerPortadaDelPanel([seccion('hero', 'singleton')]);

    expect(portada.titulo).toBe('Mi web');
    expect(portada.imagen).toBe('https://ejemplo.test/foto.png');
  });

  it('sin ninguna sección, no revienta: devuelve vacío', async () => {
    // El sitio recién estrenado, que es el estado en el que alguien abre esto por primera vez.
    const portada = await leerPortadaDelPanel([]);

    expect(portada).toEqual({ titulo: '', imagen: '' });
  });

  it('con una sección sin campo de imagen, trae el título y deja la imagen vacía', async () => {
    // `about` tiene encabezado y texto rico, y **ninguna imagen**. La pieza principal tiene que
    // poder pintarse igual: es exactamente la configuración de una landing que no use fotos.
    await crear('about', 'about', { heading: 'Quiénes somos' });

    const portada = await leerPortadaDelPanel([seccion('about', 'singleton')]);

    expect(portada.titulo).toBe('Quiénes somos');
    expect(portada.imagen).toBe('');
  });

  it('si la primera de la lista es una colección, sigue buscando un singleton', async () => {
    // El orden lo decide quien configura, y nada obliga a que la primera sea un singleton. Con
    // una colección delante, una implementación que cogiera `secciones[0]` leería una entrada
    // que no existe y dejaría la pieza principal muda.
    await crear('hero', 'hero', { title: 'La portada de verdad' });

    const portada = await leerPortadaDelPanel([
      seccion('testimonials', 'coleccion'),
      seccion('hero', 'singleton'),
    ]);

    expect(portada.titulo).toBe('La portada de verdad');
  });

  it('y una sección sin fila todavía tampoco rompe nada', async () => {
    // Un singleton declarado en la configuración existe aunque no tenga fila: la crea
    // `ensureSingletonRow` la primera vez. Sin este caso, el panel de inicio de un sitio recién
    // instalado dependería de que alguien hubiera entrado antes en esa sección.
    const portada = await leerPortadaDelPanel([seccion('hero', 'singleton')]);

    expect(portada.titulo).toBe('');
    expect(portada.imagen).toBe('');
  });
});
