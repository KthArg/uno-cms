'use client';

import { useState } from 'react';
import type { ActionFieldError } from '@/cms/actions/pipeline';
import { FALLO_DE_RED } from './fallo-de-red';
import { Icono } from './iconos';
import { BOTON_PRINCIPAL, TARJETA, TITULO } from './estilos';

/**
 * Los ajustes del sitio (ADR-410, SPEC §5.3).
 *
 * ## Estos no se publican, y por eso lo dicen
 *
 * Todo lo demás en el panel tiene dos estados —lo que escribes y lo que se ve— y un botón para
 * pasar de uno a otro. Aquí no: guardar **cambia la web al momento**. Quien lleva media hora
 * publicando textos llega con la costumbre puesta, así que la pantalla lo avisa antes de que
 * pulse en vez de después.
 *
 * ## Por qué el nombre del sitio y el "cómo se ve al compartirlo" van juntos
 *
 * Son dos claves distintas en la base de datos (`site` y `seo`) y dos guardados distintos, pero
 * para quien administra son la misma pregunta: cómo se llama esto y qué sale cuando lo pegan en
 * un chat. Separarlos en dos pantallas obligaría a recordar cuál era cuál.
 */

export interface SettingsScreenProps {
  readonly nombreDelSitio: string;
  readonly seo: {
    readonly defaultTitle?: string;
    readonly defaultDescription?: string;
    readonly ogImageUrl?: string;
  };
  readonly onGuardar: (
    clave: 'site' | 'seo',
    valores: Record<string, string>
  ) => Promise<{ ok: boolean; message?: string; errores?: readonly ActionFieldError[] }>;
}

export function SettingsScreen({ nombreDelSitio, seo, onGuardar }: SettingsScreenProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className={TITULO}>Ajustes</h1>
        <p className="mt-1 text-tinta-suave">
          Estos cambios se aplican a tu web en cuanto los guardas. No hay que publicarlos.
        </p>
      </div>

      <Bloque
        titulo="Tu sitio"
        descripcion="El nombre con el que se identifica tu web."
        clave="site"
        campos={[
          {
            nombre: 'siteName',
            etiqueta: 'Nombre del sitio',
            valor: nombreDelSitio,
            requerido: true,
          },
        ]}
        onGuardar={onGuardar}
      />

      <Bloque
        titulo="Cómo se ve al compartirlo"
        descripcion="Lo que aparece en Google y cuando alguien pega el enlace de tu web en un chat. Se usa solo donde la página no diga otra cosa."
        clave="seo"
        campos={[
          {
            nombre: 'defaultTitle',
            etiqueta: 'Título por defecto',
            valor: seo.defaultTitle ?? '',
            ayuda: 'Hasta 60 caracteres. Más largo se corta.',
          },
          {
            nombre: 'defaultDescription',
            etiqueta: 'Descripción por defecto',
            valor: seo.defaultDescription ?? '',
            ayuda: 'Hasta 160 caracteres.',
            largo: true,
          },
          {
            nombre: 'ogImageUrl',
            etiqueta: 'Imagen al compartir',
            valor: seo.ogImageUrl ?? '',
            ayuda: 'Una dirección que empiece por / o por https://',
          },
        ]}
        onGuardar={onGuardar}
      />
    </div>
  );
}

interface CampoDeAjuste {
  readonly nombre: string;
  readonly etiqueta: string;
  readonly valor: string;
  readonly ayuda?: string;
  readonly requerido?: boolean;
  readonly largo?: boolean;
}

function Bloque({
  titulo,
  descripcion,
  clave,
  campos,
  onGuardar,
}: {
  titulo: string;
  descripcion: string;
  clave: 'site' | 'seo';
  campos: readonly CampoDeAjuste[];
  onGuardar: SettingsScreenProps['onGuardar'];
}) {
  const [errores, setErrores] = useState<readonly ActionFieldError[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const guardar = async (formData: FormData): Promise<void> => {
    const valores: Record<string, string> = {};
    for (const campo of campos) {
      valores[campo.nombre] = String(formData.get(campo.nombre) ?? '');
    }

    setOcupado(true);

    let resultado;
    try {
      resultado = await onGuardar(clave, valores);
    } catch {
      // Sin esto el botón se queda en "Guardar" deshabilitado y quien mira no sabe si se
      // guardó. Aquí importa especialmente: estos ajustes tienen efecto inmediato.
      setAviso(FALLO_DE_RED);
      return;
    } finally {
      setOcupado(false);
    }

    setErrores(resultado.errores ?? []);
    setAviso(
      resultado.ok
        ? 'Guardado. Ya está en tu web.'
        : (resultado.message ?? 'No se ha podido guardar.')
    );
  };

  return (
    <section className={`${TARJETA} p-5`}>
      <h2 className="text-lg font-semibold text-tinta">{titulo}</h2>
      <p className="mt-1 text-sm text-tinta-suave">{descripcion}</p>

      <form
        action={(formData) => {
          void guardar(formData);
        }}
        className="mt-4 space-y-4"
      >
        {campos.map((campo) => {
          const error = errores.find((otro) => otro.path === campo.nombre);
          const idAyuda = `${campo.nombre}-ayuda`;

          const idError = `${campo.nombre}-error`;
          // La ayuda y el error se enlazan por `aria-describedby` y viven **fuera** del
          // `label`: dentro, su texto se sumaría al nombre accesible del campo, y quien use un
          // lector de pantalla oiría "Imagen al compartir Una dirección que empiece por..."
          // como si todo eso fuera el nombre.
          const descrito = [
            campo.ayuda === undefined ? null : idAyuda,
            error === undefined ? null : idError,
          ]
            .filter((id): id is string => id !== null)
            .join(' ');

          const atributos = {
            name: campo.nombre,
            defaultValue: campo.valor,
            'aria-describedby': descrito === '' ? undefined : descrito,
            'aria-invalid': error === undefined ? undefined : (true as const),
            className:
              'rounded-md border border-linea px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
          };

          return (
            <div key={campo.nombre} className="flex flex-col gap-1">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-tinta">{campo.etiqueta}</span>
                {campo.largo === true ? (
                  <textarea {...atributos} rows={3} />
                ) : (
                  <input {...atributos} required={campo.requerido === true} />
                )}
              </label>
              {campo.ayuda !== undefined && (
                <span id={idAyuda} className="text-sm text-tinta-tenue">
                  {campo.ayuda}
                </span>
              )}
              {error !== undefined && (
                <span id={idError} className="text-sm text-alarma">
                  {error.message}
                </span>
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={ocupado} className={BOTON_PRINCIPAL}>
            <Icono
              de={ocupado ? 'esperando' : 'publicar'}
              className={ocupado ? 'animate-spin' : ''}
            />
            Guardar
          </button>
          <p aria-live="polite" className="text-sm text-tinta-suave">
            {aviso}
          </p>
        </div>
      </form>
    </section>
  );
}
