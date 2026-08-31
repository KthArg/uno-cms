'use client';

/**
 * El andamiaje que comparten todos los campos: etiqueta, ayuda y error.
 *
 * Está aquí y no repetido en cada campo porque la parte de accesibilidad es fácil de hacer
 * mal ocho veces seguidas. Concretamente:
 *
 * - La etiqueta va **asociada por `htmlFor`**, no envolviendo al control. Envolver funciona
 *   para un `input`, pero no para un editor de texto rico ni para un grupo de botones, y
 *   tener dos formas de hacerlo garantiza que una de las dos se olvide.
 * - El error se enlaza con `aria-describedby` y se marca con `aria-invalid`. Un mensaje rojo
 *   debajo del campo no existe para quien no lo ve.
 * - El texto de ayuda entra también en `aria-describedby`: si solo estuviera el error, la
 *   ayuda sería invisible para un lector de pantalla justo cuando más falta hace.
 */

export interface FieldShellProps {
  readonly id: string;
  readonly label: string;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly required: boolean;
  readonly children: React.ReactNode;
}

/** Los identificadores que un control necesita para quedar bien descrito. */
export function idsDeCampo(id: string, help?: string, error?: string) {
  const descritoPor = [
    help === undefined ? null : `${id}-ayuda`,
    error === undefined ? null : `${id}-error`,
  ].filter((valor): valor is string => valor !== null);

  return {
    'aria-describedby': descritoPor.length > 0 ? descritoPor.join(' ') : undefined,
    'aria-invalid': error === undefined ? undefined : true,
  } as const;
}

export function FieldShell({ id, label, help, error, required, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-tinta">
        {label}
        {/* El asterisco es decorativo: `aria-hidden` porque la obligatoriedad ya viaja en el
            `required` del control, y anunciarla dos veces es ruido. */}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-tinta-tenue">
            *
          </span>
        )}
      </label>

      {children}

      {help !== undefined && (
        <p id={`${id}-ayuda`} className="text-xs text-tinta-tenue">
          {help}
        </p>
      )}

      {error !== undefined && (
        <p id={`${id}-error`} className="text-sm text-alarma">
          {error}
        </p>
      )}
    </div>
  );
}

/** Las clases del control, con el borde rojo cuando hay error. */
export function claseControl(error?: string): string {
  return `w-full rounded-md border px-3 py-2 text-sm text-tinta shadow-sm focus:outline-none focus:ring-2 focus:ring-acento ${
    error === undefined ? 'border-linea' : 'border-alarma'
  }`;
}
