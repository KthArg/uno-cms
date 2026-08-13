import 'server-only';

/**
 * `defineConfig` y `s.*`: el contrato del desarrollador (SPEC §5.1).
 *
 * De este módulo se derivan los formularios del panel, los dos esquemas Zod, los tipos que
 * consume la landing y el seed inicial. Es el único fichero que un desarrollador edita para
 * modelar contenido, así que los errores se detectan aquí y con mensajes que nombran el
 * campo concreto.
 *
 * Es `server-only` pese a que el panel necesita los descriptores para pintar formularios:
 * el generador de formularios es un componente de servidor que los pasa como props a los
 * campos de cliente (SPEC §8, "el visitante jamás descarga código del panel"). Los tipos sí
 * viajan al cliente, pero los tipos se borran al compilar.
 */

// ── Valores ──────────────────────────────────────────────────────────────────────────────

/** Marca de ProseMirror. La allowlist la aplica `schema-gen`, no este módulo. */
export interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichTextNode {
  type: string;
  text?: string;
  marks?: RichTextMark[];
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
}

export interface RichTextDoc {
  type: 'doc';
  content: RichTextNode[];
}

/** Lo que guarda un campo `image` (SPEC §5.1). */
export interface ImageValue {
  mediaId: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

export type FieldKind =
  'text' | 'richtext' | 'number' | 'boolean' | 'select' | 'link' | 'image' | 'color';

// ── Descriptores de campo ────────────────────────────────────────────────────────────────

/**
 * `Present` responde a "¿este campo tiene siempre valor?", que es `required: true` o tener
 * `default` (ADR-202). De ahí salen tanto la opcionalidad del tipo como el esquema estricto.
 *
 * `__value` y `__present` son marcadores de solo tipo: **no existen en tiempo de ejecución**.
 * Llevan `?` para no tener que fabricar un valor falso en cada constructor.
 */
interface FieldCommon<Kind extends FieldKind, Value, Present extends boolean> {
  readonly kind: Kind;
  readonly label: string;
  readonly help?: string;
  readonly required: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: Value;
  readonly __value?: Value;
  readonly __present?: Present;
}

export interface TextField<P extends boolean = boolean> extends FieldCommon<'text', string, P> {
  readonly multiline: boolean;
  readonly min?: number;
  readonly max?: number;
}

export type RichTextField<P extends boolean = boolean> = FieldCommon<'richtext', RichTextDoc, P>;

export interface NumberField<P extends boolean = boolean> extends FieldCommon<'number', number, P> {
  readonly min?: number;
  readonly max?: number;
  readonly integer: boolean;
}

export type BooleanField<P extends boolean = boolean> = FieldCommon<'boolean', boolean, P>;

export interface SelectOption<V extends string = string> {
  readonly value: V;
  readonly label: string;
}

export interface SelectField<
  V extends string = string,
  P extends boolean = boolean,
> extends FieldCommon<'select', V, P> {
  readonly options: readonly SelectOption<V>[];
}

export type LinkField<P extends boolean = boolean> = FieldCommon<'link', string, P>;

export interface ImageField<P extends boolean = boolean> extends FieldCommon<
  'image',
  ImageValue,
  P
> {
  /** Una imagen decorativa no exige `alt` (SPEC §8). El resto sí, siempre. */
  readonly decorative: boolean;
}

export type ColorField<P extends boolean = boolean> = FieldCommon<'color', string, P>;

export type AnyField =
  | TextField
  | RichTextField
  | NumberField
  | BooleanField
  | SelectField
  | LinkField
  | ImageField
  | ColorField;

// ── Opciones de los constructores ────────────────────────────────────────────────────────

interface CommonOptions {
  /** Lo que ve el editor. Obligatoria: sin ella el panel mostraría el nombre técnico. */
  readonly label: string;
  readonly help?: string;
  readonly required?: boolean;
}

export interface TextOptions extends CommonOptions {
  readonly default?: string;
  readonly multiline?: boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface RichTextOptions extends CommonOptions {
  readonly default?: RichTextDoc;
}

export interface NumberOptions extends CommonOptions {
  readonly default?: number;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export interface BooleanOptions extends CommonOptions {
  readonly default?: boolean;
}

export interface SelectOptions<V extends string> extends CommonOptions {
  readonly options: readonly SelectOption<V>[];
  readonly default?: V;
}

export interface LinkOptions extends CommonOptions {
  readonly default?: string;
}

export interface ImageOptions extends CommonOptions {
  readonly decorative?: boolean;
}

export interface ColorOptions extends CommonOptions {
  readonly default?: string;
}

/** ADR-202: un campo tiene siempre valor si es requerido o si trae `default`. */
type Presence<O> = O extends { required: true }
  ? true
  : O extends { default: unknown }
    ? true
    : false;

// ── Constructores (`s.*`) ────────────────────────────────────────────────────────────────

interface CommonParts {
  label: string;
  help?: string;
  required: boolean;
  hasDefault: boolean;
}

function base<O extends CommonOptions>(options: O): CommonParts {
  const common: CommonParts = {
    label: options.label,
    required: options.required === true,
    // El criterio es la PRESENCIA de la clave, igual que `Presence<O>` en el tipo. Con
    // `!== undefined`, un `{ default: undefined }` daría `hasDefault: false` mientras el
    // tipo afirma que el campo siempre tiene valor: tipo y ejecución discreparían justo en
    // el módulo que existe para que no discrepen.
    hasDefault: 'default' in options,
  };
  if (options.help !== undefined) common.help = options.help;
  return common;
}

function text<const O extends TextOptions>(options: O): TextField<Presence<O>> {
  return {
    kind: 'text',
    ...base(options),
    multiline: options.multiline === true,
    ...(options.min !== undefined ? { min: options.min } : {}),
    ...(options.max !== undefined ? { max: options.max } : {}),
    ...(options.default !== undefined ? { defaultValue: options.default } : {}),
  };
}

function richtext<const O extends RichTextOptions>(options: O): RichTextField<Presence<O>> {
  return {
    kind: 'richtext',
    ...base(options),
    ...(options.default !== undefined ? { defaultValue: options.default } : {}),
  };
}

function number<const O extends NumberOptions>(options: O): NumberField<Presence<O>> {
  return {
    kind: 'number',
    ...base(options),
    integer: options.integer === true,
    ...(options.min !== undefined ? { min: options.min } : {}),
    ...(options.max !== undefined ? { max: options.max } : {}),
    ...(options.default !== undefined ? { defaultValue: options.default } : {}),
  };
}

function boolean<const O extends BooleanOptions>(options: O): BooleanField<Presence<O>> {
  return {
    kind: 'boolean',
    ...base(options),
    ...(options.default !== undefined ? { defaultValue: options.default } : {}),
  };
}

function select<const O extends SelectOptions<string>>(
  options: O
): SelectField<O['options'][number]['value'], Presence<O>> {
  return {
    kind: 'select',
    ...base(options),
    options: options.options,
    ...(options.default !== undefined ? { defaultValue: options.default } : {}),
  };
}

function link<const O extends LinkOptions>(options: O): LinkField<Presence<O>> {
  return {
    kind: 'link',
    ...base(options),
    ...(options.default !== undefined ? { defaultValue: options.default } : {}),
  };
}

function image<const O extends ImageOptions>(options: O): ImageField<Presence<O>> {
  return {
    kind: 'image',
    ...base(options),
    decorative: options.decorative === true,
  };
}

function color<const O extends ColorOptions>(options: O): ColorField<Presence<O>> {
  return {
    kind: 'color',
    ...base(options),
    ...(options.default !== undefined ? { defaultValue: options.default } : {}),
  };
}

export interface ObjectSchema<F extends Record<string, AnyField> = Record<string, AnyField>> {
  readonly kind: 'object';
  readonly fields: F;
}

function object<F extends Record<string, AnyField>>(fields: F): ObjectSchema<F> {
  return { kind: 'object', fields };
}

/** El namespace que importa `cms.config.ts` (SPEC §5.1). */
export const s = {
  text,
  richtext,
  number,
  boolean,
  select,
  link,
  image,
  color,
  object,
} as const;

// ── Inferencia de tipos ──────────────────────────────────────────────────────────────────

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type FieldValue<F> = F extends { readonly __value?: infer V }
  ? Exclude<V, undefined>
  : never;

export type IsPresent<F> = F extends { readonly __present?: infer P }
  ? [Exclude<P, undefined>] extends [true]
    ? true
    : false
  : false;

type PresentKeys<F extends Record<string, AnyField>> = {
  [K in keyof F]: IsPresent<F[K]> extends true ? K : never;
}[keyof F];

/**
 * Valor de un objeto **tal y como queda tras superar el esquema estricto**: los campos
 * presentes están, los demás pueden faltar. Es el tipo que ve la landing, que solo lee
 * contenido publicado (ADR-202).
 */
export type InferObject<S> =
  S extends ObjectSchema<infer F>
    ? Prettify<
        { [K in PresentKeys<F>]: FieldValue<F[K]> } & {
          [K in Exclude<keyof F, PresentKeys<F>>]?: FieldValue<F[K]>;
        }
      >
    : never;

/** Valor de un borrador: todo opcional, porque el editor guarda mientras escribe. */
export type InferDraft<S> =
  S extends ObjectSchema<infer F> ? Prettify<{ [K in keyof F]?: FieldValue<F[K]> }> : never;

// ── Configuración ────────────────────────────────────────────────────────────────────────

export interface CollectionDefinition<
  F extends Record<string, AnyField> = Record<string, AnyField>,
> {
  readonly label: string;
  /** Qué campo se muestra en la lista del admin (SPEC §5.1). */
  readonly titleField: Extract<keyof F, string>;
  readonly schema: ObjectSchema<F>;
}

/**
 * `C` va sin restricción a propósito. La restricción vive en `defineConfig`, donde es
 * autorreferente para poder atar `titleField` a los campos de su propio esquema; un tipo
 * así no es asignable a `Record<string, CollectionDefinition>` desde el punto de vista de
 * TypeScript, aunque lo sea en la práctica.
 */
export interface CmsConfig<
  S extends Record<string, ObjectSchema> = Record<string, ObjectSchema>,
  C = Record<string, CollectionDefinition>,
> {
  readonly siteName: string;
  readonly singletons: S;
  readonly collections: C;
}

/**
 * Cada colección se compara consigo misma, no con `CollectionDefinition` genérico. Sin
 * esto, `titleField` degenera en `string` y un nombre de campo inexistente solo se detecta
 * al arrancar, no al compilar.
 */
type CollectionsOf<C> = {
  readonly [K in keyof C]: C[K] extends { readonly schema: ObjectSchema<infer F> }
    ? CollectionDefinition<F>
    : never;
};

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

const KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

function validateSchema(where: string, schema: ObjectSchema): void {
  for (const [fieldName, field] of Object.entries(schema.fields)) {
    const at = `${where}.${fieldName}`;

    // ADR-202: la combinación no tiene sentido y aceptarla en silencio dejaría al
    // desarrollador creyendo que ha marcado algo como obligatorio.
    if (field.required && field.hasDefault) {
      throw new ConfigError(
        `${at}: un campo no puede ser 'required' y tener 'default' a la vez. ` +
          `El valor por defecto satisface siempre el requisito, así que 'required' no haría nada.`
      );
    }

    if (field.kind === 'select' && field.options.length === 0) {
      throw new ConfigError(`${at}: un campo 'select' necesita al menos una opción.`);
    }
  }
}

function validateKey(kind: 'singleton' | 'colección', key: string): void {
  // Las claves de los items de colección son `coleccion.nanoid` (SPEC §5.3, `createItem`).
  // Un punto en el nombre haría ambigua esa clave al partirla.
  if (!KEY_PATTERN.test(key)) {
    throw new ConfigError(
      `${key}: nombre de ${kind} inválido. Se permiten minúsculas, dígitos y guiones, ` +
        `empezando por letra. En particular, el punto está prohibido porque separa la ` +
        `colección del identificador del item.`
    );
  }
}

export function defineConfig<
  const S extends Record<string, ObjectSchema>,
  const C extends CollectionsOf<C>,
>(input: {
  readonly siteName: string;
  readonly singletons: S;
  readonly collections?: C;
}): CmsConfig<S, C> {
  // La restricción autorreferente de `C` da la comprobación de `titleField` en compilación,
  // pero deja a TypeScript sin poder ver `C` como un registro corriente aquí dentro. La
  // conversión es local y su garantía la aporta la propia restricción.
  const declared = (input.collections ?? {}) as Record<string, CollectionDefinition>;

  for (const [key, schema] of Object.entries(input.singletons)) {
    validateKey('singleton', key);
    validateSchema(key, schema);
  }

  for (const [key, definition] of Object.entries(declared)) {
    validateKey('colección', key);
    validateSchema(key, definition.schema);

    if (!(definition.titleField in definition.schema.fields)) {
      throw new ConfigError(
        `${key}.titleField: '${definition.titleField}' no es un campo de esta colección. ` +
          `Campos disponibles: ${Object.keys(definition.schema.fields).join(', ') || '(ninguno)'}.`
      );
    }
  }

  // Singletons y colecciones comparten el espacio de claves de `content_entries` (SPEC §4).
  const collision = Object.keys(input.singletons).find((key) => key in declared);
  if (collision !== undefined) {
    throw new ConfigError(
      `'${collision}' está declarado a la vez como singleton y como colección. ` +
        `Ambos comparten el espacio de claves de la base de datos.`
    );
  }

  return {
    siteName: input.siteName,
    singletons: input.singletons,
    collections: (input.collections ?? {}) as C,
  };
}
