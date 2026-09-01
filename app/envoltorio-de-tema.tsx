import { cookies } from 'next/headers';
import { COOKIE_DE_TEMA, leerTema } from '@/cms/tema';
import { fuenteDelPanel } from './fuente';

/**
 * El contenedor que fija el modo en las pantallas **fuera** del panel (issue #219).
 *
 * Acceso, `/setup` e invitación no pasan por `app/admin/(panel)/layout.tsx`, que es quien lee la
 * cookie para el resto. Sin esto, quien elige el modo oscuro y cierra sesión se encuentra un
 * acceso claro: la preferencia parecería no haberse guardado.
 *
 * Lee la cookie por su cuenta en vez de recibirla por props porque estas pantallas no comparten
 * ningún layout donde ponerla. Son tres, y la alternativa —un layout más solo para envolverlas—
 * cambiaría el enrutado para ahorrar tres líneas.
 *
 * ## Por qué vive en `app/` y no en `cms/ui`
 *
 * Lo escribí primero en `cms/ui` y la guarda `tests/unit/panel-espera-al-servidor.test.ts` lo
 * rechazó: allí no puede haber un `await` fuera de un `try`. Y tenía razón por un motivo más
 * hondo que el suyo — `cms/ui` es **presentación isomorfa** por contrato, y esto llama a
 * `cookies()`, que es servidor puro.
 *
 * La salida no era declarar una excepción a la guarda: era reconocer que el fichero estaba en
 * el sitio equivocado. Una excepción habría dejado el directorio diciendo una cosa y conteniendo
 * otra.
 */
export async function EnvoltorioDeTema({ children }: { children: React.ReactNode }) {
  const tema = leerTema((await cookies()).get(COOKIE_DE_TEMA)?.value);

  return (
    <div
      data-tema={tema ?? 'sistema'}
      className={`luz-del-panel min-h-dvh text-tinta ${fuenteDelPanel.className}`}
    >
      {children}
    </div>
  );
}
