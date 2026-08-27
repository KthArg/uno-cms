import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * T-192-4 y T-192-5: **la salud comprueba el esquema, no solo la conexión** (issue #192).
 *
 * Antes era un `select 1`, que responde perfectamente en una base recién creada y vacía — o sea,
 * en un despliegue al que nadie ha aplicado las migraciones. Comprobado contra una base vacía:
 * `/api/health` decía 200 mientras `/setup` respondía 500 con `relation "settings" does not
 * exist`.
 *
 * Va en la suite rápida y con la base simulada porque lo que hay que ejercitar es **el camino de
 * fallo**, y montar una base a medio migrar para eso costaría más que lo que prueba. Que el
 * camino bueno responde 200 contra una base de verdad lo comprueba el e2e desde M2.
 */

const ejecutar = vi.hoisted(() => vi.fn());
vi.mock('@/cms/db', () => ({ getDb: () => ({ execute: ejecutar }) }));

afterEach(() => {
  vi.restoreAllMocks();
  ejecutar.mockReset();
});

describe('T-192-4 — un esquema que no está es un 503', () => {
  it('responde 503 cuando la tabla no existe', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // El error exacto de Postgres en una base sin migrar.
    ejecutar.mockRejectedValue(new Error('relation "settings" does not exist'));

    const { GET } = await import('@/app/api/health/route');
    const respuesta = await GET();

    expect(respuesta.status).toBe(503);
  });

  it('y la consulta mira una tabla de la aplicación, no un `select 1`', async () => {
    ejecutar.mockResolvedValue(undefined);

    const { GET } = await import('@/app/api/health/route');
    await GET();

    // Un `select 1` a secas responde en una base vacía. Lo que hace falta es tocar algo que las
    // migraciones tienen que haber creado.
    const consulta = JSON.stringify(ejecutar.mock.calls[0]?.[0] ?? {});
    expect(consulta).toContain('settings');
  });

  it('con el esquema puesto, responde 200 y la latencia', async () => {
    ejecutar.mockResolvedValue(undefined);

    const { GET } = await import('@/app/api/health/route');
    const respuesta = await GET();
    const cuerpo = (await respuesta.json()) as { ok: boolean; dbLatencyMs: number };

    expect(respuesta.status).toBe(200);
    expect(cuerpo.ok).toBe(true);
    expect(typeof cuerpo.dbLatencyMs).toBe('number');
  });
});

describe('T-192-5 — pero no cuenta qué falló', () => {
  it('la respuesta no lleva el motivo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    ejecutar.mockRejectedValue(new Error('relation "settings" does not exist'));

    const { GET } = await import('@/app/api/health/route');
    const cuerpo = await (await GET()).text();

    // Un endpoint de salud es público por definición: el detalle del error solo le sirve a quien
    // esté buscando por dónde entrar. `ok: false` y nada más.
    expect(cuerpo).not.toContain('settings');
    expect(cuerpo).not.toMatch(/relation|postgres|schema/i);
    expect(JSON.parse(cuerpo)).toEqual({ ok: false });
  });

  it('el motivo sí va al registro, que es donde mira quien despliega', async () => {
    // «No está migrada» y «no hay conexión» se arreglan de forma distinta. Sin esto, quien
    // despliega tiene un 503 y ninguna pista.
    const registro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    ejecutar.mockRejectedValue(new Error('relation "settings" does not exist'));

    const { GET } = await import('@/app/api/health/route');
    await GET();

    expect(registro).toHaveBeenCalled();
    // `String(error)` y no `JSON.stringify`: un `Error` se serializa a `{}` y el caso pasaría
    // en vacío. Lo enseñó al escribirlo.
    expect(String(registro.mock.calls[0]?.[1])).toContain('settings');
  });
});
