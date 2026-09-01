'use client';

import { useState } from 'react';
import type { PersonaDelPanel } from '@/cms/core/users';
import { ConfirmarAccion } from './ConfirmarAccion';
import { Icono } from './iconos';
import { FALLO_DE_RED } from './fallo-de-red';
import {
  ANILLO_DE_FOCO,
  ANILLO_DE_FOCO_ALARMA,
  BOTON_PRINCIPAL,
  BOTON_SUAVE,
  CAMPO,
  TARJETA,
  TITULO,
} from './estilos';

/**
 * La pantalla de personas (SPEC §3, §5.3, §9).
 *
 * ## El enlace de invitación se enseña una vez y hay que decirlo
 *
 * `SPEC.md` §10.2 deja el correo fuera del MVP, así que invitar no manda nada: produce un
 * enlace que quien administra tiene que hacer llegar por su cuenta. Eso convierte esta pantalla
 * en el **único** sitio donde ese enlace existe, y si alguien la cierra sin copiarlo se queda
 * sin él — hay que invitar otra vez.
 *
 * Por eso el enlace no aparece como un mensaje de éxito discreto: sale en un bloque que dice
 * qué es, que caduca en 24 horas y que nadie lo va a enviar por él.
 *
 * ## Los roles se llaman por lo que dejan hacer
 *
 * "admin" y "editor" son los valores de la base de datos. En la pantalla son "Puede
 * administrarlo todo" y "Puede escribir y publicar", porque quien invita está decidiendo
 * **qué le deja hacer a alguien**, no eligiendo una etiqueta.
 */

export interface UsersScreenProps {
  readonly personas: readonly PersonaDelPanel[];
  /** Quién está mirando: su propia fila no ofrece cambiarse el rol ni desactivarse. */
  readonly miId: string;
  readonly onInvitar: (datos: {
    nombre: string;
    correo: string;
    rol: 'admin' | 'editor';
  }) => Promise<{ ok: boolean; enlace?: string; userId?: string; message?: string }>;
  readonly onCambiarRol: (
    userId: string,
    rol: 'admin' | 'editor'
  ) => Promise<{ ok: boolean; message?: string }>;
  readonly onDesactivar: (userId: string) => Promise<{ ok: boolean; message?: string }>;
}

const NOMBRE_DEL_ROL: Record<'admin' | 'editor', string> = {
  admin: 'Puede administrarlo todo',
  editor: 'Puede escribir y publicar',
};

