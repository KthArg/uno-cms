'use client';

import { useState } from 'react';
import { FALLO_DE_RED } from './fallo-de-red';
import { Icono } from './iconos';
import { BOTON_PRINCIPAL, CAMPO, TARJETA, TITULO } from './estilos';

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
  /** Cuántos códigos de recuperación le quedan sin usar (spec 20). */
  readonly codigosRestantes: number;
  readonly onRegenerar: (
    codigo: string
  ) => Promise<{ ok: true; codigos: string[] } | { ok: false; message?: string }>;
}

export function AccountScreen({
  correo,
  onCambiar,
  codigosRestantes,
  onRegenerar,
}: AccountScreenProps) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [codigosNuevos, setCodigosNuevos] = useState<string[] | null>(null);
  const [avisoDeCodigos, setAvisoDeCodigos] = useState<string | null>(null);

  const regenerar = async (formData: FormData): Promise<void> => {
    setAvisoDeCodigos(null);
    let resultado;
    try {
      resultado = await onRegenerar(String(formData.get('codigo') ?? ''));
    } catch {
      setAvisoDeCodigos(FALLO_DE_RED);
      return;
    }
    if (resultado.ok) setCodigosNuevos(resultado.codigos);
    else setAvisoDeCodigos(resultado.message ?? 'No se han podido generar los códigos.');
  };

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
        <h1 className={TITULO}>Tu cuenta</h1>
        <p className="mt-1 text-tinta-suave">Entras como {correo}.</p>
      </div>

      <section className={`${TARJETA} p-5`}>
        <h2 className="text-lg font-semibold text-tinta">Cambiar tu contraseña</h2>
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
              className={CAMPO}
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
                className={CAMPO}
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
              className={CAMPO}
            />
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
              <Icono
                de={ocupado ? 'esperando' : 'cuenta'}
                className={ocupado ? 'animate-spin' : ''}
              />
              Cambiar la contraseña
            </button>
            <p aria-live="polite" className="text-sm text-alarma">
              {aviso}
            </p>
          </div>
        </form>
      </section>

      {/* La verificación en dos pasos no se puede apagar desde aquí: es obligatoria (spec 20).
          Lo único que se hace es renovar los códigos de recuperación, que se gastan. */}
      <section className={`${TARJETA} p-5`}>
        <h2 className="text-lg font-semibold text-tinta">Códigos de recuperación</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Te quedan <strong>{codigosNuevos?.length ?? codigosRestantes}</strong> de 10. Cada uno te
          deja entrar una vez si pierdes el móvil. Generar otros invalida los que tengas.
        </p>

        {codigosNuevos === null ? (
          <form
            action={(formData) => {
              void regenerar(formData);
            }}
            className="mt-4 space-y-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-tinta">El código que enseña tu app</span>
              <input
                name="codigo"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                className={CAMPO}
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className={BOTON_PRINCIPAL}>
                Generar códigos nuevos
              </button>
              <p aria-live="polite" className="text-sm text-alarma">
                {avisoDeCodigos}
              </p>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-tinta">
              Guárdalos ahora: <strong>no se vuelven a enseñar</strong>.
            </p>
            <ul
              aria-label="Códigos de recuperación nuevos"
              className="grid grid-cols-2 gap-2 rounded-2xl border border-linea bg-superficie p-4 font-mono text-sm text-tinta"
            >
              {codigosNuevos.map((codigo) => (
                <li key={codigo}>{codigo}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
