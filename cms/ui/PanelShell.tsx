'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Tema } from '@/cms/tema';
import { Icono, type NombreDeIcono } from './iconos';
import { Logotipo } from './Logotipo';
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
 * ## El vidrio (spec 11, spec 12)
 *
 * La cabecera y el menú **flotan** sobre el fondo con luz; el contenido está pegado a él. Esa
 * es toda la jerarquía: lo que flota es lo que actúa, lo que está al fondo es lo que se lee.
 *
 * El fondo va en este contenedor y no en el `<body>` porque el `<body>` es compartido con la
 * landing pública, que está fuera de alcance. Es el mismo motivo por el que `data-tema` vive
 * aquí, y está contado en `cms/tema.ts`.
 *
 * ## Por qué esto es de cliente, y por qué antes no lo era
 *
 * Hasta #234 la ruta llegaba en una cabecera que pone el middleware, y el armazón era
 * presentación isomorfa. El comentario de entonces decía que hacerlo cliente sería «descargar el
 * panel entero en el navegador solo para pintar un fondo gris».
 *
 * **Ese razonamiento tenía un agujero y estaba en producción.** El layout de `(panel)` es común
 * a todas las rutas de `/admin`, así que en una navegación de cliente Next **lo reutiliza y no
 * lo vuelve a ejecutar**: `headers()` solo se lee en el render del servidor, y la ruta se
 * quedaba congelada en la de la primera carga. Medido: entrando en `/admin` y pulsando
 * «Imágenes», la URL cambiaba a `/admin/media` y el rail seguía marcando «Contenido» — con su
 * color, con su icono relleno **y con su `aria-current`**, así que un lector de pantalla
 * anunciaba la página equivocada.
 *
 * `usePathname()` sí se actualiza en cada navegación. Lo que cuesta es serializar este armazón
 * al cliente; lo que se gana es que el menú diga dónde estás. El presupuesto que protegía aquel
 * comentario es el de la **landing**, y la landing no monta esto.
 */

export interface PanelShellProps {
  readonly children: React.ReactNode;
  readonly rol: 'admin' | 'editor';
  readonly nombreDeUsuario: string;
  /**
   * La ruta con la que se pinta el **primer** render, del servidor.
   *
   * Manda `usePathname()` en cuanto hay cliente; esto solo evita que el menú aparezca sin nada
   * marcado durante el primer pintado. Sale de la cabecera que pone el middleware.
   */
  readonly rutaActual: string;
  /**
   * Cierra la sesión (issue #211).
   *
   * Baja como acción de servidor desde el layout, por lo mismo que bajan el rol y el nombre:
   * este componente es de cliente y no puede arrastrar `cms/auth` al navegador. Pasar una Server
   * Action como prop a un componente de cliente es el patrón normal y sigue ejecutándose en el
   * servidor; lo que no puede cruzar es el módulo que la define.
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
  /**
   * La clase que inyecta la letra del panel (`app/fuente.ts`).
   *
   * Llega como prop en vez de importarse aquí porque `next/font` es de la aplicación y esto es
   * una pieza de `cms/ui`: importarlo la ataría a Next para siempre, que es justo lo que la
   * extracción del paquete (#17) tendría que deshacer. Que el componente sea de cliente no
   * cambia ese límite — sigue siendo código del CMS, no de la aplicación que lo monta.
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
  claseDeFuente = '',
}: PanelShellProps) {
  const entradas = entradasVisibles(rol);

  /**
   * **La ruta la manda el cliente.**
   *
   * `usePathname()` se actualiza en cada navegación; la prop es solo el respaldo del primer
   * render y de los tests de componentes, donde no hay router. Sin este `??`, en jsdom el menú
   * se quedaría sin nada marcado y los casos que comprueban `aria-current` medirían el vacío.
   */
  const ruta = usePathname() ?? rutaActual;

  /**
   * **El panel usa toda la ventana**, y esto deroga el techo de lectura de #190.
   *
   * Aquel techo eran 1152 px centrados, con un motivo real: una línea de texto de 1900 píxeles
   * obliga a barrer la cabeza de un lado a otro para leerla. Lo que estaba mal era **dónde** se
   * aplicaba —al contenedor entero en vez de a la prosa—, y el precio se veía en cualquier
   * pantalla ancha: en 1920 px sobraban casi cuatrocientos a cada lado, en una herramienta que
   * existe para editar.
   *
   * Lo que sustituye al techo es acotar **la medida de la línea donde hay texto que leer** y
   * dejar que la estructura ocupe lo que hay. Es lo mismo que perseguía #190, aplicado a lo que
   * de verdad se lee.
   *
   * Por eso aquí ya no se calcula ningún ancho: lo pone el contenedor grande, que ocupa lo que
   * queda tras el rail.
   */

