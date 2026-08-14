import { describe, expect, it } from 'vitest';
import { commonPasswordCount, isCommonPassword } from '@/cms/auth/common-passwords';
import {
  ARGON2_PARAMETERS,
  DECOY_HASH,
  MIN_PASSWORD_LENGTH,
  checkPasswordPolicy,
  hashPassword,
  verifyDecoy,
  verifyPassword,
} from '@/cms/auth/passwords';

/**
 * T-56-1 a T-56-8: Argon2id y política de contraseñas (ADR-004, ADR-300, ADR-302).
 *
 * Argon2 con los parámetros de producción tarda decenas de milisegundos por operación, que
 * es justo lo que se busca. Los tests que hashean llevan timeout holgado.
 */

const VALID = 'una-contrasena-larga-y-poco-comun';

describe('T-56-1 / T-56-2 — hash y verificación', () => {
  it('hace ida y vuelta', { timeout: 30_000 }, async () => {
    const hash = await hashPassword(VALID);
    expect(await verifyPassword(hash, VALID)).toBe(true);
  });

  it('dos hashes de la misma contraseña difieren', { timeout: 30_000 }, async () => {
    // Si coincidieran, la sal no sería aleatoria y una tabla precalculada valdría para
    // todas las cuentas a la vez.
    const [a, b] = await Promise.all([hashPassword(VALID), hashPassword(VALID)]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(b, VALID)).toBe(true);
  });
});

describe('T-56-3 — el hash declara los parámetros de ADR-300', () => {
  it('es argon2id con m=19456, t=2, p=1', { timeout: 30_000 }, async () => {
    const hash = await hashPassword(VALID);

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain(`m=${ARGON2_PARAMETERS.memoryCost}`);
    expect(hash).toContain(`t=${ARGON2_PARAMETERS.timeCost}`);
    expect(hash).toContain(`p=${ARGON2_PARAMETERS.parallelism}`);
  });

  it('los parámetros no se han bajado sin ADR', () => {
    // ADR-300: subirlos es libre, bajarlos exige un ADR nuevo. Este test es lo que obliga a
    // que ese ADR exista, porque bajarlos no rompe nada más.
    expect(ARGON2_PARAMETERS.memoryCost).toBeGreaterThanOrEqual(19_456);
    expect(ARGON2_PARAMETERS.timeCost).toBeGreaterThanOrEqual(2);
  });
});

describe('T-56-4 / T-56-5 — verificación que falla', () => {
  it('contraseña incorrecta devuelve false', { timeout: 30_000 }, async () => {
    const hash = await hashPassword(VALID);
    expect(await verifyPassword(hash, 'otra-cosa-completamente')).toBe(false);
  });

  it.each([
    ['cadena vacía', ''],
    ['texto suelto', 'esto-no-es-un-hash'],
    ['prefijo correcto y resto roto', '$argon2id$v=19$m=19456,t=2,p=1$@@@$@@@'],
    ['algoritmo desconocido', '$argon2z$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA'],
    ['solo el separador', '$'],
  ])('un hash corrupto (%s) devuelve false SIN lanzar', async (_caso, hash) => {
    // Un `throw` aquí distinguiría "el registro está dañado" de "la contraseña es
    // incorrecta" por el comportamiento: quien viera un 500 en vez de "credenciales
    // inválidas" sabría que ha dado con una cuenta real.
    await expect(verifyPassword(hash, VALID)).resolves.toBe(false);
  });
});

