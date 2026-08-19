import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
    // El test fija el **comportamiento**, no la línea que lo produce. Conviene saberlo: al
    // poner `emitUpdate: true` a propósito, esto sigue pasando, así que la opción no es lo que
    // lo sostiene en esta versión de Tiptap. Está anotado en el componente.
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

  it('escribir no reinicia el contenido', async () => {
    // **Lo que este test NO puede comprobar, y conviene decirlo:** que el cursor no salte.
    // En jsdom no hay maquetación, así que ProseMirror no puede situar el punto de inserción
    // a partir de un clic y todo lo tecleado entra al principio del documento. Lo comprobé
    // quitando el efecto de sincronización: el resultado es idéntico, o sea que el salto es
    // del entorno de test y no del código.
    //
    // Lo que sí es observable, y es lo que el efecto podría romper de verdad: que escribir no
    // borre lo que había ni pierda caracteres por el camino. La posición del cursor se
    // verifica en el e2e del editor, con un navegador de verdad (#103).
    function Contenedor() {
      const [valor, setValor] = useState<unknown>(doc('hola'));
      return <CampoTextoRico id="c" field={CAMPO} value={valor} onChange={setValor} />;
    }

    render(<Contenedor />);
    const editor = await screen.findByText('hola');

    await userEvent.click(editor);
    await userEvent.keyboard('abc');

    const texto = document.querySelector('#c')?.textContent ?? '';
    expect(texto).toContain('hola');
    for (const letra of ['a', 'b', 'c']) expect(texto).toContain(letra);
  });
});
