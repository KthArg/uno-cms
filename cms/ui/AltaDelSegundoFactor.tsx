'use client';

import { useState } from 'react';
import { FALLO_DE_RED } from './fallo-de-red';
import { Icono } from './iconos';
import { AVISO_ALARMA, BOTON_PRINCIPAL, CAMPO, TITULO } from './estilos';

/**
 * Dar de alta la verificación en dos pasos (spec 20 §3).
 *
 * Es la única pantalla que ve una sesión a medio entrar. Tres momentos: escanear el QR, confirmar
 * con un código, y guardar los códigos de recuperación, que se enseñan **esta vez y ninguna más**:
 * en la base solo queda su huella.
 *
 * Por eso el último paso es un botón y no una redirección automática. Quien no ha copiado los
 * códigos no debería poder saltárselos sin darse cuenta, y al pulsarlo se cierran todas las
 * sesiones: se vuelve a entrar, ya con código.
 */

export interface AltaDelSegundoFactorProps {
  readonly correo: string;
  /** El QR como `data:` URI: un `<img>`, sin HTML incrustado (ADR-107). */
  readonly qr: string;
  /** El secreto en grupos de cuatro, para quien no puede escanear. */
  readonly grupos: readonly string[];
  readonly onConfirmar: (
    codigo: string
  ) => Promise<{ ok: true; codigos: string[] } | { ok: false }>;
  readonly onTerminar: () => Promise<void>;
}

export function AltaDelSegundoFactor({
  correo,
  qr,
  grupos,
  onConfirmar,
  onTerminar,
}: AltaDelSegundoFactorProps) {
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const confirmar = async (formData: FormData): Promise<void> => {
    setOcupado(true);
    setAviso(null);
    let resultado;
    try {
      resultado = await onConfirmar(String(formData.get('codigo') ?? ''));
    } catch {
      setAviso(FALLO_DE_RED);
      return;
    } finally {
      setOcupado(false);
    }
    if (resultado.ok) setCodigos(resultado.codigos);
    else
      setAviso('Ese código no vale. Escribe el que enseña ahora la app, sin esperar a que cambie.');
  };

  const terminar = async (): Promise<void> => {
    setOcupado(true);
    try {
      await onTerminar();
    } catch {
      setAviso(FALLO_DE_RED);
      setOcupado(false);
    }
  };

  if (codigos !== null) {
    return (
      <div className="space-y-5">
        <h1 className={TITULO}>Guarda tus códigos de recuperación</h1>
        <p className="text-tinta-suave">
          Si pierdes el móvil, cada uno de estos códigos te deja entrar <strong>una vez</strong> en
          lugar del de la app. Cópialos o imprímelos y guárdalos lejos del móvil:{' '}
          <strong>no se vuelven a enseñar</strong>.
        </p>
        <ul
          aria-label="Códigos de recuperación"
          className="grid grid-cols-2 gap-2 rounded-2xl border border-linea bg-superficie p-4 font-mono text-sm text-tinta"
        >
          {codigos.map((codigo) => (
            <li key={codigo}>{codigo}</li>
          ))}
        </ul>
        {aviso !== null && (
          <p role="alert" className={AVISO_ALARMA}>
            <Icono de="alerta" tamano={16} className="mt-0.5" />
            {aviso}
          </p>
        )}
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            void terminar();
          }}
          className={`${BOTON_PRINCIPAL} w-full`}
        >
          Ya los he guardado: volver a entrar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className={TITULO}>Activa la verificación en dos pasos</h1>
      <p className="text-tinta-suave">
        Para entrar en el panel hace falta, además de la contraseña, un código de una app de
        autenticación (Google Authenticator, Microsoft Authenticator, 1Password, Authy…). Escanea
        este código con ella.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- un data: URI generado en el servidor; next/image no aporta nada aquí */}
      <img
        src={qr}
        alt={`Código QR para añadir ${correo} a tu app de autenticación`}
        width={220}
        height={220}
        className="mx-auto rounded-xl"
      />
      <div className="text-sm text-tinta-suave">
        <p>¿No puedes escanearlo? Escribe esta clave en la app:</p>
        {/* Cada grupo de cuatro sin partir: copiada a mano, una línea que corta un grupo por la
            mitad es la forma más fácil de equivocarse en un carácter. */}
        <code className="mt-1 flex flex-wrap gap-x-2 font-mono text-tinta">
          {grupos.map((grupo, i) => (
            <span key={i} className="whitespace-nowrap">
              {grupo}
            </span>
          ))}
        </code>
      </div>
      <form
        action={(formData) => {
          void confirmar(formData);
        }}
        className="space-y-4"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-tinta">El código que enseña la app</span>
          <input
            name="codigo"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            className={CAMPO}
          />
        </label>
        {aviso !== null && (
          <p role="alert" className={AVISO_ALARMA}>
            <Icono de="alerta" tamano={16} className="mt-0.5" />
            {aviso}
          </p>
        )}
        <button type="submit" disabled={ocupado} className={`${BOTON_PRINCIPAL} w-full`}>
          Activar
        </button>
      </form>
    </div>
  );
}