describe('el hash señuelo de SPEC §7.1', () => {
  it('es un hash válido con los parámetros de producción', () => {
    // Si no lo fuera, `verifyDecoy` fallaría al instante y el caso de usuario inexistente
    // volvería a responder mucho más rápido que el de usuario real: exactamente el canal
    // que este señuelo existe para cerrar.
    expect(DECOY_HASH.startsWith('$argon2id$')).toBe(true);
    expect(DECOY_HASH).toContain(`m=${ARGON2_PARAMETERS.memoryCost}`);
  });

  it('siempre devuelve false', { timeout: 30_000 }, async () => {
    expect(await verifyDecoy('lo-que-sea')).toBe(false);
    expect(await verifyDecoy(VALID)).toBe(false);
  });

  it(
    'tarda un orden de magnitud parecido a una verificación real',
    { timeout: 60_000 },
    async () => {
      const hash = await hashPassword(VALID);

      const inicioReal = performance.now();
      await verifyPassword(hash, 'incorrecta');
      const real = performance.now() - inicioReal;

      const inicioSenuelo = performance.now();
      await verifyDecoy('incorrecta');
      const senuelo = performance.now() - inicioSenuelo;

      // Comparación deliberadamente laxa: medir tiempos en CI es ruidoso y un umbral
      // estrecho produciría un test intermitente, que es peor que no tenerlo. Lo que se
      // descarta aquí es el fallo gordo —que el señuelo responda en microsegundos porque el
      // hash embebido sea inválido—, no una diferencia de milisegundos.
      expect(senuelo).toBeGreaterThan(real / 10);
    }
  );
});

describe('T-56-6 a T-56-8 — política (ADR-302)', () => {
  it('rechaza menos de 12 caracteres', () => {
    const result = checkPasswordPolicy('corta12345');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('12');
  });

  it('acepta exactamente 12 si no es común', () => {
    expect(checkPasswordPolicy('xkcd-caballo').ok).toBe(true);
  });

  it('cuenta puntos de código, no unidades UTF-16', () => {
    // Doce emojis son 24 unidades UTF-16: con `.length` pasarían un mínimo que no cumplen.
    const onceEmojis = '🐴'.repeat(11);
    expect(checkPasswordPolicy(onceEmojis).ok).toBe(false);
    expect(checkPasswordPolicy('🐴'.repeat(12)).ok).toBe(true);
  });

  it('T-56-7: rechaza una contraseña común aunque sea larga', () => {
    const result = checkPasswordPolicy('passwordpassword');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('listas públicas');
  });

  it('la lista ignora mayúsculas y acentos', () => {
    // Es lo que hace la gente cuando un formulario le rechaza una contraseña: cambiar una
    // mayúscula y volver a intentarlo.
    expect(isCommonPassword('contrasena123')).toBe(true);
    expect(isCommonPassword('Contraseña123')).toBe(true);
    expect(isCommonPassword('CONTRASEÑA123')).toBe(true);
  });

  it('la lista no está vacía', () => {
    // Sin esto, vaciarla por accidente dejaría todos los tests de política en verde salvo
    // los que nombran una contraseña concreta.
    expect(commonPasswordCount).toBeGreaterThan(50);
  });

  it('T-56-8: acepta una contraseña larga y poco común', () => {
    expect(checkPasswordPolicy(VALID)).toEqual({ ok: true });
  });

  it('rechaza una contraseña absurdamente larga', () => {
    // No es política, es defensa: Argon2 procesa lo que se le dé, y una contraseña de un
    // megabyte consume CPU y memoria del servidor por petición.
    expect(checkPasswordPolicy('a'.repeat(2000)).ok).toBe(false);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['número', 123456789012],
    ['objeto', {}],
  ])('rechaza %s sin lanzar', (_caso, valor) => {
    expect(() => checkPasswordPolicy(valor)).not.toThrow();
    expect(checkPasswordPolicy(valor).ok).toBe(false);
  });

  it('el motivo SÍ se devuelve, a diferencia de los errores de login', () => {
    // Aquí no hay nada que enumerar: quien elige su contraseña necesita saber por qué se le
    // rechaza. Es lo contrario del mensaje único de §7.1 para las credenciales.
    expect(checkPasswordPolicy('corta').ok === false).toBe(true);
    expect(checkPasswordPolicy(MIN_PASSWORD_LENGTH > 0 ? 'corta' : 'x')).toHaveProperty('reason');
  });
});
