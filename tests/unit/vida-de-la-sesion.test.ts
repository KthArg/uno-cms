import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_SECRET_MIN_LENGTH,
  SESSION_MAX_AGE_SECONDS,
  secretoDeSesionValido,
  sesionCaducada,
} from '@/cms/sesion';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-S-7, T-S-8 y T-S-10: cuánto vive una sesión y con qué secreto (spec 19).
 *
 * La base de datos no hace falta: `isSessionStillValid` se sustituye por un «sí», y lo que se
 * comprueba es lo que el callback decide **antes** de preguntarle.
 */

// `next-auth` importa `next/server` sin extensión y Vitest no lo resuelve fuera de Next. Lo que
// se prueba es la configuración —un objeto con callbacks—, no lo que `NextAuth()` monta con
// ella, así que se sustituye por algo que no monta nada.
vi.mock('next-auth', () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('@/cms/auth/authenticate', () => ({
  authenticate: vi.fn(),
  isSessionStillValid: vi.fn(() => Promise.resolve(true)),
}));

const { authConfig } = await import('@/cms/auth');
const jwt = authConfig.callbacks.jwt as (args: {
  token: Record<string, unknown>;
  user?: unknown;
}) => Promise<Record<string, unknown> | null>;

const SECRETO_BUENO = 'un-secreto-de-pruebas-con-mas-de-treinta-y-dos';
const AHORA = Math.floor(Date.now() / 1000);

function token(extra: Record<string, unknown>) {
  return { sub: 'usuario-1', role: 'editor', pwdV: 0, ...extra };
}

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', SECRETO_BUENO);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('T-S-8 — la sesión tiene una vida absoluta', () => {
  it('sesionCaducada: dentro de los siete días, viva; pasados, no', () => {
    expect(sesionCaducada(AHORA - 60, AHORA)).toBe(false);
    expect(sesionCaducada(AHORA - SESSION_MAX_AGE_SECONDS, AHORA)).toBe(false);
    expect(sesionCaducada(AHORA - SESSION_MAX_AGE_SECONDS - 1, AHORA)).toBe(true);
  });

  it('sesionCaducada: sin authTime, o con algo que no es un número, caducada', () => {
    expect(sesionCaducada(undefined, AHORA)).toBe(true);
    expect(sesionCaducada('1700000000', AHORA)).toBe(true);
    expect(sesionCaducada(Number.NaN, AHORA)).toBe(true);
  });

  it('el callback deja pasar una sesión reciente', async () => {
    expect(await jwt({ token: token({ authTime: AHORA - 60 }) })).not.toBeNull();
  });

  it('y corta una de hace más de siete días, aunque pwdV siga valiendo', async () => {
    const vieja = token({ authTime: AHORA - SESSION_MAX_AGE_SECONDS - 60 });
    expect(await jwt({ token: vieja })).toBeNull();
  });

  it('y una sin authTime, que es de antes del arreglo', async () => {
    expect(await jwt({ token: token({}) })).toBeNull();
  });

  it('al entrar, el token se lleva cuándo', async () => {
    const recien = await jwt({
      token: {},
      user: { id: 'usuario-1', role: 'editor', passwordVersion: 0 },
    });
    expect(recien?.['authTime']).toBeTypeOf('number');
    expect(Math.abs((recien?.['authTime'] as number) - AHORA)).toBeLessThan(5);
  });
});

describe('T-S-10 — un AUTH_SECRET corto falla cerrado', () => {
  it('secretoDeSesionValido exige el mismo mínimo que APP_SECRET', () => {
    expect(AUTH_SECRET_MIN_LENGTH).toBe(32);
    expect(secretoDeSesionValido(undefined)).toBe(false);
    expect(secretoDeSesionValido('secret')).toBe(false);
    expect(secretoDeSesionValido('x'.repeat(31))).toBe(false);
    expect(secretoDeSesionValido('x'.repeat(32))).toBe(true);
  });

  it('con uno corto, ninguna sesión sobrevive', async () => {
    vi.stubEnv('AUTH_SECRET', 'secret');
    expect(await jwt({ token: token({ authTime: AHORA - 60 }) })).toBeNull();
  });

  it('y no se puede entrar: authorize lanza antes de mirar la contraseña', async () => {
    vi.stubEnv('AUTH_SECRET', 'secret');
    const proveedor = authConfig.providers[0] as unknown as {
      options: { authorize: (c: unknown, r: Request) => Promise<unknown> };
    };
    await expect(
      proveedor.options.authorize(
        { email: 'a@ejemplo.com', password: 'lo-que-sea' },
        new Request('https://cms.example/api/auth/callback/credentials')
      )
    ).rejects.toThrow(/AUTH_SECRET/);
  });
});

describe('T-S-7 — el middleware reemite la cookie con siete días, no con treinta', () => {
  it('su configuración de Auth.js usa la misma constante', () => {
    // El middleware no se puede importar aquí (es edge y monta Auth.js entero), así que se mira
    // su fuente. El e2e de cabeceras comprueba lo que de verdad sale en `Set-Cookie`.
    const fuente = readFileSync(join(REPO_ROOT, 'middleware.ts'), 'utf8');
    expect(fuente).toMatch(
      /session:\s*\{\s*strategy:\s*'jwt',\s*maxAge:\s*SESSION_MAX_AGE_SECONDS\s*\}/
    );
  });
});
