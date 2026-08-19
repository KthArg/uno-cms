'use client';

import dynamic from 'next/dynamic';
import type { AnyField, ImageValue, ObjectSchema } from '@/cms/core/config';
import type { ActionFieldError } from '@/cms/actions/pipeline';
import { FieldShell } from './fields/FieldShell';
import { CampoImagen } from './fields/ImageField';
import {
  CampoBooleano,
  CampoColor,
  CampoEnlace,
  CampoNumero,
  CampoSeleccion,
  CampoTexto,
} from './fields/SimpleFields';

/**
 * El formulario de una entrada, **generado** desde su esquema (SPEC §5.1, §3).
 *
 * ## El contrato que sostiene todo el CMS
 *
 * §5.1 promete que adaptar el CMS a otro proyecto es escribir `cms.config.ts`. Eso solo es
 * cierto si **añadir un campo ahí lo hace aparecer aquí sin tocar el panel**. Por eso este
 * componente recorre el esquema y no una lista de campos escrita a mano, y por eso el test
 * que lo cubre monta un esquema inventado en vez del real: con el real, un formulario
 * escrito a mano pasaría igual.
 *
 * El `switch` sobre `kind` está tipado de forma exhaustiva: añadir un tipo de campo a
 * `cms/core/config.ts` sin añadirlo aquí **no compila**. Es la otra mitad de la promesa —que
 * el panel no se quede callado ante algo que no sabe pintar.
 */

/**
 * Tiptap, cargado aparte (SPEC §8: "Tiptap se carga con `dynamic` solo en campos richtext").
 *
 * No es una micro-optimización: el editor de texto rico es la dependencia más pesada del
 * panel, y la mayoría de las secciones no tienen ni un campo de ese tipo. Cargarlo siempre
 * haría lenta la pantalla de SEO por culpa de un campo que no aparece en ella.
 */
const CampoTextoRico = dynamic(
  async () => (await import('./fields/RichTextField')).CampoTextoRico,
  {
    ssr: false,
    loading: () => (
      <div className="h-32 animate-pulse rounded-md border border-slate-200 bg-slate-50" />
    ),
  }
);

export type ValoresDeEntrada = Record<string, unknown>;

export interface EntryFormProps {
  readonly schema: ObjectSchema;
  readonly values: ValoresDeEntrada;
  readonly onChange: (valores: ValoresDeEntrada) => void;
  /** Los errores que devolvió la action, por ruta de campo. */
  readonly errors?: readonly ActionFieldError[] | undefined;
  /** Prefijo de los identificadores, para poder montar dos formularios en una página. */
  readonly idPrefix?: string;
  readonly onElegirImagen?: ((campo: string) => void) | undefined;
}

export function EntryForm({
  schema,
  values,
  onChange,
  errors,
  idPrefix = 'campo',
  onElegirImagen,
}: EntryFormProps) {
  const errorDe = (nombre: string): string | undefined =>
    errors?.find((error) => error.path === nombre)?.message;

  const cambiar = (nombre: string, valor: unknown): void => {
    // Un valor ausente se **quita** del objeto en vez de guardarse como `undefined`. Al
    // serializarlo hacia el servidor, `undefined` desaparece de todas formas; dejarlo aquí
    // solo consigue que el objeto local y el que viaja sean distintos, y ese desajuste es el
    // que hace que una comparación de "¿ha cambiado algo?" mienta.
    const siguiente = { ...values };
    if (valor === undefined) delete siguiente[nombre];
    else siguiente[nombre] = valor;

    onChange(siguiente);
  };

  return (
    <div className="space-y-6">
      {Object.entries(schema.fields).map(([nombre, field]) => (
        <Campo
          key={nombre}
          id={`${idPrefix}-${nombre}`}
          field={field}
          valor={values[nombre]}
          error={errorDe(nombre)}
          onChange={(valor) => {
            cambiar(nombre, valor);
          }}
          {...(onElegirImagen === undefined
            ? {}
            : {
                onElegirImagen: () => {
                  onElegirImagen(nombre);
                },
              })}
        />
      ))}
    </div>
  );
}

interface CampoProps {
  readonly id: string;
  readonly field: AnyField;
  readonly valor: unknown;
  readonly error: string | undefined;
  readonly onChange: (valor: unknown) => void;
  readonly onElegirImagen?: (() => void) | undefined;
}

function Campo({ id, field, valor, error, onChange, onElegirImagen }: CampoProps) {
  switch (field.kind) {
    case 'text':
      return (
        <CampoTexto
          id={id}
          field={field}
          value={valor as string | undefined}
          onChange={onChange}
          error={error}
        />
      );

    case 'richtext':
      // La etiqueta va **fuera** del límite perezoso. Dentro, el campo se quedaría sin nombre
      // durante toda la carga de Tiptap: un cuadro gris sin etiqueta para quien mira, y un
      // control sin nombre accesible para quien usa un lector de pantalla.
      return (
        <FieldShell
          id={id}
          label={field.label}
          help={field.help}
          error={error}
          required={field.required}
        >
          <CampoTextoRico id={id} field={field} value={valor} onChange={onChange} error={error} />
        </FieldShell>
      );

    case 'number':
      return (
        <CampoNumero
          id={id}
          field={field}
          value={valor as number | undefined}
          onChange={onChange}
          error={error}
        />
      );

    case 'boolean':
      return (
        <CampoBooleano
          id={id}
          field={field}
          value={valor as boolean | undefined}
          onChange={onChange}
          error={error}
        />
      );

    case 'select':
      return (
        <CampoSeleccion
          id={id}
          field={field}
          value={valor as string | undefined}
          onChange={onChange}
          error={error}
        />
      );

    case 'link':
      return (
        <CampoEnlace
          id={id}
          field={field}
          value={valor as string | undefined}
          onChange={onChange}
          error={error}
        />
      );

    case 'image':
      return (
        <CampoImagen
          id={id}
          field={field}
          value={valor as ImageValue | undefined}
          onChange={onChange}
          error={error}
          onElegir={onElegirImagen}
        />
      );

    case 'color':
      return (
        <CampoColor
          id={id}
          field={field}
          value={valor as string | undefined}
          onChange={onChange}
          error={error}
        />
      );

    default: {
      // La comprobación de exhaustividad, y no está de adorno: **sin ella el `switch` compila
      // igual con un tipo sin cubrir**, porque un componente de React puede devolver
      // `undefined` y TypeScript lo acepta. Con esto, añadir un tipo de campo a
      // `cms/core/config.ts` sin añadirlo aquí rompe la compilación, que es lo que el
      // comentario de arriba promete.
      //
      // Lo comprobé: la versión anterior, sin `default`, pasaba `typecheck` con un tipo
      // fuera del `switch`.
      const noCubierto: never = field;
      void noCubierto;
      return null;
    }
  }
}