export function UsersScreen({
  personas,
  miId,
  onInvitar,
  onCambiarRol,
  onDesactivar,
}: UsersScreenProps) {
  const [lista, setLista] = useState<readonly PersonaDelPanel[]>(personas);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aDesactivar, setADesactivar] = useState<PersonaDelPanel | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const invitar = async (formData: FormData): Promise<void> => {
    const nombre = String(formData.get('nombre') ?? '').trim();
    const correo = String(formData.get('correo') ?? '').trim();
    const rol = formData.get('rol') === 'admin' ? 'admin' : 'editor';

    setOcupado(true);
    setEnlace(null);

    // `finally` para bajar la bandera: si la llamada **lanza** —red caída, 500, despliegue a
    // mitad— sin esto el formulario se queda deshabilitado para siempre y sin un solo mensaje.
    let resultado;
    try {
      resultado = await onInvitar({ nombre, correo, rol });
    } catch {
      setAviso(FALLO_DE_RED);
      return;
    } finally {
      setOcupado(false);
    }

    const { enlace: nuevoEnlace, userId } = resultado;

    if (!resultado.ok || nuevoEnlace === undefined || userId === undefined) {
      setAviso(resultado.message ?? 'No se ha podido invitar.');
      return;
    }

    setAviso(null);
    setEnlace(nuevoEnlace);
    // La lista se completa sin recargar, y con el identificador **real** que devuelve la action.
    // Inventarlo dejaría una fila que ofrece cambiar el rol y quitar el acceso mandando algo que
    // no es un identificador: la action lo rechaza, pero quien administra ve un error
    // incomprensible al usar algo que la pantalla le acaba de ofrecer.
    setLista((previas) => [
      ...previas,
      { id: userId, nombre, correo, rol, activa: true, sinEstrenar: true },
    ]);
  };

  const cambiarRol = async (persona: PersonaDelPanel, rol: 'admin' | 'editor'): Promise<void> => {
    setOcupado(true);

    let resultado;
    try {
      resultado = await onCambiarRol(persona.id, rol);
    } catch {
      setAviso(FALLO_DE_RED);
      return;
    } finally {
      setOcupado(false);
    }

    if (!resultado.ok) {
      setAviso(resultado.message ?? 'No se ha podido cambiar.');
      return;
    }

    setAviso(null);
    setLista((previas) =>
      previas.map((otra) => (otra.id === persona.id ? { ...otra, rol } : otra))
    );
  };

  const desactivar = async (persona: PersonaDelPanel): Promise<void> => {
    setADesactivar(null);

    let resultado;
    try {
      resultado = await onDesactivar(persona.id);
    } catch {
      setAviso(FALLO_DE_RED);
      return;
    }

    if (!resultado.ok) {
      setAviso(resultado.message ?? 'No se ha podido desactivar.');
      return;
    }

    setAviso(null);
    setLista((previas) =>
      previas.map((otra) => (otra.id === persona.id ? { ...otra, activa: false } : otra))
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className={TITULO}>Personas</h1>
        <p className="mt-1 text-tinta-suave">
          Quién puede entrar a administrar tu web y qué puede hacer cada uno.
        </p>
      </div>

      <p aria-live="polite" className="text-sm text-alarma">
        {aviso}
      </p>

      {enlace !== null && <EnlaceDeInvitacion enlace={enlace} />}

      <section className={`${TARJETA} p-5`}>
        <h2 className="text-lg font-semibold text-tinta">Invitar a alguien</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Se crea su cuenta y obtendrás un enlace para que elija su contraseña.
        </p>

        <form
          action={(formData) => {
            void invitar(formData);
          }}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-tinta">Nombre</span>
            <input name="nombre" required maxLength={120} className={CAMPO} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-tinta">Correo</span>
            <input name="correo" type="email" required maxLength={254} className={CAMPO} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-tinta">Qué podrá hacer</span>
            <select name="rol" defaultValue="editor" className={CAMPO}>
              <option value="editor">{NOMBRE_DEL_ROL.editor}</option>
              <option value="admin">{NOMBRE_DEL_ROL.admin}</option>
            </select>
          </label>

          <div className="flex items-end">
            <button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
              <Icono de="anadir" />
              Invitar
            </button>
          </div>
        </form>
      </section>

      <ul className="space-y-2">
        {lista.map((persona) => (
          <li key={persona.id} className={`${TARJETA} flex flex-wrap items-center gap-3 p-4`}>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-tinta">{persona.nombre}</p>
              <p className="truncate text-sm text-tinta-tenue">{persona.correo}</p>
            </div>

            {!persona.activa && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-superficie-suave py-1 pr-3 pl-2 text-xs font-medium text-tinta-suave">
                <Icono de="cerrar" tamano={14} />
                Sin acceso
              </span>
            )}

            {persona.activa && persona.sinEstrenar && (
              <span className="rounded-full bg-pendiente-fondo px-2.5 py-1 text-xs font-medium text-pendiente-tinta">
                Todavía no ha entrado
              </span>
            )}

            {persona.id === miId ? (
              // La propia fila no ofrece nada. Quitarse a uno mismo el acceso o el rol es un
              // error que no tiene deshacer desde dentro, y la action ya lo rechaza: enseñar
              // los controles sería ofrecer algo que va a fallar.
              <span className="text-sm text-tinta-tenue">Eres tú</span>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <span className="sr-only">Qué puede hacer {persona.nombre}</span>
                  <select
                    value={persona.rol}
                    disabled={ocupado || !persona.activa}
                    onChange={(evento) => {
                      void cambiarRol(
                        persona,
                        evento.currentTarget.value === 'admin' ? 'admin' : 'editor'
                      );
                    }}
                    className={BOTON_SUAVE}
                  >
                    <option value="editor">{NOMBRE_DEL_ROL.editor}</option>
                    <option value="admin">{NOMBRE_DEL_ROL.admin}</option>
                  </select>
                </label>

                {persona.activa && (
                  <button
                    type="button"
                    aria-label={`Quitar el acceso a ${persona.nombre}`}
                    onClick={() => {
                      setADesactivar(persona);
                    }}
                    className={`inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-alarma transition hover:bg-alarma-fondo ${ANILLO_DE_FOCO_ALARMA}`}
                  >
                    <Icono de="cerrar" tamano={16} />
                    Quitar acceso
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {aDesactivar !== null && (
        <ConfirmarAccion
          titulo={`¿Quitarle el acceso a ${aDesactivar.nombre}?`}
          descripcion="No podrá volver a entrar y se cerrará la sesión que tenga abierta. Lo que haya escrito o publicado se queda como está."
          textoConfirmar="Sí, quitar el acceso"
          onConfirmar={() => {
            void desactivar(aDesactivar);
          }}
          onCancelar={() => {
            setADesactivar(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * El enlace recién generado.
 *
 * En un campo de solo lectura y no como texto suelto: así se puede seleccionar de una vez con
 * el teclado, y el botón de copiar es un atajo, no la única forma. En un navegador sin permiso
 * de portapapeles —o en una página servida sin cifrar— `navigator.clipboard` no existe, y
 * entonces el campo sigue siendo la vía.
 */
function EnlaceDeInvitacion({ enlace }: { enlace: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <section
      className="rounded-2xl border border-publicado-linea bg-publicado-fondo p-5"
      aria-live="polite"
    >
      <h2 className="text-lg font-medium text-publicado-tinta">
        Ya está. Ahora pásale este enlace
      </h2>
      <p className="mt-1 text-sm text-publicado-tinta">
        Con él elegirá su contraseña y podrá entrar. <strong>Caduca en 24 horas</strong> y solo
        sirve una vez. No se lo enviamos nosotros: mándaselo tú por donde habléis.
      </p>
      <p className="mt-1 text-sm text-publicado-tinta">
        Guárdalo antes de salir de esta página, porque no vas a poder volver a verlo.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Enlace de invitación</span>
          <input
            readOnly
            value={enlace}
            onFocus={(evento) => {
              evento.currentTarget.select();
            }}
            className={`${CAMPO} border-publicado-linea font-mono text-sm`}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(enlace).then(() => {
              setCopiado(true);
            });
          }}
          className={`inline-flex h-11 items-center gap-2 rounded-xl bg-publicado-tinta px-4 text-sm font-medium text-sobre-publicado transition hover:bg-publicado-tinta ${ANILLO_DE_FOCO}`}
        >
          <Icono de={copiado ? 'publicado' : 'anadir'} tamano={16} />
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </section>
  );
}
