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
    // Un objeto vacío solo puede fallar el esquema laxo si la config es incoherente, y eso
    // es un fallo del desarrollador que hay que ver al arrancar y no enterrar.
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
