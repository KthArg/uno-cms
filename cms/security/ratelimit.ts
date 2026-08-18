import 'server-only';

/**
 * Límite de intentos por ventana (SPEC §5.3: "rate limit 5/15 min por IP+email").
 *
 * ## Lo que esta defensa NO es
 *
 * No es la defensa principal contra la fuerza bruta, y conviene decirlo antes que nada
 * (ADR-303). El contador vive **en memoria del proceso**, y en serverless cada instancia
 * tiene el suyo: con N instancias vivas, el límite efectivo de 5 intentos pasa a ser 5 × N.
 * Un atacante que genere carga suficiente para que la plataforma escale multiplica su
 * presupuesto de intentos sin siquiera proponérselo.
 *
 * La defensa que de verdad sostiene el caso es el **lockout incremental** de §7.1, que vive
 * en la base de datos: es común a todas las instancias, sobrevive a los reinicios y no se
 * diluye escalando. Esto de aquí protege del ruido; el lockout, del ataque.
 *
 * ## Por qué no hay backend distribuido todavía
 *
 * `SPEC.md` §2 contempla Upstash "(opcional) con fallback in-memory". No se implementa en
 * M2 y **no es un olvido**: no hay ninguna instancia de Upstash contra la que ejercitarlo,
 * ni en local ni en CI, así que sería código de seguridad sin un solo test. Preferimos la
 * degradación documentada y medible al integrarlo a ciegas. El hueco está en el issue que
 * acompaña a este módulo y se cierra en M6, con el despliegue de verificación.
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Intentos que quedan en la ventana actual. */
  readonly remaining: number;
  /** Instante en que la ventana se reinicia, en milisegundos. */
  readonly resetAt: number;
}

export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs: number;
  /**
   * Reloj inyectable. Existe para los tests: un test que espere quince minutos reales no
   * se ejecuta nunca, y uno que use `sleep` de unos milisegundos prueba otra cosa.
   */
  readonly now?: () => number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  /** Para el reinicio tras un login correcto, y para los tests. */
  reset(key: string): void;
  /**
   * Ventanas vivas en memoria. Existe para que el test de poda pueda comprobar que la poda
   * ocurre: sin observarlo, ese test pasaría igual con la poda desactivada, porque las
   * ventanas caducadas se permiten de todas formas al comprobarlas.
   */
  readonly size: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/** SPEC §5.3: 5 intentos por 15 minutos. */
export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const windows = new Map<string, Window>();

  /**
   * Poda de ventanas caducadas. Sin ella, el mapa crece con una entrada por cada
   * combinación de IP y correo que haya intentado entrar: en un proceso de larga vida, eso
   * es una fuga de memoria con forma de defensa de seguridad.
   *
   * Se hace al escribir y acotada, no con un temporizador: un `setInterval` mantendría vivo
   * el proceso y, en serverless, se ejecutaría en instancias que quizá ya no atienden nada.
   */
  function prune(current: number): void {
    if (windows.size < 1000) return;

    for (const [key, window] of windows) {
      if (window.resetAt <= current) windows.delete(key);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const current = now();
      prune(current);

      const existing = windows.get(key);

      if (existing === undefined || existing.resetAt <= current) {
        const window: Window = { count: 1, resetAt: current + options.windowMs };
        windows.set(key, window);
        return { allowed: true, remaining: options.limit - 1, resetAt: window.resetAt };
      }

      existing.count += 1;

      return {
        allowed: existing.count <= options.limit,
        remaining: Math.max(0, options.limit - existing.count),
        resetAt: existing.resetAt,
      };
    },

    reset(key: string): void {
      windows.delete(key);
    },

    get size(): number {
      return windows.size;
    },
  };
}

/**
 * Clave del límite de login: IP **y** correo (SPEC §5.3).
 *
 * Las dos partes juntas y no cada una por su lado: solo por IP, una oficina entera detrás
 * de un NAT se bloquearía entre sí; solo por correo, cualquiera puede dejar fuera a un
 * usuario conocido desde cualquier sitio. El correo se normaliza a minúsculas para que
 * `Ana@x.com` y `ana@x.com` compartan cuota (ADR-201).
 *
 * La IP se toma tal cual llega; **truncarla aquí sería un error**, al revés que en la
 * auditoría: allí se trunca para no guardar un dato personal, aquí se necesita completa
 * para distinguir a quien intenta entrar. Este valor no se persiste en ningún sitio.
 */
export function loginRateLimitKey(ip: string, email: string): string {
  return `login:${ip}:${email.toLowerCase()}`;
}

/**
 * Aviso único al arrancar. Una degradación de seguridad silenciosa es peor que no tener la
 * protección, porque quien despliega cree que la tiene (ADR-303).
 */
let warned = false;

export function warnIfDegraded(log: (message: string) => void = console.warn): void {
  if (warned) return;
  warned = true;

  if (process.env['KV_REST_API_URL'] === undefined || process.env['KV_REST_API_URL'] === '') {
    log(
      '[ratelimit] Sin KV_REST_API_URL: el límite de intentos es POR INSTANCIA, no global. ' +
        'En un despliegue con varias instancias el límite efectivo se multiplica. ' +
        'El lockout de la base de datos sí es global y no se ve afectado.'
    );
  }
}

/** Solo para tests: permite volver a comprobar el aviso de arranque. */
export function resetDegradationWarningForTests(): void {
  warned = false;
}

let loginLimiter: RateLimiter | undefined;

export function getLoginRateLimiter(): RateLimiter {
  loginLimiter ??= createRateLimiter({ limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS });
  return loginLimiter;
}

// El aviso se dispara al IMPORTAR el módulo, no al pedir el limitador.
//
// Colgado de `getLoginRateLimiter`, solo salía cuando alguien intentaba iniciar sesión: en
// un despliegue donde nadie entre todavía, la degradación no se anunciaría nunca, y quien
// desplegó se enteraría al sufrirla. ADR-303 promete avisar al arrancar, no al usarse.
warnIfDegraded();
