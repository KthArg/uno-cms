import 'server-only';
import { lt } from 'drizzle-orm';
import { auditLog, getDb } from '@/cms/db';

/**
 * Registro de auditoría (SPEC §4, tabla `audit_log`).
 *
 * Tres propiedades que no son opcionales:
 *
 * 1. **No tumba la operación.** Que el registro falle no puede impedir que alguien inicie
 *    sesión o publique. Pero el fallo se hace visible en los logs: una auditoría que se cae
 *    en silencio es peor que no tenerla, porque deja creer que hay rastro cuando no lo hay.
 * 2. **No guarda secretos.** Los metadatos vienen de quien llama, y quien llama se equivoca:
 *    pasar el cuerpo entero de una petición de login es el error natural. Se limpian aquí,
 *    en el único sitio por el que pasan todos.
 * 3. **No guarda la IP completa.** Un registro con IP completa es un registro de datos
 *    personales, con las obligaciones que eso trae. Truncada sigue sirviendo para lo que se
 *    usa —ver de dónde vienen los intentos— y deja de identificar a una persona.
 */

/** SPEC §4: "Retención: 90 días (job de poda perezoso al escribir)". */
export const RETENTION_DAYS = 90;

/** Cada cuánto, como mucho, se intenta podar. Ver `maybePrune`. */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export type AuditTargetType = 'content' | 'media' | 'user' | 'settings';

export interface AuditEvent {
  /** Por ejemplo login.success, login.fail o content.publish (SPEC §4). */
  readonly action: string;
  readonly actorId?: string | null;
  /** Desnormalizado a propósito: el rastro sobrevive al borrado del usuario (SPEC §4). */
  readonly actorEmail?: string | null;
  readonly targetType?: AuditTargetType;
  readonly targetId?: string;
  readonly meta?: Record<string, unknown>;
  readonly ip?: string;
  readonly userAgent?: string;
}

/**
 * Claves cuyo valor nunca se guarda.
 *
 * Se compara por inclusión y sin distinguir mayúsculas, para que `passwordConfirm`,
 * `newPassword` y `PASSWORD` caigan igual. Es deliberadamente amplia: el coste de redactar
 * de más es perder un dato de depuración; el de redactar de menos es una contraseña en
 * texto plano en la base de datos, esperando a que alguien lea la tabla.
 */
const SENSITIVE_KEY_PARTS = [
  'password',
  'contrasena',
  'contraseña',
  'clave',
  'token',
  'secret',
  'secreto',
  'authorization',
  'cookie',
  'hash',
  'apikey',
  'api_key',
  'credential',
];

const REDACTED = '[redactado]';

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => lower.includes(part));
}

/**
 * Limpia los metadatos antes de guardarlos.
 *
 * Recorre en profundidad porque el error típico no es pasar un objeto con la clave
 * `password` arriba del todo, sino pasar el cuerpo entero de la petición y que la
 * contraseña vaya tres niveles más abajo.
 *
 * La profundidad está acotada: un objeto absurdamente anidado convertiría el registro de
 * auditoría en una forma de tumbar el proceso desde fuera.
 */
export function scrubMeta(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[demasiado anidado]';

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => scrubMeta(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      result[key] = isSensitiveKey(key) ? REDACTED : scrubMeta(item, depth + 1);
    }

    return result;
  }

  // Las cadenas se recortan: un metadato de un megabyte es una forma barata de llenar la
  // base de datos escribiendo en un formulario.
  if (typeof value === 'string' && value.length > 500) {
    return value.slice(0, 500) + '…[recortado]';
  }

  return value;
}

const IPV4_PATTERN = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX_GROUP_PATTERN = /^[0-9a-fA-F]{1,4}$/;

/**
 * Trunca la IP: IPv4 al /24, IPv6 al /64 (spec de fase §4.4, T-58-3).
 *
 * Devuelve `undefined` ante algo que no reconoce, en vez de guardarlo tal cual: si no se
 * sabe truncar, no se sabe que no identifique a nadie.
 */
