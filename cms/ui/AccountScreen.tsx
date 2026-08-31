'use client';

import { useState } from 'react';
import { FALLO_DE_RED } from './fallo-de-red';

/**
 * Cambiar la propia contraseña (SPEC §5.3; `changePassword` de #81).
 *
 * ## Que cierre la sesión no es un efecto secundario molesto: es el punto
 *
 * Cambiar la contraseña incrementa `password_version` y con eso caducan **todas** las sesiones
 * abiertas, la de esta pestaña incluida (ADR-301). Es lo que hace cualquiera al sospechar que
 * le han entrado, y sin ello no serviría de nada durante siete días.
 *
 * Así que la pantalla lo dice **antes** de que se pulse. Alguien que cambia su contraseña y de
 * pronto se ve en la pantalla de acceso, sin aviso, piensa que algo se ha roto — y lo que ha
 * pasado es justo lo que quería que pasara.
 */

export interface AccountScreenProps {
  readonly correo: string;
  readonly onCambiar: (actual: string, nueva: string) => Promise<{ ok: boolean; message?: string }>;
}

export function AccountScreen({ correo, onCambiar }: AccountScreenProps) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cambiar = async (formData: FormData): Promise<void> => {
    const actual = String(formData.get('actual') ?? '');
    const nueva = String(formData.get('nueva') ?? '');
    const repetida = String(formData.get('repetida') ?? '');

    // Se comprueba aquí y no en el servidor porque la repetición no es un dato: es una forma
    // de que no te equivoques al teclear a ciegas. Mandarla al servidor sería mandar una
    // contraseña más por la red para nada.
    if (nueva !== repetida) {
      setAviso('Las dos contraseñas nuevas no coinciden.');
      return;
    }

    setOcupado(true);

    let resultado;
    try {
      resultado = await onCambiar(actual, nueva);
    } catch {
      setAviso(FALLO_DE_RED);
      return;
    } finally {
      setOcupado(false);
    }

    // Si sale bien no se dice nada: la página se va sola al acceso. Poner "guardado" aquí sería
    // un mensaje que nadie llega a leer.
    if (!resultado.ok) setAviso(resultado.message ?? 'No se ha podido cambiar la contraseña.');
  };

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-tinta">Tu cuenta</h1>
        <p className="mt-1 text-tinta-suave">Entras como {correo}.</p>
      </div>

      <section className="rounded-lg border border-linea bg-superficie p-5">
        <h2 className="text-lg font-medium text-tinta">Cambiar tu contraseña</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Al cambiarla se cierran todas las sesiones abiertas, también esta:{' '}
          <strong>tendrás que volver a entrar</strong>. Si has cambiado la contraseña porque
          sospechas que alguien más ha entrado, eso es justo lo que quieres.
        </p>

        <form
          action={(formData) => {
            void cambiar(formData);
          }}
          className="mt-4 space-y-4"
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-tinta">Tu contraseña actual</span>
            <input
              name="actual"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-md border border-linea px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
            />
          </label>

          {/* La ayuda va **fuera** del `label` y enlazada con `aria-describedby`. Dentro, su
              texto se sumaría al nombre accesible del campo, y un lector de pantalla anunciaría
              "La nueva Al menos 12 caracteres..." como si fuese el nombre. */}
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-tinta">La nueva</span>
              <input
                name="nueva"
                type="password"
                required
                autoComplete="new-password"
                aria-describedby="ayuda-nueva"
                className="rounded-md border border-linea px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
              />
            </label>
            <span id="ayuda-nueva" className="text-sm text-tinta-tenue">
              Al menos 12 caracteres. Una frase que recuerdes vale más que algo corto y raro.
            </span>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-tinta">Repite la nueva</span>
            <input
              name="repetida"
              type="password"
              required
              autoComplete="new-password"
              className="rounded-md border border-linea px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={ocupado}
              className="rounded-md bg-accion px-4 py-2 text-sm font-medium text-sobre-accion transition hover:bg-accion-hover disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento"
            >
              Cambiar la contraseña
            </button>
            <p aria-live="polite" className="text-sm text-alarma">
              {aviso}
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
