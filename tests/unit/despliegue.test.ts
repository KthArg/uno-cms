import { describe, expect, it, vi } from 'vitest';

/**
 * `spawnSync` simulado **antes** de importar el script.
 *
 * Es lo que convierte el último caso en una comprobación de verdad: si la parte que lanza
 * `drizzle-kit` se ejecutara al importar el módulo, este espía lo vería. Sin simularlo, la suite
 * unitaria podría aplicar migraciones contra la base que tuviera delante quien la ejecute.
 */
const lanzado = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawnSync: lanzado }));
import { AVISO_SIN_BASE, decidir } from '@/scripts/migrar-al-desplegar.mjs';

/**
 * T-192-1 … T-192-3: **la construcción del despliegue aplica las migraciones** (ADR-702, #192).
 *
 * Antes no las aplicaba nadie fuera de CI, y un despliegue nuevo se quedaba con una base sin
 * tablas: comprobado contra una base vacía, `/setup` respondía 500 con `relation "settings" does
 * not exist`. El README promete un botón de un clic.
 */

describe('T-192-1 y T-192-2 — cuándo se migra', () => {
  it('con una dirección de base de datos, se migra', () => {
    expect(decidir({ DATABASE_URL: 'postgres://alguien@donde/base' })).toBe('migrar');
  });

  it('sin ella no se falla: se salta', () => {
    // **Es el caso que se rompe sin querer al arreglar el otro.** El job de `build` de CI
    // construye sin base de datos a propósito —`next build` es también el guard de la frontera
    // servidor/cliente de §7.1— y exigirla aquí dejaría el pipeline en rojo por algo que no es
    // un fallo.
    expect(decidir({})).toBe('saltar');
    expect(decidir({ DATABASE_URL: undefined })).toBe('saltar');
  });

  it('una variable declarada y vacía cuenta como ausente', () => {
    // Es lo que queda al declararla en un panel de despliegue y no rellenarla. Tratarla como una
    // dirección haría fallar la construcción con un error de conexión en vez de con el aviso de
    // que falta, que es el que dice qué hacer.
    for (const vacia of ['', '   ', '\t']) {
      expect(decidir({ DATABASE_URL: vacia }), JSON.stringify(vacia)).toBe('saltar');
    }
  });

  it('un valor que no es una cadena tampoco cuela', () => {
    expect(decidir({ DATABASE_URL: 1234 as unknown as string })).toBe('saltar');
  });

  it('el aviso dice qué significa saltárselas en un despliegue de verdad', () => {
    // Saltarlas es correcto en CI y **es un problema** en un despliegue. Un aviso que solo
    // dijera "no se migró" dejaría a quien lo lea sin saber cuál de los dos casos tiene delante.
    expect(AVISO_SIN_BASE).toContain('DATABASE_URL');
    expect(AVISO_SIN_BASE).toMatch(/despliegue/i);
  });
});

describe('T-192-3 — importar el módulo no migra nada', () => {
  it('no se lanza `drizzle-kit` al importarlo', () => {
    // Este fichero **importa** el script arriba del todo. Si la parte que ejecuta las
    // migraciones corriera al importar, la suite unitaria las aplicaría contra la base que
    // tuviera delante quien la ejecute — que en la máquina de quien desarrolla es la de trabajo.
    // Es el motivo de la comprobación de ejecución directa que lleva el script.
    expect(lanzado).not.toHaveBeenCalled();
  });
});
