import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { s } from '@/cms/core/config';
import { CampoTextoRico } from '@/cms/ui/fields/RichTextField';

/**
 * El editor de texto rico y los cambios de valor que vienen de fuera.
 *
 * `useEditor` recibe `content` una sola vez, al crearse. Sin sincronizar, el editor se queda
 * con lo de antes cuando alguien recupera el borrador local (#103), restaura una revisión
 * (#105) o recarga tras un conflicto de versión — y como no dispara `onChange`, lo siguiente
 * que se guarde sería el texto viejo pisando el que se acaba de recuperar.
 *
 * ## Lo que estos tests NO cubren, y por qué no lo intentan
 *
 * Que el cursor no salte al escribir. jsdom no maqueta: no hay cajas ni posiciones, así que
 * ProseMirror no puede situar el punto de inserción y todo lo tecleado entra al principio del
 * documento. Lo comprobé quitando el efecto de sincronización por completo: **resultado
 * idéntico**, o sea que el salto es del entorno y no del código.
 *
 * Escribir aquí un aserto sobre el cursor daría verde por el motivo equivocado, que es peor
 * que no tenerlo. Ese caso va al e2e del editor (#103), con un navegador de verdad.
 */

const CAMPO = s.object({ cuerpo: s.richtext({ label: 'Cuerpo' }) }).fields.cuerpo;

function doc(texto: string) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }],
  };
}

describe('el editor sigue al valor de fuera', () => {
  it('un cambio de valor desde fuera se refleja en el editor', async () => {
    const { rerender } = render(
      <CampoTextoRico id="c" field={CAMPO} value={doc('lo primero')} onChange={vi.fn()} />
    );

    expect(await screen.findByText('lo primero')).toBeInTheDocument();

    rerender(
      <CampoTextoRico id="c" field={CAMPO} value={doc('lo recuperado')} onChange={vi.fn()} />
    );

    expect(await screen.findByText('lo recuperado')).toBeInTheDocument();
  });

  it('aplicar un valor de fuera no cuenta como una edición', async () => {
    // Recuperar un borrador no puede disparar un guardado de algo que acaba de leerse del
    // servidor: sería una escritura inútil y un `version` gastado por nada.
    //
    // **Este test es el vigilante de `emitUpdate: false`** (#121), y sí distingue: poniéndolo a
    // `true` a propósito, `onChange` se llama una vez y esto cae. Una nota anterior decía lo
    // contrario —que la mutación sobrevivía— y era falsa.
    //
    // Lo que vigila no es la línea, es el riesgo: si una versión futura de Tiptap dejara de
    // honrar la marca `preventUpdate`, recuperar un borrador dispararía un guardado de algo que
    // acaba de leerse del servidor. Aquí se enteraría CI, no un editor.
    const onChange = vi.fn();

    const { rerender } = render(
      <CampoTextoRico id="c" field={CAMPO} value={doc('uno')} onChange={onChange} />
    );
    await screen.findByText('uno');
    onChange.mockClear();

    rerender(<CampoTextoRico id="c" field={CAMPO} value={doc('dos')} onChange={onChange} />);
    await screen.findByText('dos');

    expect(onChange).not.toHaveBeenCalled();
  });
});
