import { describe, expect, it } from 'vitest';
import {
  LOCKOUT_BASE_MINUTES,
  LOCKOUT_MAX_MINUTES,
  LOCKOUT_THRESHOLD,
  isLocked,
  lockoutMinutes,
  nextFailureState,
} from '@/cms/auth/lockout';

/**
 * La aritmética del lockout (SPEC §7.1: "5 fallos → 15 min, exponencial").
 *
 * Es la defensa que de verdad para la fuerza bruta: a diferencia del rate limit, vive en la
 * base de datos, así que es común a todas las instancias y no se diluye al escalar.
 */

const AHORA = new Date('2026-01-01T12:00:00Z');

describe('la progresión de SPEC §7.1', () => {
  it.each([
    [0, 0],
    [1, 0],
    [4, 0],
    [5, 15],
    [6, 30],
    [7, 60],
    [8, 120],
    [9, 240],
    [10, 480],
  ])('%i fallos → %i minutos', (fallos, minutos) => {
    expect(lockoutMinutes(fallos)).toBe(minutos);
  });

  it('los primeros fallos no bloquean: son de dedos, no de ataque', () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) {
      expect(lockoutMinutes(i)).toBe(0);
    }
    expect(lockoutMinutes(LOCKOUT_THRESHOLD)).toBe(LOCKOUT_BASE_MINUTES);
  });

  it('el bloqueo tiene tope de 24 h', () => {
    // Sin tope, unas decenas de fallos dejan la cuenta inutilizable durante años, y eso
    // convierte la defensa en el ataque: bastaría con teclear mal contra el correo de otro.
    expect(lockoutMinutes(20)).toBe(LOCKOUT_MAX_MINUTES);
    expect(lockoutMinutes(100)).toBe(LOCKOUT_MAX_MINUTES);
    expect(lockoutMinutes(1_000_000)).toBe(LOCKOUT_MAX_MINUTES);
  });

  it('un número absurdo de fallos no desborda a Infinity', () => {
    // `2 ** 5000` es Infinity, y `Math.min(Infinity, tope)` daría el tope por accidente.
    // Acotar el exponente antes de elevar hace que sea por diseño.
    expect(Number.isFinite(lockoutMinutes(5000))).toBe(true);
  });
});

describe('isLocked', () => {
  it('null y undefined no están bloqueados', () => {
    expect(isLocked(null, AHORA)).toBe(false);
    expect(isLocked(undefined, AHORA)).toBe(false);
  });

  it('una fecha futura bloquea y una pasada no', () => {
    expect(isLocked(new Date(AHORA.getTime() + 1000), AHORA)).toBe(true);
    expect(isLocked(new Date(AHORA.getTime() - 1000), AHORA)).toBe(false);
  });

  it('el instante exacto de expiración ya no bloquea', () => {
    expect(isLocked(new Date(AHORA.getTime()), AHORA)).toBe(false);
  });
});

describe('nextFailureState', () => {
  it('acumula fallos y bloquea al quinto', () => {
    let estado = { failedLogins: 0, lockedUntil: null as Date | null };

    for (let i = 1; i <= 4; i += 1) {
      estado = nextFailureState(estado, AHORA);
      expect(estado.failedLogins).toBe(i);
      expect(estado.lockedUntil).toBeNull();
    }

    estado = nextFailureState(estado, AHORA);
    expect(estado.failedLogins).toBe(5);
    expect(estado.lockedUntil?.getTime()).toBe(AHORA.getTime() + 15 * 60 * 1000);
  });

  it('un intento DURANTE el bloqueo no cuenta y no alarga nada', () => {
    // Es el caso que convierte la defensa en un arma: si el bloqueo se alargara con cada
    // intento, cualquiera podría mantener fuera a un usuario legítimo indefinidamente
    // sabiendo solo su correo, reintentando cada pocos minutos.
    const bloqueada = {
      failedLogins: 5,
      lockedUntil: new Date(AHORA.getTime() + 10 * 60 * 1000),
    };

    const despues = nextFailureState(bloqueada, AHORA);

    expect(despues.failedLogins).toBe(5);
    expect(despues.lockedUntil?.getTime()).toBe(bloqueada.lockedUntil.getTime());
  });

  it('pasado el bloqueo, el siguiente fallo sí cuenta y bloquea más tiempo', () => {
    const expirada = {
      failedLogins: 5,
      lockedUntil: new Date(AHORA.getTime() - 1000),
    };

    const despues = nextFailureState(expirada, AHORA);

    expect(despues.failedLogins).toBe(6);
    expect(despues.lockedUntil?.getTime()).toBe(AHORA.getTime() + 30 * 60 * 1000);
  });
});
