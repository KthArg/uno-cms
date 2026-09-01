'use client';

import { useState } from 'react';
import { FALLO_DE_RED } from './fallo-de-red';
import { Icono } from './iconos';
import { AVISO_PENDIENTE, BOTON_PRINCIPAL } from './estilos';

/**
 * "Publicar todo" (SPEC §9).
 *
 * ## Lo que hace este componente que un botón normal no haría
 *
 * Publicar y decir "listo" es la implementación cómoda y es la que engaña. `publishAll` es
 * todo-o-nada **por sección** (ADR-401): puede publicar seis y dejar dos fuera porque les
 * falta un campo. Si el botón no lo cuenta, el editor se va convencido de que su sitio está
 * al día y hay dos secciones que no lo están.
 *
 * Por eso el resultado se queda en pantalla, dice **qué** se quedó fuera y **qué le falta**,
 * y se anuncia en una región `aria-live` para quien no está mirando el botón.
 *
 * ## Y por qué continúa solo (#119)
 *
 * `publishAll` publica como mucho cien entradas por llamada. El tope no es un capricho: el
 * bucle corre dentro de una Server Action, en secuencia, y en serverless la función tiene un
 * límite de duración. Al chocar no se pierde lo publicado —cada entrada va en su transacción—
 * pero sí el informe, y el editor se queda sin saber qué pasó con su sitio.
 *
 * Hasta ahora la pantalla decía "vuelve a pulsar para continuar". Funciona y es una tarea que
 * no debería ser de quien escribe: con doscientos elementos son tres pulsaciones y ninguna
 * pista de cuántas faltan.
 *
 * Ahora el bucle está **aquí**, en el cliente: cada llamada es corta —así que ninguna choca con
 * el límite— y se repite mientras queden. Los informes se acumulan, que es lo que hace que al
 * final se vea el total y no el del último tramo.
 *
 * **Se para si una vuelta no publica ni falla nada.** Esa es la condición honesta de fin: si el
 * servidor sigue diciendo que quedan pero no avanza, seguir pidiendo sería un bucle infinito
 * contra la base de datos de alguien.
 */

export interface PublishAllResult {
  readonly publicadas: string[];
  readonly fallidas: { readonly nombre: string; readonly motivo: string }[];
  readonly restantes: number;
  readonly error?: string;
}

/**
 * La action, sin argumentos.
 *
 * Tuvo la firma de `useActionState` mientras el botón era un formulario. Ya no: el bucle de
 * #119 la llama directamente, y arrastrar dos parámetros que hay que rellenar con `null` y un
 * `FormData` vacío sería una firma que miente sobre cómo se usa.
 */
export type PublishAllAction = () => Promise<PublishAllResult>;

export function PublishAllButton({ action }: { action: PublishAllAction }) {
  const [resultado, setResultado] = useState<PublishAllResult | null>(null);
  const [pendiente, setPendiente] = useState(false);

  const publicarTodo = async (): Promise<void> => {
    setPendiente(true);
    setResultado(null);

    const publicadas: string[] = [];
    const fallidas: PublishAllResult['fallidas'] = [];

    try {
      await encadenar(publicadas, fallidas);
    } catch {
      // La llamada no llegó a responder. Sin esto, el bucle moría aquí y el botón se quedaba
      // deshabilitado diciendo "Publicando…" para siempre, sin un solo mensaje.
      //
      // Lo publicado hasta ahora **está confirmado** —cada entrada va en su transacción— así
      // que se enseña, no se descarta: decirle a alguien que no se publicó nada cuando se
      // publicaron cuarenta es peor que el fallo de red.
      setResultado({ publicadas, fallidas, restantes: 0, error: FALLO_DE_RED });
    } finally {
      setPendiente(false);
    }
  };

  /** Las vueltas, hasta que no queden o hasta que una no avance. */
  const encadenar = async (
    publicadas: string[],
    fallidas: PublishAllResult['fallidas']
  ): Promise<void> => {
    for (;;) {
      const vuelta = await action();

      if (vuelta.error !== undefined) {
        setResultado({ publicadas, fallidas, restantes: 0, error: vuelta.error });
        return;
      }

      publicadas.push(...vuelta.publicadas);
      fallidas.push(...vuelta.fallidas);

      // Sin restantes se acabó. Y si una vuelta no publicó ni falló nada, tampoco se sigue:
      // el servidor dice que quedan y no avanza, así que insistir sería un bucle infinito.
      const avanzo = vuelta.publicadas.length > 0 || vuelta.fallidas.length > 0;
      if (vuelta.restantes === 0 || !avanzo) {
        setResultado({ publicadas, fallidas, restantes: vuelta.restantes });
        return;
      }

      // Se enseña el avance entre vueltas: con cientos de entradas, un botón que dice
      // "Publicando…" durante medio minuto sin más parece colgado.
      setResultado({
        publicadas: [...publicadas],
        fallidas: [...fallidas],
        restantes: vuelta.restantes,
      });
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => {
          void publicarTodo();
        }}
        disabled={pendiente}
        className={BOTON_PRINCIPAL}
      >
        {/* El icono cambia con el estado, y gira mientras hay vueltas en marcha: con muchas
            secciones esto tarda, y un botón que solo cambia de palabra parece colgado. */}
        <Icono
          de={pendiente ? 'esperando' : 'publicar'}
          className={pendiente ? 'animate-spin' : ''}
        />
        {pendiente ? 'Publicando…' : 'Publicar todo'}
      </button>

      {/* `aria-live="polite"`: el resultado aparece sin que nadie lo pida, así que hay que
          anunciarlo. `polite` y no `assertive` porque no interrumpe nada urgente. */}
      <div aria-live="polite" className="text-sm">
        {resultado !== null && <Resumen resultado={resultado} pendiente={pendiente} />}
      </div>
    </div>
  );
}

