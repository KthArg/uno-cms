// isomorphic: solo presentación. El rol llega como prop desde el layout, que es quien tiene
// la sesión — así este componente no arrastra `cms/auth` a ningún sitio.
import Link from 'next/link';
import type { Tema } from '@/cms/tema';
import { Icono, type NombreDeIcono } from './iconos';
import { ANILLO_DE_FOCO } from './estilos';

/**
 * El armazón del panel (SPEC §3): barra lateral, cabecera y contenido.
 *
 * ## El menú no es el guard
 *
 * La entrada de "Personas" solo se pinta para `admin`, y eso es **comodidad, no protección**:
 * quien escriba la ruta a mano llega igual. Lo que cierra la puerta es el guard de la propia
 * ruta, que vive en su `layout.tsx` y comprueba el rol contra la sesión del servidor.
 *
 * Se dice aquí porque esconder una opción del menú se parece mucho a proteger algo, y esa
 * confusión es la que deja rutas de administración abiertas en muchos paneles.
 *
 * ## El cristal (spec 11)
 *
 * La cabecera y el menú **flotan** sobre el fondo con luz; el contenido está pegado a él. Esa
 * es toda la jerarquía: lo que flota es lo que actúa, lo que está al fondo es lo que se lee.
 *
 * El fondo va en este contenedor y no en el `<body>` porque el `<body>` es compartido con la
 * landing pública, que está fuera de alcance. Es el mismo motivo por el que `data-tema` vive
 * aquí, y está contado en `cms/tema.ts`.
 */

export interface PanelShellProps {
  readonly children: React.ReactNode;
  readonly rol: 'admin' | 'editor';
  readonly nombreDeUsuario: string;
  /** Para marcar la entrada activa. Es el `pathname`. */
  readonly rutaActual: string;
  /**
   * Cierra la sesión (issue #211).
   *
   * Baja como acción de servidor desde el layout, por lo mismo que bajan el rol y el nombre:
   * este componente es presentación isomorfa y no puede arrastrar `cms/auth` al navegador.
   */
  readonly onSalir: () => Promise<void>;
  /**
   * El modo guardado, o `null` si no hay preferencia (spec 10 §4).
   *
   * `null` no significa claro: significa **que manda el sistema operativo**, y se pinta como
   * `data-tema="sistema"`. Pintar `claro` por defecto ignoraría el ajuste de quien nunca ha
   * tocado el interruptor, que es casi todo el mundo.
   */
  readonly tema: Tema | null;
  readonly onCambiarDeTema: () => Promise<void>;
  /** Si esta pantalla usa el ancho de la ventana en vez del techo de lectura (issue #190). */
  readonly anchoCompleto?: boolean;
  /**
   * La clase que inyecta la letra del panel (`app/fuente.ts`).
   *
   * Llega como prop en vez de importarse aquí porque `next/font` es de la aplicación y este
   * módulo es presentación isomorfa: importarlo ataría `cms/ui` a Next para siempre, que es
   * justo lo que la extracción del paquete (#17) tendría que deshacer.
   */
  readonly claseDeFuente?: string;
}

export interface EntradaMenu {
  readonly href: string;
  readonly texto: string;
  readonly icono: NombreDeIcono;
  readonly soloAdmin?: boolean;
}

/**
 * El menú.
 *
 * Hasta #106 llevaba una bandera `disponible` que escondía las entradas cuya pantalla todavía
 * no existía: un menú con enlaces que dan 404 no es "en construcción", es una interfaz que
 * miente sobre lo que hay. Ya están las cuatro, así que la bandera se va (#122). Que se fuera
 * sola era el trato.
 *
 * `soloAdmin` **no es un guard**: es comodidad, para no ofrecer lo que no se puede usar. La
 * puerta está en cada página, con `soloAdmin()` de `cms/auth/panel.ts`, y hay un test que lo
 * exige ruta por ruta (#70).
 *
 * **El icono acompaña al texto, no lo sustituye** (spec 11 §5). Lo que se pidió es que el icono
 * vaya delante y sea lo que se reconoce de un vistazo; quitar la palabra sería otra cosa —un
 * menú que hay que aprender— y además cambiaría el vocabulario que fija `SPEC.md` §9.
 */
