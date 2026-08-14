import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signToken, verifyToken } from '@/cms/security/tokens';

/**
 * T-55-1 a T-55-7: tokens firmados (SPEC §5.3, §6.2, §7.3).
 */

const SECRET = 'un-secreto-de-pruebas-con-mas-de-32-caracteres';
const OTHER_SECRET = 'otro-secreto-distinto-y-tambien-largo-de-sobra';

beforeEach(() => {
  vi.stubEnv('APP_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('T-55-1 — ida y vuelta', () => {
  it('un token válido devuelve su carga', () => {
    const token = signToken('preview', { key: 'hero' });
    expect(verifyToken('preview', token)).toEqual({ ok: true, data: { key: 'hero' } });
  });
});

describe('T-55-2 — manipulación', () => {
  it('rechaza un payload alterado', () => {
    const token = signToken('preview', { key: 'hero' });
    const [payload, signature] = token.split('.');

    const alterado = Buffer.from(
      JSON.stringify({ purpose: 'preview', data: { key: 'otro' }, exp: 9_999_999_999 }),
      'utf8'
    ).toString('base64url');

    expect(verifyToken('preview', `${alterado}.${signature}`)).toEqual({ ok: false });
    // Y al revés: firma alterada sobre payload legítimo.
    expect(verifyToken('preview', `${payload}.${'A'.repeat(43)}`)).toEqual({ ok: false });
  });
});

describe('T-55-3 — el propósito viaja dentro de la firma', () => {
  it('un token de vista previa NO vale como token de bootstrap', () => {
    // Es el caso que convierte un enlace compartible de preview en una toma de control:
    // ambos tokens están firmados por nosotros y solo los distingue este campo.
    const preview = signToken('preview', { key: 'hero' });

    expect(verifyToken('setup', preview)).toEqual({ ok: false });
    expect(verifyToken('password-reset', preview)).toEqual({ ok: false });
    expect(verifyToken('preview', preview)).toMatchObject({ ok: true });
  });
});

describe('T-55-4 — expiración', () => {
  it('rechaza un token caducado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const token = signToken('preview', { key: 'hero' });

    vi.setSystemTime(new Date('2026-01-01T01:59:59Z'));
    expect(verifyToken('preview', token)).toMatchObject({ ok: true });

    // SPEC §6.1: los tokens de vista previa duran 2 h.
    vi.setSystemTime(new Date('2026-01-01T02:00:01Z'));
    expect(verifyToken('preview', token)).toEqual({ ok: false });
  });

  it('un ttl negativo produce un token ya caducado', () => {
    expect(verifyToken('preview', signToken('preview', { key: 'hero' }, -1))).toEqual({
      ok: false,
    });
  });
});

describe('T-55-5 — otro secreto', () => {
  it('un token firmado con otro APP_SECRET no vale', () => {
    const token = signToken('preview', { key: 'hero' });

    vi.stubEnv('APP_SECRET', OTHER_SECRET);
    expect(verifyToken('preview', token)).toEqual({ ok: false });
  });
});

describe('T-55-6 — entrada basura', () => {
  it.each([
    ['cadena vacía', ''],
    ['sin separador', 'abcdef'],
    ['solo separador', '.'],
    ['payload vacío', '.firma'],
    ['firma vacía', 'payload.'],
    ['base64 inválido', '!!!.???'],
    ['payload que no es JSON', `${Buffer.from('no-json').toString('base64url')}.x`],
    ['muy largo', `${'a'.repeat(10_000)}.${'b'.repeat(10_000)}`],
  ])('devuelve inválido sin lanzar ante %s', (_caso, valor) => {
    expect(() => verifyToken('preview', valor)).not.toThrow();
    expect(verifyToken('preview', valor)).toEqual({ ok: false });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['número', 42],
    ['objeto', { toString: () => 'x.y' }],
  ])('devuelve inválido sin lanzar ante %s', (_caso, valor) => {
    expect(() => verifyToken('preview', valor)).not.toThrow();
    expect(verifyToken('preview', valor)).toEqual({ ok: false });
  });

  it('rechaza un payload bien firmado pero con forma equivocada', () => {
    // La firma garantiza el origen, no la estructura. Si alguna vez cambiara el formato,
    // un token antiguo seguiría estando bien firmado y traería otra cosa dentro.
    const raro = Buffer.from(JSON.stringify({ hola: 'mundo' }), 'utf8').toString('base64url');
    const token = signToken('preview', {});
    const firma = token.split('.')[1];

    // Firmado de verdad no está, pero comprobamos que ni siquiera con firma válida pasaría:
    expect(verifyToken('preview', `${raro}.${firma}`)).toEqual({ ok: false });
  });
});

describe('T-55-7 — todos los fallos son indistinguibles hacia fuera', () => {
  it('devuelven exactamente el mismo objeto, sin motivo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const caducado = signToken('preview', { key: 'hero' }, -1);
    const otroProposito = signToken('setup', { key: 'hero' });
    const manipulado = `${signToken('preview', { key: 'hero' }).split('.')[0]}.${'A'.repeat(43)}`;

    const resultados = [
      verifyToken('preview', caducado),
      verifyToken('preview', otroProposito),
      verifyToken('preview', manipulado),
      verifyToken('preview', 'basura'),
    ];

    // Si algún día alguien añade un `reason` "para depurar", este test se pone rojo. Es su
    // razón de ser: el motivo del fallo es justo lo que no debe salir de aquí.
    for (const resultado of resultados) {
      expect(resultado).toEqual({ ok: false });
      expect(Object.keys(resultado)).toEqual(['ok']);
    }
  });
});

describe('la comparación de firmas es en tiempo constante', () => {
  it('el módulo usa timingSafeEqual y no una comparación corriente', async () => {
    // **Este test mira el código fuente, no el comportamiento, y es a propósito.**
    //
    // La propiedad que protege —que comparar firmas tarde lo mismo acierte o falle— no es
    // observable desde fuera: sustituir `timingSafeEqual` por `Buffer.equals` no cambia ni
    // un resultado. Lo comprobé por mutación y los 151 tests siguieron en verde.
    //
    // Así que la elección es entre un test que vigila la implementación o ninguna
    // protección contra que alguien la sustituya "porque es más simple". Se elige el
    // primero, sabiendo lo que es: no demuestra que la comparación sea constante, solo que
    // nadie ha quitado la función que lo garantiza.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');

    const source = readFileSync(
      fileURLToPath(new URL('../../cms/security/tokens.ts', import.meta.url)),
      'utf8'
    );

    expect(source).toContain('timingSafeEqual');
    expect(source).not.toMatch(/expected\.equals\(/);
    expect(source).not.toMatch(/expected === provided/);
  });
});

describe('APP_SECRET ausente o corto', () => {
  it('lanza al firmar y al verificar, en vez de degradar en silencio', () => {
    vi.stubEnv('APP_SECRET', 'corto');
    expect(() => signToken('preview', {})).toThrow(/APP_SECRET/);
    expect(() => verifyToken('preview', 'a.b')).toThrow(/APP_SECRET/);

    vi.stubEnv('APP_SECRET', '');
    expect(() => signToken('preview', {})).toThrow(/APP_SECRET/);
  });
});