export function truncateIp(ip: unknown): string | undefined {
  if (typeof ip !== 'string' || ip === '') return undefined;

  const value = ip.trim();

  // IPv4, incluida la forma mapeada en IPv6 que usan algunos proxies.
  const v4 = IPV4_PATTERN.exec(value);
  if (v4 !== null) {
    const parts = [v4[1], v4[2], v4[3], v4[4]].map(Number);
    if (parts.some((part) => Number.isNaN(part) || part > 255)) return undefined;
    return parts[0] + '.' + parts[1] + '.' + parts[2] + '.0';
  }

  if (value.includes(':')) {
    // El /64 son los cuatro primeros grupos. La forma abreviada se expande antes, para no
    // cortar por el sitio equivocado.
    const groups = expandIpv6(value);
    if (groups === undefined) return undefined;
    return groups.slice(0, 4).join(':') + '::';
  }

  return undefined;
}

function expandIpv6(value: string): string[] | undefined {
  const halves = value.split('::');
  if (halves.length > 2) return undefined;

  const first = halves[0] ?? '';
  const second = halves[1] ?? '';

  const head = first === '' ? [] : first.split(':');
  const tail = halves.length === 2 && second !== '' ? second.split(':') : [];

  if (halves.length === 1) {
    return head.length === 8 && head.every(isHexGroup) ? head : undefined;
  }

  const missing = 8 - head.length - tail.length;
  if (missing < 0) return undefined;

  const groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  return groups.every(isHexGroup) ? groups : undefined;
}

function isHexGroup(group: string): boolean {
  return HEX_GROUP_PATTERN.test(group);
}

/**
 * Poda perezosa (SPEC §4).
 *
 * Se intenta como mucho una vez por hora y **nunca antes de escribir el evento**: si podara
 * primero, un fallo de poda haría perder el registro, que es justo lo contrario de lo que
 * se quiere de una auditoría.
 */
let lastPruneAt = 0;

export async function maybePrune(now: () => number = Date.now): Promise<number> {
  const current = now();
  if (current - lastPruneAt < PRUNE_INTERVAL_MS) return 0;
  lastPruneAt = current;

  const cutoff = new Date(current - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await getDb()
    .delete(auditLog)
    .where(lt(auditLog.createdAt, cutoff))
    .returning({ id: auditLog.id });

  return deleted.length;
}

/** Solo para tests: permite volver a disparar la poda sin esperar una hora. */
export function resetPruneClockForTests(): void {
  lastPruneAt = 0;
}

export interface AuditOptions {
  readonly now?: () => number;
  readonly log?: (message: string, error: unknown) => void;
}

/**
 * Registra un evento. **Nunca lanza.**
 *
 * La operación que audita ya ha ocurrido o está a punto de ocurrir; que el registro falle no
 * puede deshacerla ni impedirla. Pero el fallo se escribe en el log de la plataforma, porque
 * una auditoría que se cae en silencio deja creer que hay rastro cuando no lo hay.
 */
export async function audit(event: AuditEvent, options: AuditOptions = {}): Promise<void> {
  const log = options.log ?? ((message, error) => console.error(message, error));

  // La limpieza va en su propio try, aparte del insert. Si falla —un objeto con un getter
  // que lanza, por ejemplo— se pierde el CONTEXTO, no el evento: la acción, el actor y la
  // fecha valen aunque los metadatos se caigan. Un `login.fail` que no se registra porque
  // alguien metió un objeto raro en el contexto es justo el evento que no se puede perder.
  let meta: Record<string, unknown>;
  try {
    meta = {
      ...(event.meta === undefined ? {} : (scrubMeta(event.meta) as Record<string, unknown>)),
    };

    const ip = truncateIp(event.ip);
    if (ip !== undefined) meta['ip'] = ip;
    if (event.userAgent !== undefined) meta['userAgent'] = scrubMeta(event.userAgent);
  } catch (error) {
    log('[audit] No se pudieron limpiar los metadatos; se registra el evento sin ellos.', error);
    meta = { metaDescartada: true };
  }

  try {
    await getDb()
      .insert(auditLog)
      .values({
        action: event.action,
        actorId: event.actorId ?? null,
        actorEmail: event.actorEmail ?? null,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        meta: Object.keys(meta).length > 0 ? meta : null,
      });
  } catch (error) {
    log('[audit] No se pudo registrar el evento; la operación continúa.', error);
    return;
  }

  try {
    await maybePrune(options.now);
  } catch (error) {
    log('[audit] Falló la poda de registros antiguos.', error);
  }
}