const MENU: readonly EntradaMenu[] = [
  { href: '/admin', texto: 'Contenido', icono: 'contenido' },
  { href: '/admin/media', texto: 'Imágenes', icono: 'imagenes' },
  { href: '/admin/users', texto: 'Personas', icono: 'personas', soloAdmin: true },
  { href: '/admin/settings', texto: 'Ajustes', icono: 'ajustes', soloAdmin: true },
];

/** Las entradas que le corresponden a un rol. Exportada para poder fijarla con un test. */
export function entradasVisibles(rol: 'admin' | 'editor'): readonly EntradaMenu[] {
  return MENU.filter((entrada) => entrada.soloAdmin !== true || rol === 'admin');
}

/** Lo que hace pulsable a un control de la cabecera. 44 px de alto, que es el mínimo de las guías. */
const BOTON_DE_CABECERA = `flex h-11 items-center gap-2 rounded-lg px-3 text-sm text-tinta-suave transition hover:bg-superficie-suave hover:text-tinta ${ANILLO_DE_FOCO}`;

export function PanelShell({
  children,
  rol,
  nombreDeUsuario,
  rutaActual,
  onSalir,
  tema,
  onCambiarDeTema,
  anchoCompleto = false,
  claseDeFuente = '',
}: PanelShellProps) {
  const entradas = entradasVisibles(rol);

  /**
   * El techo de 1152 px se levanta **solo donde hace falta** (issue #190).
   *
   * Es bueno para leer: una lista de contenido ocupando 1900 píxeles obliga a barrer la cabeza
   * de un lado a otro. La excepción es el editor, donde media pantalla es una web de verdad y el
   * techo la dejaba al tercio de su tamaño.
   */
  const ancho = anchoCompleto ? 'max-w-none' : 'max-w-6xl';

  return (
    <div
      // El atributo va aquí y no en el `<html>` porque la raíz es compartida con la landing
      // pública, que no entra en esta fase: un `color-scheme: dark` allí le pondría barras de
      // desplazamiento oscuras a una página clara. Está contado en `cms/tema.ts`.
      data-tema={tema ?? 'sistema'}
      className={`luz-del-panel flex min-h-dvh flex-col ${claseDeFuente}`}
    >
      {/* Pegada arriba: en una pantalla larga —el historial, una colección de veinte— salir y
          cambiar de sección dejaban de estar a la vista. El cristal es lo que permite pegarla
          sin que tape: se ve que hay contenido pasando por debajo. */}
      <header className="cristal-barra sticky top-0 z-30">
        <div className={`mx-auto flex ${ancho} items-center justify-between gap-4 px-6 py-2`}>
          <Link
            href="/admin"
            className={`flex h-11 items-center gap-2.5 rounded-lg px-2 font-semibold text-tinta ${ANILLO_DE_FOCO}`}
          >
            {/* El punto de acento es la única marca del panel. Decorativo de verdad: no dice
                nada que el texto de al lado no diga. */}
            <span aria-hidden="true" className="size-2 rounded-full bg-acento" />
            Tu sitio
          </Link>

          <div className="flex items-center gap-1">
            {/* El nombre **es** el enlace a la propia cuenta, que es donde se busca. Una entrada
                más en el menú lateral lo pondría al nivel de "Contenido" o "Personas", y no lo
                está: no se administra la web desde ahí, se administra uno mismo. */}
            <Link
              href="/admin/account"
              aria-current={rutaActual.startsWith('/admin/account') ? 'page' : undefined}
              // **El nombre accesible lo lleva el enlace, no el texto de dentro**, y esa
              // decisión salió de romper cuatro tests.
              //
              // El texto se esconde en pantallas estrechas —el icono sigue diciendo a dónde
              // lleva, y un correo largo se come la cabecera entera— así que hacía falta una
              // copia `sr-only` para que en un móvil el enlace no se anunciara vacío. Con las
              // dos, **el nombre accesible pasó a ser la suma**: «Ana Ana».
              //
              // En un navegador no se notaría, porque `hidden` es `display:none` y la copia
              // oculta no cuenta. Lo cazaron los tests de componentes, donde no hay CSS y las
              // dos están presentes — y lo que enseñan es que el nombre dependía de que una
              // hoja de estilos cargara. Con `aria-label` no depende de nada.
              aria-label={nombreDeUsuario}
              className={BOTON_DE_CABECERA}
            >
              <Icono de="cuenta" />
              <span aria-hidden="true" className="hidden max-w-40 truncate sm:inline">
                {nombreDeUsuario}
              </span>
            </Link>

            {/* El interruptor dice **a dónde lleva**, no dónde estás: «Modo oscuro» cuando
                estás en claro. Un icono de luna a secas obliga a adivinar cuál de las dos
                cosas significa, y se adivina mal la mitad de las veces.

                Por eso el icono va **con** el texto en `title` y en el nombre accesible: aquí
                el icono sí es el que carga con el significado, y tiene que decirlo. */}
            <form action={onCambiarDeTema}>
              <button type="submit" className={BOTON_DE_CABECERA} title={textoDeTema(tema)}>
                <Icono de={tema === 'oscuro' ? 'modoClaro' : 'modoOscuro'} />
                <span className="sr-only">{textoDeTema(tema)}</span>
              </button>
            </form>

            {/* **Un `form`, no un enlace** (issue #211). Cerrar sesión es una mutación: con un
                `GET` lo dispara cualquier cosa que precargue enlaces —un antivirus, el
                prefetch del navegador, un chat que despliega vistas previas— y quien
                administra se encuentra fuera sin haber pulsado nada.

                Y va en la cabecera, en todas las pantallas, porque el momento en que hace
                falta es al terminar: estés donde estés. */}
            <form action={onSalir}>
              {/* Mismo motivo que en el enlace de la cuenta: el nombre accesible va en el
                  botón, y el texto de dentro es la parte visible que se puede esconder. */}
              <button type="submit" aria-label="Salir" className={BOTON_DE_CABECERA}>
                <Icono de="salir" />
                <span aria-hidden="true" className="hidden sm:inline">
                  Salir
                </span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className={`mx-auto flex w-full ${ancho} flex-1 gap-8 px-4 py-6 sm:px-6 sm:py-8`}>
        {/**
         * La navegación, **una sola** (issue #220).
         *
         * En un móvil es una barra pegada abajo; a partir de `lg` vuelve a ser la tarjeta de la
         * columna izquierda. **Es el mismo marcado**, y esa decisión salió de escribirlo mal
         * primero: la primera versión eran dos `nav` —uno `lg:hidden` y otro `hidden lg:block`—
         * y los tests se pusieron rojos con «se han encontrado varios enlaces llamados
         * Contenido». Tenían razón por debajo de lo que decían: los enlaces estaban duplicados
         * en el DOM, y dos árboles que dicen lo mismo se separan en cuanto alguien toque uno.
         *
         * Lo que hace que quepa en un solo marcado es que **el material se separó de la forma**:
         * `cristal-fondo` pone el tinte y el desenfoque, y el borde, el radio y la posición son
         * clases normales, que sí tienen variantes de tamaño.
         *
         * **Abajo y no arriba** en el móvil: es donde llega el pulgar sin cambiar de agarre, y
         * arriba ya está la cabecera con la cuenta, el modo y salir. Ahí el icono es lo
         * principal y el texto va debajo, pequeño, pero **sigue pintado**: es donde de verdad no
         * se puede adivinar — la primera vez, con una mano y andando.
         *
         * **En escritorio es un rail de iconos sin texto** (spec 12 §4, ADR-810), y eso deroga a
         * medias la regla de la spec 11 §5 —«el icono acompaña al texto, no lo sustituye»—. Se
         * decide, no se desliza: el ancho que se ahorra es la mitad del motivo por el que la
         * composición no se parecía a lo que se pidió.
         *
         * Lo que lo hace sostenible es que **el texto no desaparece del documento**: cada enlace
         * lleva su nombre accesible y su `title`, así que un lector de pantalla dice «Contenido»
         * y el ratón lo enseña al pasar. Lo que se pierde es la primera vez en escritorio, y son
         * cuatro secciones.
         *
         * `pb-[env(safe-area-inset-bottom)]` para que en un teléfono con barra de gestos la fila
         * no quede debajo de ella. Sin eso, la última sección es la que no se puede pulsar justo
         * donde más falta hace.
         *
         * `lg:self-start` porque un elemento de un flex se estira a lo alto por defecto, y un
         * `sticky` estirado no se pega a nada: se queda quieto pareciendo que funciona.
         */}
        <nav
          aria-label="Secciones del panel"
          className="cristal-fondo fixed inset-x-0 bottom-0 z-30 border-t border-linea pb-[env(safe-area-inset-bottom)] lg:sticky lg:inset-x-auto lg:top-24 lg:bottom-auto lg:z-auto lg:w-auto lg:shrink-0 lg:self-start lg:rounded-3xl lg:border lg:p-2 lg:pb-2"
        >
          <ul className="mx-auto flex max-w-lg items-stretch justify-around lg:max-w-none lg:flex-col lg:gap-1">
            {entradas.map((entrada) => {
              const activa = esActiva(entrada.href, rutaActual);

              return (
                <li key={entrada.href} className="flex-1 lg:flex-none">
                  <Link
                    href={entrada.href}
                    // `aria-current` y no solo un color: quien navega con lector de pantalla
                    // no ve el fondo.
                    aria-current={activa ? 'page' : undefined}
                    // **El nombre accesible y el `title` son la condición de ADR-810**, no un
                    // adorno: son lo que impide que el rail de escritorio se quede mudo de
                    // verdad. Hay un caso que los exige (T-216-2).
                    aria-label={entrada.texto}
                    title={entrada.texto}
                    // 56 px de alto en el móvil y **toda la celda** pulsable, no el icono. El
                    // mínimo de las guías es 44 y aquí sobra a propósito: es el control que más
                    // se usa y el que peor se apunta andando. En el rail es un cuadrado de 44.
                    className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition lg:size-11 lg:justify-center lg:rounded-2xl lg:text-sm ${ANILLO_DE_FOCO} ${
                      activa
                        ? 'font-medium text-acento lg:bg-accion lg:text-sobre-accion'
                        : 'text-tinta-suave lg:hover:bg-superficie-suave lg:hover:text-tinta'
                    }`}
                  >
                    <Icono de={entrada.icono} tamano={22} className="lg:size-5" />
                    {/* En escritorio el texto deja de pintarse pero **no se va del documento**:
                        `sr-only` lo mantiene para quien lo lee en voz alta. Y en el móvil sigue
                        debajo del icono, que es donde hace falta. */}
                    <span className="lg:sr-only">{entrada.texto}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* El hueco de abajo es para la barra de secciones, que en el móvil va fija sobre el
            contenido: sin él, el último elemento de cualquier lista queda debajo y no se puede
            pulsar. */}
        <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>
      </div>
    </div>
  );
}

/**
 * Si una entrada del menú es la de la pantalla actual.
 *
 * Estaba escrita dentro del `map` y ahora hay **dos menús** —el lateral y el de abajo—, así que
 * copiarla sería tener dos criterios que se pueden separar: el lateral marcando una sección y la
 * barra inferior otra, en la misma pantalla.
 *
 * `/admin` se compara entero porque es prefijo de todas las demás: con `startsWith` se quedaría
 * marcada siempre.
 */
function esActiva(href: string, rutaActual: string): boolean {
  return href === '/admin' ? rutaActual === '/admin' : rutaActual.startsWith(href);
}

/**
 * Lo que dice el interruptor de modo.
 *
 * Fuera del componente para que el texto sea uno solo: está en el `title` y en el nombre
 * accesible, y son dos sitios donde una copia se desincroniza sin que se vea.
 */
function textoDeTema(tema: Tema | null): string {
  return tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro';
}