  return (
    <div
      // El atributo va aquí y no en el `<html>` porque la raíz es compartida con la landing
      // pública, que no entra en esta fase: un `color-scheme: dark` allí le pondría barras de
      // desplazamiento oscuras a una página clara. Está contado en `cms/tema.ts`.
      data-tema={tema ?? 'sistema'}
      className={`luz-del-panel flex min-h-dvh flex-col ${claseDeFuente}`}
    >
      {/**
       * **El rail vive fuera del contenedor**, flotando sobre el fondo (spec 12 §2).
       *
       * Es lo que separa esta composición de un panel con barra lateral: el contenedor grande es
       * una lámina de vidrio que se lee como **una sola cosa**, y la navegación es otra pieza que
       * flota al lado. Con el rail dentro, el contenedor vuelve a ser una ventana con menú.
       *
       * En el móvil sigue siendo la barra de abajo, que es donde llega el pulgar.
       */}
      {/* **Sin margen en el móvil.** El contenedor flotante es lo que da el efecto en escritorio,
          y en un teléfono solo quita ancho: medido, el contenido bajaba de 358 px a 332 de 390
          —del 92 % al 85 %— por un margen que ahí no se ve. A partir de `sm` sí flota. */}
      <div className="flex min-h-dvh w-full gap-0 p-0 sm:gap-4 sm:p-5 xl:gap-5 xl:p-7">
        <NavegacionDelPanel entradas={entradas} rutaActual={ruta} />

        {/* **El contenedor grande.** Todo el ancho que quede, que es la petición de #229: en una
            pantalla de 1920 sobraban casi cuatrocientos píxeles a cada lado, en una herramienta
            que existe para editar. */}
        <div className="lamina flex min-w-0 flex-1 flex-col overflow-hidden rounded-none sm:rounded-3xl">
          <header className="sticky top-0 z-30 border-b border-linea">
            <div className="flex items-center justify-between gap-4 px-4 py-2 sm:px-6">
              <Link
                href="/admin"
                className={`flex h-11 items-center gap-2.5 rounded-lg px-2 font-semibold text-tinta ${ANILLO_DE_FOCO}`}
              >
                {/* La marca. **Decorativa aquí a propósito**: va al lado del nombre del sitio,
                y un lector de pantalla que dijera «UnoCMS Tu sitio» estaría leyendo dos cosas
                donde hay una. */}
                <Logotipo tamano={22} className="text-acento" />
                Tu sitio
              </Link>

              <div className="flex items-center gap-1">
                {/* El nombre **es** el enlace a la propia cuenta, que es donde se busca. Una entrada
                más en el menú lateral lo pondría al nivel de "Contenido" o "Personas", y no lo
                está: no se administra la web desde ahí, se administra uno mismo. */}
                <Link
                  href="/admin/account"
                  aria-current={ruta.startsWith('/admin/account') ? 'page' : undefined}
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

          <div className="flex w-full flex-1 gap-6 px-3 py-4 sm:px-6 sm:py-6">
            {/* El hueco de abajo es para la barra de secciones, que en el móvil va fija sobre el
            contenido: sin él, el último elemento de cualquier lista queda debajo y no se puede
            pulsar. */}
            <main className="min-w-0 flex-1 pb-24 lg:pb-0">{children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * La navegación del panel, **una sola** (issue #220), extraída aquí en #229.
 *
 * Se saca del cuerpo porque cambió de sitio: ahora vive **fuera** del contenedor grande, y
 * dejarla incrustada donde estaba habría significado tenerla en dos ramas del árbol según el
 * tamaño de pantalla — que es exactamente el error que se corrigió en #220, con los enlaces
 * duplicados en el DOM.
 *
 * En un móvil es una barra pegada abajo; a partir de `lg` es el rail de iconos. **Es el mismo
 * marcado**, y lo que permite que quepa en uno solo es que el material se separó de la forma:
 * `lamina-fondo` pone el tinte y el desenfoque, y el borde, el radio y la posición son clases
 * normales, que sí tienen variantes de tamaño.
 *
 * **Abajo y no arriba** en el móvil: es donde llega el pulgar sin cambiar de agarre. Ahí el
 * icono es lo principal y el texto va debajo, pequeño, pero **sigue pintado**: es donde de
 * verdad no se puede adivinar — la primera vez, con una mano y andando.
 *
 * **En escritorio es un rail de iconos sin texto** (spec 12 §4, ADR-810), y eso deroga a medias
 * la regla de la spec 11 §5. Lo que lo hace sostenible es que el texto no desaparece del
 * documento: cada enlace lleva su nombre accesible y su `title`.
 *
 * `pb-[env(safe-area-inset-bottom)]` para que en un teléfono con barra de gestos la fila no
 * quede debajo de ella. `lg:self-start` porque un elemento de un flex se estira a lo alto por
 * defecto, y un `sticky` estirado no se pega a nada: se queda quieto pareciendo que funciona.
 */
function NavegacionDelPanel({
  entradas,
  rutaActual,
}: {
  readonly entradas: readonly EntradaMenu[];
  readonly rutaActual: string;
}) {
  return (
    <nav
      aria-label="Secciones del panel"
      className="lamina-fondo fixed inset-x-0 bottom-0 z-30 border-t border-linea pb-[env(safe-area-inset-bottom)] lg:sticky lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:z-auto lg:w-auto lg:shrink-0 lg:-translate-y-1/2 lg:self-center lg:rounded-3xl lg:border lg:p-2 lg:pb-2"
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
                {/* **El dibujo cambia con la sección activa** (#231): relleno el de la pantalla
                    en la que estás, hueco el resto. Es una señal más, no la única — el color y
                    `aria-current` siguen ahí. */}
                <Icono de={entrada.icono} tamano={22} relleno={activa} className="lg:size-5" />
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
