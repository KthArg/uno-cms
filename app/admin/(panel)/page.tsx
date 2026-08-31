import { auth } from '@/cms/auth';
import { publishAll } from '@/cms/actions';
import { listSections } from '@/cms/core/content';
import { motivoLegible } from '@/cms/ui/motivoLegible';
import { PublishAllButton, type PublishAllResult } from '@/cms/ui/PublishAllButton';
import { SectionCard } from '@/cms/ui/SectionCard';

/**
 * El panel de contenido (SPEC §9: "tarjeta por sección con estado + botón Publicar todo").
 *
 * Dinámico a la fuerza: enseña el estado de publicación, y una versión cacheada mostraría
 * "Publicado" en una sección que el editor acaba de cambiar.
 */
export const dynamic = 'force-dynamic';

export default async function PanelContenido() {
  const session = await auth();
  const secciones = await listSections();

  const nombrePorClave = new Map(secciones.map((seccion) => [seccion.key, seccion.nombre]));

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
   *
   * Llevaba la firma de `useActionState` —`(estadoAnterior, formData)`— con los dos argumentos
   * sin usar. Desde #119 el botón la llama él mismo en un bucle, así que esos parámetros eran
   * dos huecos que había que rellenar con `null` y un `FormData` vacío para nada. Fuera: una
   * firma que miente sobre cómo se usa la función es peor que una firma incómoda.
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

  const pendientes = secciones.filter((seccion) => seccion.estado !== 'publicado').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-tinta">Contenido</h1>
          <p className="mt-1 text-tinta-suave">
            {pendientes === 0
              ? 'Todo está publicado.'
              : pendientes === 1
                ? 'Hay 1 sección con cambios sin publicar.'
                : `Hay ${String(pendientes)} secciones con cambios sin publicar.`}
          </p>
        </div>

        {pendientes > 0 && <PublishAllButton action={publicarTodo} />}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {secciones.map((seccion) => (
          <li key={seccion.key}>
            <SectionCard
              nombre={seccion.nombre}
              href={
                seccion.tipo === 'coleccion'
                  ? `/admin/collections/${seccion.key}`
                  : `/admin/content/${seccion.key}`
              }
              estado={seccion.estado}
              {...(seccion.elementos === undefined ? {} : { elementos: seccion.elementos })}
            />
          </li>
        ))}
      </ul>

      <p className="text-sm text-tinta-tenue">Sesión iniciada como {session?.user.email}.</p>
    </div>
  );
}
