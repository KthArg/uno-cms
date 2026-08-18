import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOGIN_LIMIT,
  LOGIN_WINDOW_MS,
  createRateLimiter,
  loginRateLimitKey,
  resetDegradationWarningForTests,
  warnIfDegraded,
} from '@/cms/security/ratelimit';

/**
 * T-57-1 a T-57-4: límite de intentos (SPEC §5.3, ADR-303).
 *
 * Todos usan un reloj inyectado. Un test que espere quince minutos reales no se ejecuta
 * nunca, y uno que duerma unos milisegundos prueba otra cosa distinta de la que dice.
 */

/** Reloj controlado a mano, para avanzar el tiempo sin esperarlo. */
function fakeClock(start = 1_700_000_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

afterEach(() => {
  resetDegradationWarningForTests();
});

describe('T-57-1 — el límite corta en el intento correcto', () => {
  it('permite exactamente `limit` intentos y bloquea el siguiente', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 5, windowMs: LOGIN_WINDOW_MS, now: clock.now });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = limiter.check('k');
      expect(result.allowed, `intento ${attempt} debería permitirse`).toBe(true);
      expect(result.remaining).toBe(5 - attempt);
    }

    const sexto = limiter.check('k');
    expect(sexto.allowed).toBe(false);
    expect(sexto.remaining).toBe(0);
  });

  it('sigue bloqueando después del primer rechazo', () => {
    // Un contador mal escrito puede reiniciarse al superar el límite y volver a permitir.
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: clock.now });

    limiter.check('k');
    limiter.check('k');
    expect(limiter.check('k').allowed).toBe(false);
    expect(limiter.check('k').allowed).toBe(false);
    expect(limiter.check('k').allowed).toBe(false);
  });
});

describe('T-57-2 — la ventana expira', () => {
  it('vuelve a permitir cuando pasa la ventana', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: clock.now });

    limiter.check('k');
    limiter.check('k');
    expect(limiter.check('k').allowed).toBe(false);

    clock.advance(999);
    expect(limiter.check('k').allowed, 'un milisegundo antes aún bloquea').toBe(false);

    clock.advance(2);
    expect(limiter.check('k').allowed, 'pasada la ventana vuelve a permitir').toBe(true);
  });

  it('la ventana NO se alarga con cada intento', () => {
    // Si cada intento reiniciara el contador de tiempo, quien siguiera intentando quedaría
    // bloqueado para siempre. Es el mismo error que el spec de fase prohíbe en el lockout.
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    const primero = limiter.check('k');
    clock.advance(500);
    limiter.check('k');
    clock.advance(400);
    const durante = limiter.check('k');

    expect(durante.resetAt).toBe(primero.resetAt);
  });
});

describe('T-57-3 — las claves no se interfieren', () => {
  it('agotar una clave no afecta a otra', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed, 'otra clave tiene su propia cuota').toBe(true);
  });

  it('`reset` libera solo la clave indicada', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    limiter.check('a');
    limiter.check('b');
    limiter.reset('a');

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(false);
  });
});

describe('la clave combina IP y correo', () => {
  it('distingue correos desde la misma IP y viceversa', () => {
    // Solo por IP, una oficina entera tras un NAT se bloquearía entre sí. Solo por correo,
    // cualquiera puede dejar fuera a un usuario conocido desde cualquier sitio.
    expect(loginRateLimitKey('1.2.3.4', 'a@x.com')).not.toBe(
      loginRateLimitKey('1.2.3.4', 'b@x.com')
    );
    expect(loginRateLimitKey('1.2.3.4', 'a@x.com')).not.toBe(
      loginRateLimitKey('5.6.7.8', 'a@x.com')
    );
  });

  it('el correo no distingue mayúsculas (ADR-201)', () => {
    expect(loginRateLimitKey('1.2.3.4', 'Ana@X.com')).toBe(
      loginRateLimitKey('1.2.3.4', 'ana@x.com')
    );
  });
});

describe('T-57-4 — la degradación es observable, no silenciosa', () => {
  it('avisa cuando no hay backend distribuido', () => {
    vi.stubEnv('KV_REST_API_URL', '');
    const log = vi.fn();

    warnIfDegraded(log);

    expect(log).toHaveBeenCalledTimes(1);
    const mensaje = log.mock.calls[0]?.[0] as string;
    // El aviso tiene que decir qué pasa, no solo que pasa algo.
    expect(mensaje).toContain('POR INSTANCIA');
    expect(mensaje).toContain('lockout');

    vi.unstubAllEnvs();
  });

  it('no avisa si hay backend distribuido configurado', () => {
    vi.stubEnv('KV_REST_API_URL', 'https://ejemplo.upstash.io');
    const log = vi.fn();

    warnIfDegraded(log);

    expect(log).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('avisa una sola vez, no en cada petición', () => {
    // Un aviso por petición se convierte en ruido, y el ruido se filtra: acabaría oculto
    // justo como la degradación que intenta señalar.
    vi.stubEnv('KV_REST_API_URL', '');
    const log = vi.fn();

    warnIfDegraded(log);
    warnIfDegraded(log);
    warnIfDegraded(log);

    expect(log).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});

describe('los valores de SPEC §5.3', () => {
  it('son 5 intentos por 15 minutos', () => {
    expect(LOGIN_LIMIT).toBe(5);
    expect(LOGIN_WINDOW_MS).toBe(15 * 60 * 1000);
  });
});

describe('el mapa de ventanas no crece sin límite', () => {
  it('poda las ventanas caducadas al superar el umbral', () => {
    // Sin poda, el mapa acumula una entrada por cada par IP+correo que lo intente: en un
    // proceso de larga vida es una fuga de memoria con forma de defensa de seguridad.
    //
    // Se observa el TAMAÑO del mapa y no si una clave vuelve a permitirse. La primera
    // versión de este test hacía lo segundo, y pasaba igual con la poda desactivada: una
    // ventana caducada se permite de todas formas al comprobarla, se haya podado o no.
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    for (let i = 0; i < 1500; i += 1) limiter.check(`k${i}`);
    expect(limiter.size).toBe(1500);

    clock.advance(2000);
    limiter.check('disparador');

    // Las 1500 caducadas se han ido; queda la que acaba de crearse.
    expect(limiter.size).toBe(1);
  });

  it('no poda ventanas todavía vivas', () => {
    // Podar de más sería peor que no podar: reiniciaría el contador de quien está en mitad
    // de su ventana y le daría intentos gratis.
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: clock.now });

    for (let i = 0; i < 1500; i += 1) limiter.check(`k${i}`);
    clock.advance(1000);
    limiter.check('disparador');

    expect(limiter.size).toBe(1501);
    expect(limiter.check('k0').allowed, 'k0 sigue bloqueada').toBe(false);
  });
});
