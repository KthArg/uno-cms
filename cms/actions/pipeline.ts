import 'server-only';
import type { z } from 'zod';
import { audit, type AuditTargetType } from '@/cms/security/audit';
import { createRateLimiter, type RateLimiter } from '@/cms/security/ratelimit';

/**
 * El envoltorio por el que pasa **toda** server action (SPEC §5.3).
 *
 * El pipeline y su orden los fija la spec:
 *
 * ```
 * requireSession(role) → rateLimit(bucket, actorId) → zodValidate(input)
 *   → lógica en transacción → audit() → revalidateTag() si aplica
 * ```
 *
 * El orden no es estético y está justificado en `docs/specs/03-actions.md` §3.1. En corto:
 * la sesión primero porque cualquier trabajo previo lo provoca un anónimo; el límite antes
 * de Zod porque validar cuesta CPU y si no se salta enviando payloads caros y malformados;
 * Zod antes de la transacción para no ocupar una conexión con input que no vale.
 *
 * ## Por qué un envoltorio y no "acordarse" en cada action
 *
 * `SPEC.md` §7.1 pide "chequeo de rol en cada action (server), no solo en UI". Un
 * envoltorio convierte ese "en cada" en algo verificable: hay un test que recorre este
 * módulo y **falla si alguna action exportada no pasa por aquí**. Sin él, la mitigación
 * depende de que nadie se despiste, y la primera action de M4 la reabriría sin que nadie
 * lo notara.
 */

export type ActionErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'VERSION_CONFLICT'
  | 'NEVER_PUBLISHED'
  | 'LAST_ADMIN'
  | 'CONFLICT'
  | 'INTERNAL';

export interface ActionFieldError {
  /** Ruta del campo dentro del objeto de contenido. */
  readonly path: string;
  /** Lo que ve el editor, ya en español llano. */
  readonly message: string;
}

export type ActionResult<T = undefined> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code: ActionErrorCode;
      readonly message: string;
      /** Solo en `VALIDATION_FAILED`: qué campos hay que completar (SPEC §9). */
      readonly fields?: readonly ActionFieldError[];
    };

/**
 * Mensajes por defecto, en español llano y dirigidos al editor (SPEC §9).
 *
 * Ninguno menciona tablas, versiones ni transacciones: quien los lee está intentando
 * publicar un texto, no depurar una base de datos.
 */
const DEFAULT_MESSAGES: Record<ActionErrorCode, string> = {
  UNAUTHORIZED: 'Inicia sesión para continuar.',
  FORBIDDEN: 'No tienes permiso para hacer esto.',
  NOT_FOUND: 'No hemos encontrado eso.',
  RATE_LIMITED: 'Has hecho demasiadas operaciones seguidas. Espera un momento.',
  VALIDATION_FAILED: 'Revisa los campos marcados.',
  VERSION_CONFLICT: 'Otra persona guardó cambios mientras editabas.',
  NEVER_PUBLISHED: 'Esta sección todavía no se ha publicado nunca.',
  LAST_ADMIN: 'No puedes dejar el sitio sin ningún administrador.',
  CONFLICT: 'Ese cambio choca con el estado actual. Vuelve a cargar la página.',
  INTERNAL: 'Algo ha fallado por nuestra parte. Vuelve a intentarlo.',
};

/**
 * Traducción de los problemas de Zod a algo que un editor pueda leer.
 *
 * Existe por dos motivos, y el segundo importa más que el primero:
 *
 * 1. Los mensajes por defecto de Zod están en inglés, y `SPEC.md` §9 pide español llano.
 *    Dejar `message` en español y `fields[].message` en inglés se nota en cuanto se usa.
 * 2. Algunos **devuelven el valor recibido**: `z.enum` produce "Invalid enum value. Expected
 *    'a' | 'b', received 'xyz'". React lo escapa al pintarlo, así que no es XSS, pero es
 *    entrada del usuario reflejada sin motivo — y al editor no le dice nada que no sepa.
 *
 * El respaldo es deliberadamente genérico: ante un código que no está en la lista, se
 * prefiere un mensaje poco útil a uno que arrastre el valor de vuelta.
 */
