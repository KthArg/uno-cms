import { auth } from '@/cms/auth';
import { publishAll } from '@/cms/actions';
import { listSections } from '@/cms/core/content';
import { listMedia } from '@/cms/core/media';
import { leerPortadaDelPanel } from '@/cms/core/portada';
import { publicacionesPorDia, totalDeLaVentana } from '@/cms/core/publicaciones';
import { listUsers } from '@/cms/core/users';
import { motivoLegible } from '@/cms/ui/motivoLegible';
import { PanelDeInicio, type Cifra, type UltimaImagen } from '@/cms/ui/PanelDeInicio';
import { PublishAllButton, type PublishAllResult } from '@/cms/ui/PublishAllButton';

/**
 * El panel de contenido (SPEC §9: "tarjeta por sección con estado + botón Publicar todo"),
 * compuesto en bento desde #229 (spec 12).
 *
 * Dinámico a la fuerza: enseña el estado de publicación, y una versión cacheada mostraría
 * "Publicado" en una sección que el editor acaba de cambiar.
 */
export const dynamic = 'force-dynamic';

export default async function PanelContenido() {
  const session = await auth();
  const esAdmin = session?.user.role === 'admin';

  /**
   * Todo a la vez, que son lecturas independientes.
   *
   * En serie serían cinco viajes encadenados para pintar una pantalla que se abre entera; el
   * dato que más tarda marca el ritmo igual, así que encadenarlos solo suma esperas.
   */
  const [secciones, imagenes, serie, personas] = await Promise.all([
    listSections(),
    listMedia(),
    publicacionesPorDia(),
    // **La cuenta de personas solo para administración.** Un editor no entra en esa pantalla
    // (T-E-4), y enseñarle cuánta gente hay sería contarle por la puerta de al lado justo lo que
    // la otra puerta no le deja ver. Cuesta una consulta menos, además.
    esAdmin ? listUsers() : Promise.resolve(null),
  ]);

  // Va después porque necesita saber cuál es la primera sección, y eso lo dice `listSections()`.
  // **No se lee `hero` a pelo**: esa clave es de este `cms.config.ts`, no del producto, y un
  // panel de inicio que la dé por hecha se rompe en la primera landing que no la tenga — en la
  // pantalla que se abre primero. Está contado en `cms/core/portada.ts`.
  const portada = await leerPortadaDelPanel(secciones);

  const nombrePorClave = new Map(secciones.map((seccion) => [seccion.key, seccion.nombre]));
  const pendientes = secciones.filter((seccion) => seccion.estado !== 'publicado').length;

  /**
   * La Server Action que consume el botón.
   *
   * **Se pasa la función tal cual al componente de cliente.** Envolverla en una flecha
   * (`action={() => publicarTodo()}`) parece equivalente y no lo es: esa flecha se crea en el
   * servidor y no lleva la marca de `'use server'`, así que Next no puede serializarla y la
   * página revienta con "Functions cannot be passed directly to Client Components".
   *
   * Ni `typecheck` ni `build` lo detectan. Lo encontró el e2e al renderizar la página con una
   * sesión de verdad.
   */
  async function publicarTodo(): Promise<PublishAllResult> {
    'use server';

    const resultado = await publishAll({});

    if (!resultado.ok) {
      return { publicadas: [], fallidas: [], restantes: 0, error: resultado.message };
    }

    return {
      publicadas: resultado.data.published,
      fallidas: resultado.data.failed.map((fallida) => ({
        // El nombre visible, no la clave: es lo que el editor busca en su pantalla.
        nombre: nombrePorClave.get(fallida.key) ?? fallida.key,
        motivo: motivoLegible(fallida.code, fallida.fields),
      })),
      restantes: resultado.data.remaining,
    };
  }

  /**
   * Las cifras de la pieza principal. **Todas salen de algo que ya se leyó**: ninguna se estima
   * ni se redondea, que es lo que separa esto del panel de analítica que inspiró la composición.
   */
  const cifras: Cifra[] = [
    { valor: secciones.length, etiqueta: 'Secciones' },
    { valor: pendientes, etiqueta: 'Sin publicar' },
    { valor: imagenes.length, etiqueta: 'Imágenes' },
    ...(personas === null ? [] : [{ valor: personas.length, etiqueta: 'Personas' }]),
  ];

  // `listMedia` viene ordenada de más reciente a más antigua, así que la primera es la última
  // subida. Se apoya en ese orden a propósito y no vuelve a ordenar aquí: dos criterios de orden
  // para lo mismo se separan, y el de allí es el que ve la biblioteca.
  const primera = imagenes[0];
  const ultimaImagen: UltimaImagen | null =
    primera === undefined
      ? null
      : { url: primera.url, alt: primera.alt, filename: primera.filename };

  return (
    <PanelDeInicio
      secciones={secciones}
      cifras={cifras}
      serieDePublicaciones={serie}
      totalDePublicaciones={totalDeLaVentana(serie)}
      ultimaImagen={ultimaImagen}
      tituloDeLaPortada={portada.titulo}
      imagenDeLaPortada={portada.imagen}
      pendientes={pendientes}
      publicarTodo={pendientes > 0 ? <PublishAllButton action={publicarTodo} /> : null}
    />
  );
}
