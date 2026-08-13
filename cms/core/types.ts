// isomorphic: solo declaraciones de tipo. Este módulo no emite ni una línea de JavaScript,
// así que puede importarse desde componentes de cliente sin arrastrar nada del servidor.
// Por eso no lleva `server-only`, a diferencia del resto de `cms/core` (SPEC §7.1).
import type appConfig from '@/cms.config';
import type { CollectionDefinition, InferDraft, InferObject, ObjectSchema } from './config';

/**
 * Los tipos que consumen la landing y el panel, ya atados a `cms.config.ts` (SPEC §5.2).
 *
 * La importación del config es `import type`: TypeScript la borra al compilar, así que no
 * hay ciclo en tiempo de ejecución con `cms.config.ts`, que sí importa `cms/core/config`.
 */
type AppConfig = typeof appConfig;

type Singletons = AppConfig['singletons'];
type Collections = AppConfig['collections'];

export type SingletonKey = Extract<keyof Singletons, string>;
export type CollectionKey = Extract<keyof Collections, string>;

/** Cualquier clave de contenido, que es el espacio de `content_entries.key` (SPEC §4). */
export type ContentKey = SingletonKey | CollectionKey;

/**
 * Contenido **publicado** de un singleton: los campos requeridos o con `default` están
 * garantizados, el resto puede faltar (ADR-202).
 */
export type Content<K extends SingletonKey> = Singletons[K] extends ObjectSchema
  ? InferObject<Singletons[K]>
  : never;

/** Borrador de un singleton: todo opcional, porque el editor guarda mientras escribe. */
export type Draft<K extends SingletonKey> = Singletons[K] extends ObjectSchema
  ? InferDraft<Singletons[K]>
  : never;

/** Un elemento publicado de una colección. */
export type CollectionItem<K extends CollectionKey> =
  Collections[K] extends CollectionDefinition<infer F> ? InferObject<ObjectSchema<F>> : never;

/** Un elemento de colección en borrador. */
export type CollectionItemDraft<K extends CollectionKey> =
  Collections[K] extends CollectionDefinition<infer F> ? InferDraft<ObjectSchema<F>> : never;
