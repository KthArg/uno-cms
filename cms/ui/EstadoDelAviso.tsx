// isomorphic: solo presentación. El dato llega calculado desde la página.
import { Icono } from './iconos';

/**
 * Si el último aviso a la web de destino llegó (#286, spec 16 §5.8).
 *
 * ## Por qué esto ocupa sitio en la pantalla que se abre primero
 *
 * Porque el aviso se manda con `after()`, **después** de responderle a quien publica. Si falla,
 * no lo ve nadie: la pantalla ya dijo «Publicado ✓» y se fue.
 *
 * Sin esto, alguien puede estar publicando durante semanas contra un destino caído y ver el
 * visto bueno cada vez. La auditoría lo registra, sí — pero una fila que solo se lee consultando
 * la base de datos a mano es, en la práctica, un fallo silencioso con papeleo.
 *
 * ## Los tres estados son tres, no dos
 *
 * `null` es **«esto no existe en este despliegue»**, no «no hay datos»: la fase se enciende con
 * dos variables de entorno y la inmensa mayoría de despliegues no las tiene. Ahí no se pinta
 * nada, ni un hueco ni un «sin configurar», porque no hay nada que configurar si no se quiere.
 *
 * Y **un fallo se ve como fallo**, con su forma y su color propios. Que se pareciera a «todavía
 * no se ha mandado ninguno» sería exactamente el silencio que este componente viene a romper.
 *
 * ## Por qué `items-start` y no `items-center`
 *
 * Porque el mensaje de fallo ocupa tres líneas en la columna estrecha de la pieza principal, y
 * con `items-center` el icono se queda **flotando en mitad del bloque**, separado de la frase que
 * encabeza. Se ve roto.
 *
 * No lo cazó ningún test —los ocho casos de este componente pasaban— sino mirar la captura del
 * panel. Es la clase de fallo que una suite verde no puede contar.
 */
export interface UltimoAvisoParaElPanel {
  readonly ok: boolean;
  /** Milisegundos desde la época. Un `Date` no cruza la frontera servidor/cliente sin más. */
  readonly cuando: number;
  readonly evento: string;
  readonly motivo?: string;
}

/**
 * «hace 3 minutos», sin dependencias ni `Intl` con locales que no controlamos.
 *
 * Se corta en días: más allá de eso, lo que importa no es la cifra exacta sino que hace mucho.
 * `ahora` se pasa para poder probarlo sin depender del reloj de la máquina — que es el fallo que
 * ya costó un arreglo en #275.
 */
export function haceCuanto(cuando: number, ahora: number): string {
  const segundos = Math.round((ahora - cuando) / 1000);

  // **Un instante en el futuro cae aquí, y no hace falta protegerlo aparte.** Pasa de verdad: el
  // reloj del proceso y el de la base de datos no son el mismo, y un desfase de un segundo daría
  // «hace -1 minutos» en la pantalla de inicio.
  //
  // Aquí había un `Math.max(0, …)` puesto por eso. **No hacía nada**: cualquier negativo es menor
  // que 60 y ya salía por esta rama. Lo cazó la mutación —quitarlo no mataba ningún caso— y se
  // quita en vez de dejar una línea que parece defender algo. El caso que lo comprueba se queda,
  // porque lo que hay que fijar es el comportamiento, no el `Math.max`.
  if (segundos < 60) return 'hace unos segundos';

  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return minutos === 1 ? 'hace 1 minuto' : `hace ${String(minutos)} minutos`;

  const horas = Math.round(minutos / 60);
  if (horas < 24) return horas === 1 ? 'hace 1 hora' : `hace ${String(horas)} horas`;

  const dias = Math.round(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${String(dias)} días`;
}

/**
 * Por qué falló, en una frase que diga **a quién preguntar**.
 *
 * Sin esto, el editor lee «falló» y no puede hacer nada. Con esto, sabe si el problema es que la
 * otra web no responde o que responde rechazándonos — que son dos conversaciones distintas con
 * dos personas distintas.
 *
 * No se enseña el código HTTP: a quien publica textos no le dice nada, y quien depura lo tiene
 * en la auditoría con el número exacto.
 */
function explicacion(motivo: string | undefined): string {
  switch (motivo) {
    case 'red':
      return 'No respondió.';
    case 'estado':
      return 'Respondió con un error.';
    case 'redirigido':
      return 'Redirige a otra dirección, y por seguridad no se sigue.';
    default:
      return '';
  }
}

export function EstadoDelAviso({
  aviso,
  ahora,
}: {
  readonly aviso: UltimoAvisoParaElPanel | null;
  readonly ahora: number;
}) {
  // La fase apagada no pinta nada. Ver arriba: no es un estado vacío, es que no existe.
  if (aviso === null) return null;

  const cuando = haceCuanto(aviso.cuando, ahora);

  if (aviso.ok) {
    return (
      <p className="mt-2 flex items-start gap-2 text-sm text-tinta-suave">
        <Icono de="publicado" tamano={16} className="mt-0.5 shrink-0 text-publicado-tinta" />
        <span>Se avisó a tu web {cuando}.</span>
      </p>
    );
  }

  const porQue = explicacion(aviso.motivo);

  return (
    <p className="mt-2 flex items-start gap-2 text-sm text-pendiente-tinta">
      <Icono de="alerta" tamano={16} className="mt-0.5 shrink-0 text-pendiente-tinta" />
      <span>
        El aviso a tu web falló {cuando}. {porQue} Tu web puede estar enseñando lo anterior.
      </span>
    </p>
  );
}