function Resumen({ resultado, pendiente }: { resultado: PublishAllResult; pendiente: boolean }) {
  // **Y `restantes === 0`**, que faltaba. Sin esa condición, una vuelta que no publica nada
  // mientras el servidor dice que quedan siete acababa enseñando "no había cambios sin
  // publicar": exactamente lo contrario de lo que pasa, y sin ningún síntoma. Lo encontró el
  // test de la vuelta que no avanza.
  const nadaQuePublicar =
    resultado.error === undefined &&
    resultado.publicadas.length === 0 &&
    resultado.fallidas.length === 0 &&
    resultado.restantes === 0;

  if (nadaQuePublicar) {
    return <p className="text-tinta-suave">No había cambios sin publicar.</p>;
  }

  return (
    <div className="space-y-2">
      {/* El error va **arriba y junto a lo demás**, no en lugar de lo demás. La primera versión
          devolvía solo el mensaje, y eso se traga la lista de lo que sí se publicó: decirle a
          alguien que no se publicó nada cuando se publicaron cuarenta es peor que el fallo que
          se está contando. Lo publicado está confirmado, cada entrada en su transacción. */}
      {resultado.error !== undefined && (
        <p className="flex items-start gap-2 text-alarma">
          <Icono de="alerta" tamano={16} className="mt-0.5" />
          {resultado.error}
        </p>
      )}

      {resultado.publicadas.length > 0 && (
        <p className="flex items-start gap-2 text-publicado-tinta">
          <Icono de="publicado" tamano={16} className="mt-0.5" />
          {resultado.publicadas.length === 1
            ? 'Se ha publicado 1 sección.'
            : `Se han publicado ${String(resultado.publicadas.length)} secciones.`}
        </p>
      )}

      {resultado.fallidas.length > 0 && (
        <div className={`${AVISO_PENDIENTE} flex-col`}>
          <p className="flex items-center gap-2 font-medium">
            <Icono de="conCambios" tamano={16} />
            Estas secciones no se han publicado:
          </p>
          <ul className="mt-1 space-y-1 ps-6">
            {resultado.fallidas.map((fallida) => (
              <li key={fallida.nombre}>
                <strong className="font-medium">{fallida.nombre}</strong>: {fallida.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resultado.restantes > 0 && (
        <p className="text-tinta-suave">
          {pendiente
            ? `Quedan ${String(resultado.restantes)} por publicar…`
            : // Sin `pendiente` esto significa que el bucle se paró sin avanzar. Decir "vuelve
              // a pulsar" ahí sería mandar a alguien a repetir lo que acaba de no funcionar.
              `Quedan ${String(resultado.restantes)} sin publicar. Vuelve a intentarlo más tarde.`}
        </p>
      )}
    </div>
  );
}
