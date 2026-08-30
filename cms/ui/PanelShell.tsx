// isomorphic: solo presentación. El rol llega como prop desde el layout, que es quien tiene
// la sesión — así este componente no arrastra `cms/auth` a ningún sitio.
import Link from 'next/link';

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
  /** Si esta pantalla usa el ancho de la ventana en vez del techo de lectura (issue #190). */
  readonly anchoCompleto?: boolean;
}

export interface EntradaMenu {
  readonly href: string;
  readonly texto: string;
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
 */
const MENU: readonly EntradaMenu[] = [
  { href: '/admin', texto: 'Contenido' },
  { href: '/admin/media', texto: 'Imágenes' },
  { href: '/admin/users', texto: 'Personas', soloAdmin: true },
  { href: '/admin/settings', texto: 'Ajustes', soloAdmin: true },
];

/** Las entradas que le corresponden a un rol. Exportada para poder fijarla con un test. */
export function entradasVisibles(rol: 'admin' | 'editor'): readonly EntradaMenu[] {
  return MENU.filter((entrada) => entrada.soloAdmin !== true || rol === 'admin');
}

export function PanelShell({
  children,
  rol,
  nombreDeUsuario,
  rutaActual,
  onSalir,
  anchoCompleto = false,
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
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className={`mx-auto flex ${ancho} items-center justify-between gap-4 px-6 py-3`}>
          <Link
            href="/admin"
            className="font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Tu sitio
          </Link>

          <div className="flex items-center gap-4 text-sm">
            {/* El nombre **es** el enlace a la propia cuenta, que es donde se busca. Una entrada
                más en el menú lateral lo pondría al nivel de "Contenido" o "Personas", y no lo
                está: no se administra la web desde ahí, se administra uno mismo. */}
            <Link
              href="/admin/account"
              aria-current={rutaActual.startsWith('/admin/account') ? 'page' : undefined}
              className="text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              {nombreDeUsuario}
            </Link>

            {/* **Un `form`, no un enlace** (issue #211). Cerrar sesión es una mutación: con un
                `GET` lo dispara cualquier cosa que precargue enlaces —un antivirus, el
                prefetch del navegador, un chat que despliega vistas previas— y quien
                administra se encuentra fuera sin haber pulsado nada.

                Y va en la cabecera, en todas las pantallas, porque el momento en que hace
                falta es al terminar: estés donde estés. */}
            <form action={onSalir}>
              <button
                type="submit"
                className="text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className={`mx-auto flex w-full ${ancho} flex-1 gap-8 px-6 py-8`}>
        {/* `aria-label` porque puede haber más de un `nav` en la página y un lector de
            pantalla necesita distinguirlos por algo que no sea el orden. */}
        <nav aria-label="Secciones del panel" className="w-48 shrink-0">
          <ul className="space-y-1">
            {entradas.map((entrada) => {
              const activa =
                entrada.href === '/admin'
                  ? rutaActual === '/admin'
                  : rutaActual.startsWith(entrada.href);

              return (
                <li key={entrada.href}>
                  <Link
                    href={entrada.href}
                    // `aria-current` y no solo un color: quien navega con lector de pantalla
                    // no ve el fondo gris.
                    aria-current={activa ? 'page' : undefined}
                    className={`block rounded-md px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                      activa
                        ? 'bg-slate-900 font-medium text-white'
                        : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {entrada.texto}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
