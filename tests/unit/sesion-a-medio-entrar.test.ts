import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-V-9 y T-V-10: una sesión a medio entrar no toca nada del panel (spec 20 §3).
 *
 * La sesión `alta` es real —la contraseña era buena—, así que el middleware la deja pasar como a
 * cualquier sesión. Lo que la frena son tres capas, y aquí se comprueban las que no necesitan un
 * servidor: el pipeline de actions, por comportamiento, y el middleware y el layout, por su fuente
 * (el e2e de T-V-16 las ejercita de verdad).
 */

const sesion = vi.hoisted(() => vi.fn());
vi.mock('@/cms/auth', () => ({ auth: sesion }));

describe('T-V-10 — con sesión a medio entrar, ninguna action se ejecuta', () => {
  it('el pipeline la trata como si no hubiera sesión', async () => {
    sesion.mockResolvedValue({
      user: { id: 'u1', email: 'a@ejemplo.com', role: 'admin', mfa: 'alta' },
    });
    const { publish } = await import('@/cms/actions');

    expect(await publish({ key: 'hero', version: 0 })).toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    });
  });

  it('y con la verificación hecha pasa el guard (y falla después, por otra cosa)', async () => {
    // El contraste: sin él, el caso de arriba pasaría también si el pipeline rechazara todo.
    sesion.mockResolvedValue({
      user: { id: 'u1', email: 'a@ejemplo.com', role: 'admin', mfa: 'ok' },
    });
    const { publish } = await import('@/cms/actions');

    const resultado = await publish({ key: 'hero', version: 0 });
    expect(resultado.ok === false && resultado.code).not.toBe('UNAUTHORIZED');
  });
});

describe('T-V-9 — el middleware y el layout mandan a darla de alta', () => {
  it('el middleware redirige toda ruta del panel salvo la de alta', () => {
    const fuente = readFileSync(join(REPO_ROOT, 'middleware.ts'), 'utf8');
    expect(fuente).toContain("mfa !== 'ok'");
    expect(fuente).toContain('path !== RUTA_DE_ALTA_DEL_SEGUNDO_FACTOR');
  });

  it('el layout de (panel) también, que es el guard que vale', () => {
    const fuente = readFileSync(join(REPO_ROOT, 'app', 'admin', '(panel)', 'layout.tsx'), 'utf8');
    expect(fuente).toContain(
      "if (session.user.mfa !== 'ok') redirect(RUTA_DE_ALTA_DEL_SEGUNDO_FACTOR);"
    );
  });
});