function mensajeDeCampo(issue: z.ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' ? 'Este campo es obligatorio.' : 'Revisa este campo.';
    case 'too_small':
      return typeof issue.minimum === 'number' && issue.type === 'string' && issue.minimum <= 1
        ? 'Este campo es obligatorio.'
        : `Se ha quedado corto: mínimo ${String(issue.minimum)}.`;
    case 'too_big':
      return `Se ha pasado de largo: máximo ${String(issue.maximum)}.`;
    case 'invalid_string':
      return issue.validation === 'email'
        ? 'Escribe un correo válido.'
        : issue.validation === 'url'
          ? 'Escribe una dirección válida.'
          : 'Revisa el formato de este campo.';
    case 'invalid_enum_value':
      // A propósito sin listar lo recibido ni lo esperado: lo esperado es un desplegable en
      // el panel, y lo recibido es entrada del usuario.
      return 'Elige una de las opciones disponibles.';
    case 'custom':
      // Aquí el mensaje lo escribimos nosotros al definir el esquema, así que sí se usa.
      return issue.message;
    default:
      return 'Revisa este campo.';
  }
}

export function fail(code: ActionErrorCode, message?: string): ActionResult<never> {
  return { ok: false, code, message: message ?? DEFAULT_MESSAGES[code] };
}

/**
 * `VALIDATION_FAILED` desde el handler, con la lista de campos por completar.
 *
 * Hace falta porque no toda la validación cabe en el esquema de entrada del envoltorio: el
 * esquema del contenido depende de qué entrada se está guardando, y eso solo se sabe después
 * de leer su fila. `publish` lo usa igual con el esquema estricto (SPEC §5.3, §9).
 */
export function failFields(
  fields: readonly ActionFieldError[],
  message?: string
): ActionResult<never> {
  return {
    ok: false,
    code: 'VALIDATION_FAILED',
    message: message ?? DEFAULT_MESSAGES.VALIDATION_FAILED,
    fields,
  };
}

/** Traduce los problemas de un esquema de contenido a errores de campo, ya en español. */
export function fieldsFromZod(error: z.ZodError): ActionFieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: mensajeDeCampo(issue),
  }));
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

// ── Roles ────────────────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'editor';

/** `admin` puede todo lo de `editor`. No al revés. */
function satisfiesRole(actual: Role, required: Role): boolean {
  return required === 'editor' ? true : actual === 'admin';
}

export interface ActionSession {
  readonly userId: string;
  readonly email: string;
  readonly role: Role;
}

/**
 * De dónde sale la sesión.
 *
 * Es inyectable porque `auth()` de Auth.js necesita el contexto de petición de Next, que no
 * existe en un test de integración. La alternativa —montar un servidor para probar el
 * guard de roles— haría que probarlo costara tanto que se acabaría probando poco.
 */
type SessionProvider = () => Promise<ActionSession | null>;

const defaultSessionProvider: SessionProvider = async () => {
  // Importación diferida a propósito. Auth.js se instancia al cargar `@/cms/auth`
  // (`NextAuth(authConfig)` corre a nivel de módulo), así que un import estático haría que
  // *cualquiera* que toque el barril de actions arrastre media librería —incluido el test
  // que solo recorre las exportaciones para comprobar que llevan la marca (T-75-6)—. Aquí
  // se necesita en tiempo de petición, no en tiempo de carga.
  const { auth } = await import('@/cms/auth');
  const session = await auth();
  if (session === null) return null;

  const { id, email, role } = session.user;
  if (typeof id !== 'string' || typeof email !== 'string') return null;
  if (role !== 'admin' && role !== 'editor') return null;

  return { userId: id, email, role };
};

let sessionProvider: SessionProvider = defaultSessionProvider;

/**
 * Solo para tests, y con guard.
 *
 * A diferencia del resto de `*ForTests` del proyecto, que reinician estado, este **sustituye
 * de dónde sale la sesión**: llamarlo fuera de un test convierte el guard de rol en
 * decorativo. Un import despistado desde una ruta bastaría, y no lo detectaría ningún test.
 * Tres líneas cierran esa vía.
 */
