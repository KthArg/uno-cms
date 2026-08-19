import 'server-only';
import appConfig from '@/cms.config';
import { contentEntries, getDb } from '@/cms/db';
import type { ObjectSchema } from './config';
import { draftSchema } from './schema-gen';
import type { SingletonKey } from './types';

/**
 * Seed de singletons (SPEC §5.1: "al arrancar, cada singleton sin fila en BD se crea con
 * valores vacíos/default").
 *
 * **Idempotente y no destructivo.** Es el requisito central, no un detalle: esta función se
 * ejecutará en cada arranque, y un seed que sobreescribiera un borrador existente
 * destruiría trabajo del editor sin dejar rastro. Por eso la inserción usa
 * `on conflict do nothing` sobre el índice único de `key` en vez de leer y luego decidir:
 * la comprobación y la escritura ocurren en la misma sentencia, así que dos arranques
 * simultáneos —dos instancias serverless, por ejemplo— no pueden pisarse.
 *
 * **No destructivo no es lo mismo que todo o nada.** Las filas van en un solo `INSERT`, que
 * es atómico: si una fallara por algo que no sea el conflicto de clave —una violación del
 * `CHECK` de `status`, digamos— **no se inserta ninguna**, y `created` vendría vacío sin
 * distinguirlo de "ya estaban todas". Hoy no puede ocurrir, porque los valores que se
 * insertan son constantes de este módulo; empezará a poder ocurrir el día que un singleton
 * traiga un `default` que no valide, y entonces hay que separar la inserción por fila.
 *
 * El borrador sembrado **no pasa el esquema estricto** si el singleton tiene campos
 * requeridos sin `default`, y eso es lo correcto: es un borrador vacío, todavía no
 * publicable. El primer `VALIDATION_FAILED` justo después de sembrar parece un seed roto y
 * no lo es.
 */

export interface SeedResult {
  /** Claves de los singletons que no existían y se han creado. */
  readonly created: string[];
  /** Claves que ya tenían fila y se han dejado intactas. */
  readonly untouched: string[];
}

/**
 * El borrador inicial de un singleton: el resultado de aplicar los `default` de la config
 * sobre un objeto vacío. Se hace con el esquema **laxo**, que es el que admite ausencias.
 */
function initialDraft(key: SingletonKey): Record<string, unknown> {
  const schema: ObjectSchema = appConfig.singletons[key];
  const parsed = draftSchema(schema).safeParse({});
  if (!parsed.success) {
    // Que la clave exista lo garantiza el tipo `SingletonKey`, así que aquí solo se llega
    // si un `default` de cms.config.ts no pasa su propio esquema. Es un fallo del
    // desarrollador que hay que ver al arrancar, no enterrar.
    throw new Error(
      `El borrador inicial de '${key}' no pasa su propio esquema laxo. ` +
        `Revisa los valores por defecto en cms.config.ts. Detalle: ${parsed.error.message}`
    );
  }

  return parsed.data as Record<string, unknown>;
}

export async function seedSingletons(): Promise<SeedResult> {
  const keys = Object.keys(appConfig.singletons) as SingletonKey[];
  if (keys.length === 0) return { created: [], untouched: [] };

  const inserted = await getDb()
    .insert(contentEntries)
    .values(
      keys.map((key) => ({
        key,
        type: key, // en un singleton, el tipo es su propio nombre (SPEC §4)
        draft: initialDraft(key),
        published: null,
        status: 'draft' as const,
        version: 0,
      }))
    )
    .onConflictDoNothing({ target: contentEntries.key })
    .returning({ key: contentEntries.key });

  const created = inserted.map((row) => row.key);
  const createdSet = new Set(created);

  return {
    created,
    untouched: keys.filter((key) => !createdSet.has(key)),
  };
}

/**
 * Crea la fila de un singleton si no la tiene, y devuelve si la ha creado.
 *
 * ## El fallo que esto arregla, y por qué no se arregló al arrancar
 *
 * `SPEC.md` §5.1 dice que los singletons se crean "al arrancar", y `seedSingletons` hace
 * exactamente eso… pero **no lo llamaba nadie**. En un despliegue recién hecho el panel
 * listaba las secciones —eso funciona, porque la lectura resuelve valores vacíos (ADR-404)— y
 * al pulsar cualquiera daba 404. El CMS se instalaba y no se podía editar nada.
 *
 * No lo encontró una revisión: lo encontró el primer e2e que abrió el editor contra una base
 * de datos limpia. Una función probada y no llamada pasa todos los tests que tiene.
 *
 * El sitio natural parecía `instrumentation.ts`, el único gancho de arranque de Next. No vale:
 * Next lo compila **también para el runtime de edge** —hay middleware— y el compilador sigue
 * los imports aunque dentro haya un guard que impida ejecutarlos. El driver de Postgres usa
 * `path`, `fs` y `stream`, que en edge no existen, y la compilación falla entera. Probado con
 * el guard, con el fichero separado que documenta Next y con `serverExternalPackages`.
 *
 * Así que la fila se crea **cuando hace falta**, que además cubre un caso que el arranque no
 * cubriría: añadir un singleton a `cms.config.ts` en un despliegue que ya está en marcha, que
 * es una operación normal y no un caso raro.
 *
 * Sí, es una escritura durante una lectura. Es idempotente —`on conflict do nothing`—, ocurre
 * en el panel y no en la landing, y la alternativa es un CMS que se instala y no se puede
 * usar.
 */
export async function ensureSingletonRow(key: string): Promise<boolean> {
  if (!Object.hasOwn(appConfig.singletons, key)) return false;

  const creadas = await getDb()
    .insert(contentEntries)
    .values({
      key,
      type: key,
      draft: initialDraft(key as SingletonKey),
      published: null,
      status: 'draft' as const,
      version: 0,
    })
    .onConflictDoNothing({ target: contentEntries.key })
    .returning({ key: contentEntries.key });

  return creadas.length > 0;
}
