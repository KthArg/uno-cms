import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { getDb, revisions, users } from '@/cms/db';
import { definicionDeColeccion } from './collections';
import type { AnyField, ObjectSchema } from './config';
import { schemaForType } from './content';

/**
 * La lectura del historial de una entrada (SPEC §4, §9).
 *
 * ## Qué se enseña de cada revisión, y por qué no basta la fecha
 *
 * Una lista de ocho fechas no permite elegir. Quien abre el historial busca "aquella versión en
 * la que el titular decía otra cosa", así que además de cuándo y quién hay que enseñar **algo
 * del contenido**.
 *
 * Se usa el campo que la propia configuración señala como representativo: el `titleField` de
 * una colección (SPEC §5.1: "qué mostrar en la lista del admin") o, en un singleton, su primer
 * campo de texto. No es perfecto —un cambio en otro campo no se distingue— y es infinitamente
 * mejor que ocho filas iguales con horas distintas.
 *
 * El diff visual entre revisiones es post-MVP (issue #15). Esto es lo que se puede dar sin él.
 */

export interface RevisionDelHistorial {
  readonly id: string;
  readonly publishedAt: Date;
  /** Quién publicó esa versión. `null` si la cuenta ya no existe. */
  readonly autor: string | null;
  /** Un fragmento del contenido, para poder distinguir una revisión de otra. */
  readonly resumen: string;
}

/** El campo que mejor representa una entrada en una lista. */
export function campoDeResumen(type: string): string | null {
  const coleccion = definicionDeColeccion(type);
  if (coleccion !== null) return coleccion.titleField;

  const schema: ObjectSchema | null = schemaForType(type);
  if (schema === null) return null;

  // El primer campo de texto del esquema. En un singleton no hay `titleField` que preguntar, y
  // el primer texto es casi siempre el titular — que es lo que alguien recuerda al buscar una
  // versión.
  const primerTexto = Object.entries(schema.fields).find(
    ([, field]) => (field as AnyField).kind === 'text'
  );

  return primerTexto?.[0] ?? null;
}

export function resumenDeRevision(data: unknown, campo: string | null): string {
  if (campo === null || typeof data !== 'object' || data === null) return 'Sin contenido';

  const valor = (data as Record<string, unknown>)[campo];
  if (typeof valor !== 'string' || valor.trim() === '') return 'Sin contenido';

  const limpio = valor.trim();
  return limpio.length > 90 ? `${limpio.slice(0, 90)}…` : limpio;
}

/**
 * Las revisiones de **una** entrada, de la más reciente a la más antigua.
 *
 * El filtro por `entryKey` no es un detalle de rendimiento: sin él se mezclarían las versiones
 * de todas las secciones en la misma lista, y restaurar desde ahí metería el texto de una
 * sección dentro de otra. La action ya lo impide por su lado (#79), pero una pantalla que
 * ofrece lo que la action va a rechazar es una pantalla que miente.
 */
export async function listRevisions(key: string, type: string): Promise<RevisionDelHistorial[]> {
  const campo = campoDeResumen(type);

  const filas = await getDb()
    .select({
      id: revisions.id,
      data: revisions.data,
      publishedAt: revisions.publishedAt,
      autorEmail: users.email,
      autorNombre: users.name,
    })
    .from(revisions)
    .leftJoin(users, eq(revisions.publishedBy, users.id))
    .where(eq(revisions.entryKey, key))
    .orderBy(desc(revisions.publishedAt), desc(revisions.id));

  return filas.map((fila) => ({
    id: fila.id,
    publishedAt: fila.publishedAt,
    // La cuenta puede haberse borrado —`publishedBy` es `set null`— y eso no puede dejar la
    // fila sin nada que decir.
    autor: fila.autorNombre ?? fila.autorEmail ?? null,
    resumen: resumenDeRevision(fila.data, campo),
  }));
}
