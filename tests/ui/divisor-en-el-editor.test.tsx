import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObjectSchema } from '@/cms/core/config';
import { EntryEditor } from '@/cms/ui/EntryEditor';
import { MINIMO_DEL_FORMULARIO, PASO_DE_TECLADO } from '@/cms/ui/divisor';

/**
 * T-190-1, T-190-3 y T-190-5: **el divisor dentro del editor** (issue #190).
 *
 * Lo que se comprueba aquí es lo que no cabe en la función pura: que el teclado lo mueva, que el
 * divisor diga por dónde va, y —lo que puede costar caro— que arrastrar **no remonte el
 * iframe**.
 */

const SCHEMA: ObjectSchema = {
  kind: 'object',
  label: 'Portada',
  fields: {
    title: { kind: 'text', label: 'Título principal', required: true },
  },
} as unknown as ObjectSchema;

function pintar() {
  return render(
    <EntryEditor
      nombreSeccion="Portada"
      schema={SCHEMA}
      valoresIniciales={{ title: 'uno' }}
      versionInicial={1}
      guardar={async () => ({ ok: true, version: 2 })}
      publicar={async () => ({ ok: true })}
      deshacer={async () => ({ ok: true })}
      entryKey="hero"
      sePuedeDeshacer={false}
      urlDeVistaPrevia="/preview?token=x"
    />
  );
}

function divisor() {
  return screen.getByRole('separator', { name: /repartir el espacio/i });
}

async function pulsar(tecla: string, veces = 1) {
  const { fireEvent } = await import('@testing-library/react');

  await act(async () => {
    for (let i = 0; i < veces; i += 1) fireEvent.keyDown(divisor(), { key: tecla });
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('T-190-3 — el divisor se puede usar sin ratón', () => {
  it('dice qué es, por dónde va y hasta dónde llega', () => {
    pintar();

    // Sin esto sería un `div` bonito que solo obedece a un puntero, y la pantalla del editor
    // pasaría a repartirse solo con la mano.
    expect(divisor()).toHaveAttribute('aria-orientation', 'vertical');
    expect(divisor()).toHaveAttribute('aria-valuenow');
    expect(divisor()).toHaveAttribute('aria-valuemin', String(MINIMO_DEL_FORMULARIO));
    // Y se le puede llegar tabulando.
    expect(divisor()).toHaveAttribute('tabindex', '0');
  });

  it('las flechas lo mueven, y en la dirección que dicen', async () => {
    pintar();
    const antes = Number(divisor().getAttribute('aria-valuenow'));

    await pulsar('ArrowRight');
    expect(Number(divisor().getAttribute('aria-valuenow'))).toBe(antes + PASO_DE_TECLADO);

    await pulsar('ArrowLeft', 2);
    expect(Number(divisor().getAttribute('aria-valuenow'))).toBe(antes - PASO_DE_TECLADO);
  });

  it('con el teclado tampoco se pasa del tope', async () => {
    pintar();

    // Cuarenta flechas a la izquierda: mucho más de lo que hay.
    await pulsar('ArrowLeft', 40);

    expect(Number(divisor().getAttribute('aria-valuenow'))).toBe(MINIMO_DEL_FORMULARIO);
  });

  it('una tecla que no es una flecha no lo toca', async () => {
    pintar();
    const antes = divisor().getAttribute('aria-valuenow');

    await pulsar('Enter');
    await pulsar('a');

    expect(divisor().getAttribute('aria-valuenow')).toBe(antes);
  });
});

describe('T-190-1 y T-190-4 — mover reparte y se recuerda', () => {
  it('el ancho movido llega al reparto de columnas', async () => {
    const { container } = pintar();
    const rejilla = container.querySelector('[style*="--ancho-formulario"]');

    const antes = rejilla?.getAttribute('style');
    await pulsar('ArrowRight', 3);

    expect(rejilla?.getAttribute('style')).not.toBe(antes);
    expect(rejilla?.getAttribute('style')).toContain('--ancho-formulario');
  });

  it('lo movido se recuerda en el navegador', async () => {
    pintar();
    await pulsar('ArrowRight', 2);

    const guardado = window.localStorage.getItem('unocms:ancho-del-formulario');

    expect(Number(guardado)).toBe(Number(divisor().getAttribute('aria-valuenow')));
  });

  it('y al volver a abrir la pantalla se recupera', () => {
    window.localStorage.setItem('unocms:ancho-del-formulario', '640');

    pintar();

    expect(Number(divisor().getAttribute('aria-valuenow'))).toBe(640);
  });
});

describe('T-190-5 — mover el divisor no recarga el iframe', () => {
  it('es el mismo nodo, con el mismo `src`, después de moverlo diez veces', async () => {
    const { container } = pintar();
    const antes = container.querySelector('iframe');
    const src = antes?.getAttribute('src');

    await pulsar('ArrowRight', 5);
    await pulsar('ArrowLeft', 5);

    // **El mismo nodo del DOM.** Arrastrar dispara decenas de repintados por segundo: si el
    // ancho decidiera qué se pinta en vez de solo un estilo, el iframe se remontaría a cada
    // píxel — y con una web remota eso recarga esa web y vuelve a pedir los borradores en cada
    // movimiento del ratón.
    expect(container.querySelector('iframe')).toBe(antes);
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(src);
  });
});
