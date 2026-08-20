import 'server-only';
import { z } from 'zod';
import type { AnyField, ObjectSchema } from './config';
import { isSafeLink, allowedLinkProtocols } from '@/cms/links';
import { richTextDocSchema, richTextHasContent } from './richtext';

/**
 * De `cms.config.ts` a Zod (SPEC §5.1): dos esquemas por objeto.
 *
 * - **laxo**: para guardar borradores. Todo opcional, pero con el tipo correcto. Existe
 *   porque el editor guarda mientras escribe (autosave de SPEC §8) y un borrador a medias
 *   tiene que poder guardarse.
 * - **estricto**: la puerta de publicación. Los campos requeridos deben estar **y no estar
 *   vacíos**, para que `publish` pueda devolver `VALIDATION_FAILED` con la lista de campos
 *   por completar (SPEC §5.3, §9).
 *
 * La regla de presencia es única y está en ADR-202. Aquí solo se aplica.
 */

export type SchemaMode = 'draft' | 'strict';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** El valor de un `image` (SPEC §5.1). */
const imageValueSchema = z.object({
  mediaId: z.string(),
  url: z.string(),
  alt: z.string(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

/**
 * El esquema del **tipo** del campo, sin considerar presencia. Es lo que comparten el laxo y
 * el estricto: guardar un borrador con un número donde va un texto tampoco vale.
 */
function typeSchema(field: AnyField): z.ZodTypeAny {
  switch (field.kind) {
    case 'text': {
      let schema = z.string();
      if (field.min !== undefined) schema = schema.min(field.min);
      if (field.max !== undefined) schema = schema.max(field.max);
      return schema;
    }

    case 'richtext':
      return richTextDocSchema;

    case 'number': {
      let schema = field.integer ? z.number().int() : z.number();
      if (field.min !== undefined) schema = schema.min(field.min);
      if (field.max !== undefined) schema = schema.max(field.max);
      return schema;
    }

    case 'boolean':
      return z.boolean();

    case 'select': {
      const values = field.options.map((option) => option.value);
      // `z.enum` exige al menos un valor; `defineConfig` ya rechaza un select sin opciones.
      return z.string().refine((value) => values.includes(value), {
        message: `Valor no válido. Opciones: ${values.join(', ')}.`,
      });
    }

    case 'link':
      return z.string().refine(isSafeLink, {
        message: `El enlace debe ser una ruta interna o usar uno de estos protocolos: ${allowedLinkProtocols.join(', ')}.`,
      });

    case 'image':
      return field.decorative
        ? imageValueSchema
        : // SPEC §8: "el editor exige `alt` (campo obligatorio en `s.image` salvo
          // `decorative: true`)". Se exige aquí y no solo en el formulario, para que
          // ninguna ruta de escritura pueda saltárselo.
          imageValueSchema.refine((value) => value.alt.trim() !== '', {
            path: ['alt'],
            message: 'Describe la imagen para quien no puede verla.',
          });

    case 'color':
      return z.string().regex(HEX_COLOR, 'Usa un color en formato #rgb, #rrggbb o #rrggbbaa.');
  }
}

/**
 * Si un valor **presente** cuenta como relleno (ADR-202).
 *
 * `boolean` y `number` se satisfacen con estar presentes: `false` y `0` son valores
 * legítimos. Aplicarles una comprobación de veracidad haría imposible publicar un booleano
 * obligatorio en `false` o una valoración de cero.
 */
function isFilled(field: AnyField, value: unknown): boolean {
  switch (field.kind) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'richtext':
      return richTextHasContent(value);
    case 'image':
      return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { url?: unknown }).url === 'string' &&
        (value as { url: string }).url !== ''
      );
    default:
      return typeof value === 'string' && value.trim() !== '';
  }
}

function fieldSchema(field: AnyField, mode: SchemaMode): z.ZodTypeAny {
  const base = typeSchema(field);

  // Un campo requerido en modo estricto no admite ausencia, así que no se le pone ni
  // `.optional()` ni `.default()`.
  //
  // Que eso sea correcto depende de ADR-202: `required` y `default` juntos están prohibidos
  // y `defineConfig` los rechaza al construir la config. Sin esa garantía, este camino
  // ignoraría el default en silencio. La dependencia entre módulos se nombra aquí a
  // propósito: si algún día se relaja ADR-202, hay que volver a esta función.
  if (mode === 'strict' && field.required) {
    // El mensaje es el que verá el editor al intentar publicar (SPEC §9), así que nombra el
    // campo por su etiqueta y no por su clave técnica.
    return base.refine((value) => isFilled(field, value), {
      message: `Completa «${field.label}» antes de publicar.`,
    });
  }

  // El default se aplica en los demás casos: es lo que hace que un campo con `default` esté
  // siempre presente en la salida, que es lo que promete el tipo inferido.
  return field.hasDefault ? base.default(field.defaultValue) : base.optional();
}

/**
 * Construye el esquema Zod de un objeto de `cms.config.ts`.
 *
 * `strict()` y no `passthrough()`: una clave que no está en la config es basura, y dejarla
 * pasar significaría guardar en JSONB campos que ningún formulario puede volver a editar.
 */
export function buildObjectSchema(
  schema: ObjectSchema,
  mode: SchemaMode
): z.ZodObject<Record<string, z.ZodTypeAny>, 'strict'> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, field] of Object.entries(schema.fields)) {
    shape[name] = fieldSchema(field, mode);
  }

  return z.object(shape).strict();
}

/** El esquema con el que se guardan borradores incompletos. */
export function draftSchema(schema: ObjectSchema) {
  return buildObjectSchema(schema, 'draft');
}

/** El esquema que hay que superar para publicar. */
export function strictSchema(schema: ObjectSchema) {
  return buildObjectSchema(schema, 'strict');
}
