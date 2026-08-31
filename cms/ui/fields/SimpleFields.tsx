'use client';

import type {
  BooleanField,
  ColorField,
  LinkField,
  NumberField,
  SelectField,
  TextField,
} from '@/cms/core/config';
import { claseControl, FieldShell, idsDeCampo } from './FieldShell';

/**
 * Los siete campos que no necesitan nada especial (SPEC §5.1).
 *
 * Están juntos en un fichero a propósito: son variaciones de lo mismo, y repartirlos en siete
 * ficheros de veinte líneas obligaría a abrir siete para comparar cómo tratan el valor vacío.
 * El de texto rico sí va aparte, porque arrastra un editor entero.
 *
 * ## La regla del valor vacío, que es la que se hace mal
 *
 * Un campo sin valor manda `undefined`, **nunca cadena vacía**. Con `''` el esquema laxo lo
 * ve como "presente y vacío", y el estricto lo rechaza al publicar con un mensaje que habla
 * de un campo que el editor juraría no haber tocado. `undefined` es "no hay nada", que es lo
 * que de verdad pasa.
 */

export interface CampoProps<F, V> {
  readonly id: string;
  readonly field: F;
  readonly value: V | undefined;
  readonly onChange: (valor: V | undefined) => void;
  readonly error?: string | undefined;
}

/** Convierte lo que escribe el editor en valor o en ausencia. */
function textoOAusencia(valor: string): string | undefined {
  return valor === '' ? undefined : valor;
}

export function CampoTexto({ id, field, value, onChange, error }: CampoProps<TextField, string>) {
  const comunes = {
    id,
    value: value ?? '',
    required: field.required,
    onChange: (evento: { target: { value: string } }) =>
      onChange(textoOAusencia(evento.target.value)),
    className: claseControl(error),
    ...idsDeCampo(id, field.help, error),
  };

  // `maxLength` en el control además de en el esquema: el editor ve que ha llegado al límite
  // mientras escribe, en vez de descubrirlo al publicar.
  const limite = field.max === undefined ? {} : { maxLength: field.max };

  return (
    <FieldShell
      id={id}
      label={field.label}
      help={field.help}
      error={error}
      required={field.required}
    >
      {field.multiline ? (
        <textarea {...comunes} {...limite} rows={4} />
      ) : (
        <input type="text" {...comunes} {...limite} />
      )}
    </FieldShell>
  );
}

export function CampoNumero({
  id,
  field,
  value,
  onChange,
  error,
}: CampoProps<NumberField, number>) {
  return (
    <FieldShell
      id={id}
      label={field.label}
      help={field.help}
      error={error}
      required={field.required}
    >
      <input
        id={id}
        type="number"
        // `value ?? ''` y no `value ?? 0`: un campo vacío no es un cero. Poner cero cambiaría
        // el dato del editor por uno inventado, y en un precio o una valoración eso importa.
        value={value ?? ''}
        required={field.required}
        step={field.integer ? 1 : 'any'}
        {...(field.min === undefined ? {} : { min: field.min })}
        {...(field.max === undefined ? {} : { max: field.max })}
        onChange={(evento) => {
          const texto = evento.target.value;
          if (texto === '') {
            onChange(undefined);
            return;
          }
          const numero = Number(texto);
          // `NaN` no se manda: el esquema lo rechazaría con un mensaje sobre el tipo, y lo que
          // ha pasado es que el campo está a medio escribir.
          if (!Number.isNaN(numero)) onChange(numero);
        }}
        className={claseControl(error)}
        {...idsDeCampo(id, field.help, error)}
      />
    </FieldShell>
  );
}

export function CampoBooleano({
  id,
  field,
  value,
  onChange,
  error,
}: CampoProps<BooleanField, boolean>) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={value ?? false}
          onChange={(evento) => {
            onChange(evento.target.checked);
          }}
          className="h-4 w-4 rounded border-linea text-tinta focus:ring-2 focus:ring-acento"
          {...idsDeCampo(id, field.help, error)}
        />
        <label htmlFor={id} className="text-sm font-medium text-tinta">
          {field.label}
        </label>
      </div>

      {field.help !== undefined && (
        <p id={`${id}-ayuda`} className="text-xs text-tinta-tenue">
          {field.help}
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

export function CampoSeleccion({
  id,
  field,
  value,
  onChange,
  error,
}: CampoProps<SelectField, string>) {
  return (
    <FieldShell
      id={id}
      label={field.label}
      help={field.help}
      error={error}
      required={field.required}
    >
      <select
        id={id}
        value={value ?? ''}
        required={field.required}
        onChange={(evento) => {
          onChange(textoOAusencia(evento.target.value));
        }}
        className={claseControl(error)}
        {...idsDeCampo(id, field.help, error)}
      >
        {/* La opción vacía solo si el campo admite estar vacío. En uno obligatorio sería
            ofrecer una elección que luego se rechaza al publicar. */}
        {!field.required && <option value="">Sin elegir</option>}
        {field.options.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function CampoEnlace({ id, field, value, onChange, error }: CampoProps<LinkField, string>) {
  return (
    <FieldShell
      id={id}
      label={field.label}
      help={field.help}
      error={error}
      required={field.required}
    >
      {/* `type="url"` **no**: aquí caben rutas internas (`/precios`), correos (`mailto:`) y
          teléfonos (`tel:`), y el navegador rechazaría los tres con un mensaje que el editor
          no puede interpretar. El criterio de qué destino vale está en `isSafeLink`, que es el
          mismo que aplica el servidor al guardar. */}
      <input
        id={id}
        type="text"
        inputMode="url"
        value={value ?? ''}
        required={field.required}
        placeholder="/precios, https://… o hola@ejemplo.com"
        onChange={(evento) => {
          onChange(textoOAusencia(evento.target.value));
        }}
        className={claseControl(error)}
        {...idsDeCampo(id, field.help, error)}
      />
    </FieldShell>
  );
}

export function CampoColor({ id, field, value, onChange, error }: CampoProps<ColorField, string>) {
  return (
    <FieldShell
      id={id}
      label={field.label}
      help={field.help}
      error={error}
      required={field.required}
    >
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          // El selector nativo no admite vacío: sin valor enseña negro. Se le da un gris
          // neutro para que no parezca que el editor eligió negro cuando no eligió nada.
          value={value ?? '#64748b'}
          onChange={(evento) => {
            onChange(evento.target.value);
          }}
          className="h-9 w-12 cursor-pointer rounded border border-linea"
          {...idsDeCampo(id, field.help, error)}
        />
        {/* Y el campo de texto al lado, porque un color de marca se copia y se pega, no se
            busca con el ratón. */}
        <input
          type="text"
          aria-label={`${field.label} en formato hexadecimal`}
          value={value ?? ''}
          placeholder="#0f172a"
          onChange={(evento) => {
            onChange(textoOAusencia(evento.target.value));
          }}
          className={claseControl(error)}
        />
      </div>
    </FieldShell>
  );
}
