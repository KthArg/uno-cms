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
}

export interface EntradaMenu {
  readonly href: string;
  readonly texto: string;
  readonly soloAdmin?: boolean;
  /**
   * Si la pantalla existe ya.
   *
   * **Bookkeeping temporal de M4** — PENDIENTE(#122), se va cuando el hito cierre. La alternativa era pintar
   * el menú completo desde el primer PR, y eso significa ofrecerle al editor cuatro enlaces de
   * los que tres dan 404. Un menú con enlaces rotos no es "en construcción": es una interfaz
   * que miente sobre lo que hay.
   *
   * La otra alternativa —páginas vacías con un "próximamente"— es peor: parece que la función
   * existe y no existe.
   */
  readonly disponible?: boolean;
}

const MENU: readonly EntradaMenu[] = [
  { href: '/admin', texto: 'Contenido', disponible: true },
  { href: '/admin/media', texto: 'Imágenes', disponible: true },
  { href: '/admin/users', texto: 'Personas', soloAdmin: true },
  { href: '/admin/settings', texto: 'Ajustes', soloAdmin: true },
];

/** Las entradas que le corresponden a un rol. Exportada para poder fijarla con un test. */
export function entradasVisibles(rol: 'admin' | 'editor'): readonly EntradaMenu[] {
  return MENU.filter((entrada) => entrada.soloAdmin !== true || rol === 'admin');
}

export function PanelShell({ children, rol, nombreDeUsuario, rutaActual }: PanelShellProps) {
  const entradas = entradasVisibles(rol).filter((entrada) => entrada.disponible === true);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link
            href="/admin"
            className="font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Tu sitio
          </Link>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">{nombreDeUsuario}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-8">
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