export function setSessionProviderForTests(provider: SessionProvider | null): void {
  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error('setSessionProviderForTests solo puede usarse en tests.');
  }
  sessionProvider = provider ?? defaultSessionProvider;
}

// ── Cuotas (docs/specs/03-actions.md §3.1) ───────────────────────────────────────────────

/**
 * Las cuotas van por **usuario autenticado**, no por IP: quien llega aquí ya pasó sesión y
 * rol. Esto no defiende de un atacante, defiende de un bucle en el panel y de un editor que
 * dispara más operaciones de las razonables.
 *
 * `saveDraft` tiene una cuota holgada **por diseño**: el autosave de SPEC §8 guarda cada 2 s
 * tras el último tecleo. Con una cuota estricta, el CMS dejaría de guardar a los diez
 * segundos de escribir y el editor lo viviría como pérdida de su trabajo — una protección
 * convertida en fallo de producto.
 */
export const BUCKETS = {
  saveDraft: { limit: 240, windowMs: 5 * 60 * 1000 },
  publish: { limit: 30, windowMs: 5 * 60 * 1000 },
  admin: { limit: 20, windowMs: 5 * 60 * 1000 },
  preview: { limit: 60, windowMs: 5 * 60 * 1000 },
} as const;

export type BucketName = keyof typeof BUCKETS;

const limiters = new Map<BucketName, RateLimiter>();

function limiterFor(bucket: BucketName): RateLimiter {
  let limiter = limiters.get(bucket);
  if (limiter === undefined) {
    limiter = createRateLimiter(BUCKETS[bucket]);
    limiters.set(bucket, limiter);
  }
  return limiter;
}

/** Solo para tests: las cuotas son estado de módulo y sobreviven entre casos. */
export function resetBucketsForTests(): void {
  limiters.clear();
}

// ── El envoltorio ────────────────────────────────────────────────────────────────────────

/**
 * Marca que identifica a una action que pasó por aquí.
 *
 * Existe para que un test pueda comprobarlo. `Symbol.for` y no `Symbol()` porque el test
 * carga el módulo por su cuenta y necesita la misma referencia.
 */
export const ACTION_MARKER = Symbol.for('unocms.action');

export interface ActionDefinition<Input, Output> {
  /** Nombre para la auditoría: 'content.publish', 'user.invite'… (SPEC §4). */
  readonly name: string;
  readonly role: Role;
  readonly bucket: BucketName;
  readonly input: z.ZodType<Input>;
  readonly targetType?: AuditTargetType;
  /** Qué identificador se registra en la auditoría, a partir del input ya validado. */
  readonly targetId?: (input: Input) => string | undefined;
  readonly handler: (input: Input, session: ActionSession) => Promise<ActionResult<Output>>;
}

/**
 * El tipo de una action ya envuelta.
 *
 * Acepta `Input` para que el panel tenga autocompletado y para que un cambio de esquema
 * rompa la compilación de quien la llama. Eso es **comodidad, no garantía**: quien invoca
 * una Server Action es una petición HTTP, y una petición puede traer cualquier cosa. Por eso
 * el envoltorio valida con Zod de todas formas, y por eso el handler recibe el dato ya
 * analizado y no el que llegó.
 */
export type Action<Input, Output> = ((input: Input) => Promise<ActionResult<Output>>) & {
  readonly [ACTION_MARKER]: true;
};

