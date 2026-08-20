import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewProvider } from '@/cms/preview/PreviewProvider';
import { useCollection, useContent } from '@/cms/preview/useContent';

/**
 * T-J-3 a T-J-5: lo que el proveedor de la vista previa **ignora** (SPEC §6.1 paso 4, §6.2).
 *
 * Los casos felices se prueban de punta a punta con un iframe de verdad; aquí van los mensajes
 * hostiles, que no se pueden montar contra un navegador real sin un segundo origen.
 */

function Sonda() {
  const hero = useContent('hero');
  return <p>título: {hero.title ?? '(vacío)'}</p>;
}

function montar(objetivo: { key: string; coleccion?: string; indice?: number } = { key: 'hero' }) {
  render(
    <PreviewProvider initial={{ hero: { title: 'inicial' } }} objetivo={objetivo}>
      <Sonda />
    </PreviewProvider>
  );
}

/**
 * Manda un mensaje como si viniera del panel, y **espera a que React acabe de repintar**.
 *
 * El `act` no es ceremonia: la primera versión de estos tests usaba `waitFor` con la aserción
 * de que nada había cambiado, y `waitFor` acierta en su **primera** comprobación — que ocurre
 * antes de que React haya procesado el cambio de estado. Los cuatro mutantes sobrevivían:
 * quitando la comprobación de origen, la de clave, la de orden o la de forma, los quince tests
 * seguían en verde.
 *
 * Con `act`, si el mensaje se aplica el DOM ya lo refleja cuando se afirma sobre él.
 */
async function mandar(data: unknown, origin = window.location.origin) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  });
}

describe('el mensaje válido se aplica', () => {
  it('cambia lo que enseña la sección, sin recargar ni pedir nada', async () => {
    montar();

    await mandar({ type: 'cms:update', key: 'hero', data: { title: 'escrito ahora' }, seq: 1 });

    expect(screen.getByText(/título: escrito ahora/)).toBeInTheDocument();
  });
});

describe('T-J-3 y T-J-4: lo que se ignora', () => {
  it('un mensaje de OTRO origen no se aplica', async () => {
    montar();

    await mandar(
      { type: 'cms:update', key: 'hero', data: { title: 'de fuera' }, seq: 1 },
      'https://evil.example'
    );

    // Y se ignora **en silencio**: contestar —aunque fuera para rechazarlo— confirmaría que hay
    // alguien escuchando en este iframe.
    expect(screen.getByText(/título: inicial/)).toBeInTheDocument();
  });

  it.each([
    ['sin tipo', { key: 'hero', data: { title: 'x' }, seq: 1 }],
    ['con otro tipo', { type: 'otra:cosa', key: 'hero', data: { title: 'x' }, seq: 1 }],
    ['sin clave', { type: 'cms:update', data: { title: 'x' }, seq: 1 }],
    [
      'con seq que no es número',
      { type: 'cms:update', key: 'hero', data: { title: 'x' }, seq: '1' },
    ],
    ['con data que no es objeto', { type: 'cms:update', key: 'hero', data: 'x', seq: 1 }],
    ['con data nula', { type: 'cms:update', key: 'hero', data: null, seq: 1 }],
    ['que no es un objeto', 'cms:update'],
    ['nulo', null],
  ])('un mensaje %s no se aplica', async (_nombre, mensaje) => {
    montar();

    await mandar(mensaje);

    expect(screen.getByText(/título: inicial/)).toBeInTheDocument();
  });

  it('un mensaje para OTRA clave no se aplica, aunque venga bien formado', async () => {
    montar();

    // Es ADR-501 llevado hasta el final: el token autoriza una clave, y el iframe solo acepta
    // cambios de esa. Sin esto, un mensaje podría enseñar contenido que ese enlace no autoriza.
    await mandar({ type: 'cms:update', key: 'about', data: { heading: 'otra' }, seq: 1 });

    expect(screen.getByText(/título: inicial/)).toBeInTheDocument();
  });
});

describe('T-J-5: los mensajes que se cruzan', () => {
  it('un seq viejo no pisa a uno nuevo', async () => {
    montar();

    await mandar({ type: 'cms:update', key: 'hero', data: { title: 'el nuevo' }, seq: 5 });
    expect(screen.getByText(/título: el nuevo/)).toBeInTheDocument();

    // `postMessage` no promete orden entre dos ventanas. Sin descartarlo, quien mira ve su texto
    // **retroceder solo**, que es peor que un retraso.
    await mandar({ type: 'cms:update', key: 'hero', data: { title: 'el viejo' }, seq: 3 });

    expect(screen.getByText(/título: el nuevo/)).toBeInTheDocument();
  });

  it('el mismo seq repetido tampoco se vuelve a aplicar', async () => {
    montar();

    await mandar({ type: 'cms:update', key: 'hero', data: { title: 'primero' }, seq: 7 });
    expect(screen.getByText(/título: primero/)).toBeInTheDocument();

    await mandar({ type: 'cms:update', key: 'hero', data: { title: 'repetido' }, seq: 7 });

    expect(screen.getByText(/título: primero/)).toBeInTheDocument();
  });
});

describe('un elemento de colección se sustituye en su sitio', () => {
  function SondaLista() {
    const items = useCollection('testimonials');
    return <p>{items.map((item) => item.author).join(', ')}</p>;
  }

  it('conserva el orden y los vecinos', async () => {
    render(
      <PreviewProvider
        initial={{ testimonials: [{ author: 'Ana' }, { author: 'Bruno' }, { author: 'Carmen' }] }}
        objetivo={{ key: 'testimonials.b', coleccion: 'testimonials', indice: 1 }}
      >
        <SondaLista />
      </PreviewProvider>
    );

    await mandar({
      type: 'cms:update',
      key: 'testimonials.b',
      data: { author: 'BRUNO EDITADO' },
      seq: 1,
    });

    // Si se sustituyera la lista entera, o se añadiera al final, la vista previa dejaría de
    // enseñar la página que se va a publicar.
    expect(screen.getByText('Ana, BRUNO EDITADO, Carmen')).toBeInTheDocument();
  });
});

describe('el iframe avisa de que está listo', () => {
  it('manda cms:ready al montar, con el origen explícito', () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);

    try {
      montar();

      // Sin este aviso, el panel manda el primer cambio antes de que haya nadie escuchando y
      // quien edita ve su primera letra desaparecer.
      expect(postMessage).toHaveBeenCalledWith({ type: 'cms:ready' }, window.location.origin);
    } finally {
      postMessage.mockRestore();
    }
  });
});
