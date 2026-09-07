import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PreviewProvider } from '@/cms/preview/PreviewProvider';
import { useCollection } from '@/cms/preview/useContent';

/**
 * T-246-3: **la vista previa sustituye en su sitio y nunca alarga la lista** (issue #246).
 *
 * ## El síntoma, aquí y sin carreras
 *
 * En `vista-previa.spec.ts` se vio un elemento pintado dos veces dentro del iframe: una fila en la
 * base de datos, una lista, y el mismo texto en dos `<dt>`. La causa estaba en el servidor —el
 * índice se calculaba sobre una lista que incluía los elementos sin publicar, y la que se pinta
 * los deja fuera— y está arreglada en `collectionKeysInOrder`, con sus casos contra Postgres real.
 *
 * Esto es el otro lado: que aunque llegue un índice que no corresponde, **el proveedor no invente
 * un elemento**. `siguiente[7] = data` sobre una lista de dos no falla en JavaScript: la alarga y
 * deja huecos.
 *
 * Se prueba aquí porque es donde se puede provocar sin depender de que dos tests se pisen, que era
 * lo que hacía falta para verlo en la suite de e2e.
 */

function ListaDeSonda() {
  const items = useCollection('faqs');

  return (
    <ul>
      {items.map((item, posicion) => (
        // La posición como clave es lo correcto **en este test**: lo que se está observando es
        // precisamente qué hay en cada posición de la lista.
        <li key={posicion}>{String((item as { question?: string }).question ?? '(hueco)')}</li>
      ))}
    </ul>
  );
}

const LISTA = [{ question: 'primera' }, { question: 'segunda' }];

function montar(indice: number) {
  render(
    <PreviewProvider
      initial={{ faqs: LISTA }}
      objetivo={{ key: 'faqs.b', coleccion: 'faqs', indice }}
    >
      <ListaDeSonda />
    </PreviewProvider>
  );
}

/** Manda un cambio como si viniera del panel, y espera a que React repinte. */
function mandarCambio(data: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'cms:update', key: 'faqs.b', seq: 1, data },
      })
    );
  });
}

describe('T-246-3 — el proveedor no alarga la lista', () => {
  it('con el índice correcto, sustituye en su sitio', () => {
    // El caso feliz va primero porque es el que da sentido a los otros: si esto no pasara, los de
    // abajo estarían comprobando que no ocurre algo que no ocurre nunca.
    montar(1);
    mandarCambio({ question: 'SEGUNDA EDITADA' });

    expect(screen.getAllByRole('listitem').map((n) => n.textContent)).toEqual([
      'primera',
      'SEGUNDA EDITADA',
    ]);
  });

  it('con un índice más allá del final, no pasa nada', () => {
    /*
     * Es el caso que se vio: el índice venía corrido por un elemento sin publicar y caía fuera.
     * Sin la comprobación, la lista pasa a tener tres elementos y el editado aparece **además**
     * del original — que es exactamente el «se ve dos veces» del issue.
     */
    montar(5);
    mandarCambio({ question: 'NO DEBERÍA APARECER' });

    const textos = screen.getAllByRole('listitem').map((n) => n.textContent);

    expect(textos).toHaveLength(2);
    expect(textos).not.toContain('NO DEBERÍA APARECER');
  });

  it('y con un índice negativo, tampoco', () => {
    // `siguiente[-1] = data` no alarga la lista pero le cuelga una propiedad que no es un índice.
    // No se ha visto ocurrir; se cierra porque la comprobación que impide lo de arriba cuesta lo
    // mismo con los dos extremos, y dejar solo uno invita a preguntarse por qué.
    montar(-1);
    mandarCambio({ question: 'TAMPOCO' });

    expect(screen.getAllByRole('listitem').map((n) => n.textContent)).toEqual([
      'primera',
      'segunda',
    ]);
  });
});