export function defineAction<Input, Output>(
  definition: ActionDefinition<Input, Output>
): Action<Input, Output> {
  /**
   * Qué rechazos se auditan y cuáles no.
   *
   * Regla, en una frase: **se audita todo lo que ocurre después de que el límite haya dado
   * el visto bueno**. Es decir, `FORBIDDEN`, `VALIDATION_FAILED` y los fallos que devuelve
   * el handler. Quedan fuera dos casos, y quedan fuera a propósito:
   *
   * - `UNAUTHORIZED`: no hay actor que registrar, y quien lo dispara es un anónimo. Escribir
   *   una fila por petición sin sesión es dejar que cualquiera en internet haga crecer una
   *   tabla nuestra. Los intentos de acceso sí se auditan, pero en `authenticate.ts`, donde
   *   al menos hay un correo que registrar.
   * - `RATE_LIMITED`: auditar justo lo que el límite acaba de frenar convierte la protección
   *   en una escritura por cada petición bloqueada, que es el gasto que el límite existe
   *   para evitar.
   */
  const auditRejection = async (
    code: ActionErrorCode,
    session: ActionSession,
    targetId?: string
  ): Promise<void> => {
    await audit({
      action: `${definition.name}.rejected`,
      actorId: session.userId,
      actorEmail: session.email,
      ...(definition.targetType === undefined ? {} : { targetType: definition.targetType }),
      ...(targetId === undefined ? {} : { targetId }),
      meta: { code },
    });
  };

  const run = async (input: Input): Promise<ActionResult<Output>> => {
    // 1. Sesión. Antes que nada: el trabajo hecho sin saber quién llama lo provoca un
    //    anónimo.
    const session = await sessionProvider();
    if (session === null) return fail('UNAUTHORIZED');

    // 2. Rol, en el servidor y desde la sesión —nunca desde el input— (SPEC §7.1). La
    //    decisión se toma aquí, antes que el límite, como fija el orden de SPEC §5.3: un
    //    editor que llama a una action de admin recibe FORBIDDEN, no RATE_LIMITED.
    const roleOk = satisfiesRole(session.role, definition.role);

    // 3. Límite, antes de validar: validar cuesta CPU, y si el límite fuera después se
    //    saltaría enviando payloads caros y malformados.
    //
    //    Se consume cuota **también cuando el rol no da**. Dos motivos: un rechazo no debe
    //    salir gratis, y así el número de filas de auditoría que puede provocar un editor
    //    llamando en bucle a una action de admin queda acotado por su propia cuota.
    const rateOk = limiterFor(definition.bucket).check(
      `${definition.bucket}:${session.userId}`
    ).allowed;

    if (!roleOk) {
      if (rateOk) await auditRejection('FORBIDDEN', session);
      return fail('FORBIDDEN');
    }
    if (!rateOk) return fail('RATE_LIMITED');

    // 4. Validación, antes de tocar la base de datos.
    const parsed = definition.input.safeParse(input);
    if (!parsed.success) {
      await auditRejection('VALIDATION_FAILED', session);
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        message: DEFAULT_MESSAGES.VALIDATION_FAILED,
        fields: fieldsFromZod(parsed.error),
      };
    }

    // `targetId` lo escribe quien define la action, y es justo el sitio donde se cuela un
    // acceso a `input.items[0].id` que revienta con la lista vacía. Si lanzara fuera del
    // `try`, la excepción escaparía del envoltorio y pasaría exactamente lo que ADR-400
    // quiere evitar: el error genérico de Next y un editor sin saber si se guardó su texto.
    // Además no puede tumbar la operación: es un dato de auditoría, no de negocio.
    let targetId: string | undefined;
    try {
      targetId = definition.targetId?.(parsed.data);
    } catch (error) {
      console.error(`[action:${definition.name}] targetId lanzó; se audita sin objetivo`, error);
    }

    // 5. La lógica. Todo lo que lance aquí se convierte en INTERNAL sin filtrar su mensaje:
    //    una excepción no capturada en una Server Action se vuelve un error genérico de
    //    Next que el panel no puede explicar, y el editor se queda sin saber si su texto se
    //    guardó (ADR-400).
    let result: ActionResult<Output>;
    try {
      result = await definition.handler(parsed.data, session);
    } catch (error) {
      console.error(`[action:${definition.name}] excepción no prevista`, error);
      await auditRejection('INTERNAL', session, targetId);
      return fail('INTERNAL');
    }

    // 6. Auditoría, después de la lógica y fuera de su transacción. `audit` nunca lanza.
    if (!result.ok) {
      await auditRejection(result.code, session, targetId);
      return result;
    }

    await audit({
      action: definition.name,
      actorId: session.userId,
      actorEmail: session.email,
      ...(definition.targetType === undefined ? {} : { targetType: definition.targetType }),
      ...(targetId === undefined ? {} : { targetId }),
    });

    return result;
  };

  return Object.assign(run, { [ACTION_MARKER]: true as const });
}
