import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StaticContentProvider } from '@/cms/preview/ContentContext';
import { useCollection, useContent } from '@/cms/preview/useContent';
import { About } from '@/components/site/About';
import { Faqs } from '@/components/site/Faqs';
import { Hero } from '@/components/site/Hero';
import { Testimonials } from '@/components/site/Testimonials';

/** T-G-1 a T-G-4: el contrato con los componentes de la landing (SPEC §6.3). */

function Sonda() {
  const hero = useContent('hero');
  return <p>título: {hero.title ?? '(vacío)'}</p>;
}

describe('T-G-1: useContent lee del proveedor', () => {
  it('devuelve el valor publicado', () => {
    render(
      <StaticContentProvider value={{ hero: { title: 'Mi empresa' } }}>
        <Sonda />
      </StaticContentProvider>
    );

    expect(screen.getByText(/título: Mi empresa/)).toBeInTheDocument();
  });
});

describe('T-G-2: sin proveedor, lanza', () => {
  it('y el mensaje dice qué falta y dónde se pone', () => {
    // React registra el error en consola además de propagarlo; se silencia para que el fallo
    // esperado no ensucie la salida de una suite que sí está pasando.
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      // Devolver `undefined` aquí convertiría un error de composición en una sección que se
      // pinta en blanco, y quien lo mirara buscaría el fallo en el contenido — que es donde no
      // está.
      expect(() => render(<Sonda />)).toThrow(/fuera de un proveedor de contenido/);
      expect(() => render(<Sonda />)).toThrow(/StaticContentProvider/);
    } finally {
      consola.mockRestore();
    }
  });
});

describe('T-G-3: con proveedor y sin esa clave, no se cae', () => {
  it('useContent devuelve un objeto vacío', () => {
    render(
      <StaticContentProvider value={{}}>
        <Sonda />
      </StaticContentProvider>
    );

    // Es el estado normal de una instalación recién desplegada (ADR-404). Lanzar aquí tumbaría
    // el sitio entero por no haber escrito todavía.
    expect(screen.getByText(/título: \(vacío\)/)).toBeInTheDocument();
  });

  it('la landing entera renderiza con la base vacía', () => {
    render(
      <StaticContentProvider value={{}}>
        <Hero />
        <About />
        <Testimonials />
        <Faqs />
      </StaticContentProvider>
    );

    // Ninguna sección se pinta y ninguna revienta: una landing sin contenido es una página
    // vacía, no un error.
    expect(document.querySelectorAll('section')).toHaveLength(0);
  });

  it('useCollection devuelve una lista vacía, no undefined', () => {
    function SondaLista() {
      const items = useCollection('testimonials');
      return <p>elementos: {items.length}</p>;
    }

    render(
      <StaticContentProvider value={{}}>
        <SondaLista />
      </StaticContentProvider>
    );

    expect(screen.getByText('elementos: 0')).toBeInTheDocument();
  });

  it('un valor que no tiene la forma esperada se trata como ausente', () => {
    function SondaLista() {
      const items = useCollection('testimonials');
      return <p>elementos: {items.length}</p>;
    }

    // En la vista previa el contenido llega por `postMessage` (#115) y ahí lo que entra no lo
    // escribe el servidor. Que un valor con otra forma no rompa la página es lo que hace que el
    // esquema laxo sea la segunda línea y no la única.
    render(
      <StaticContentProvider value={{ hero: 'esto no es un objeto', testimonials: 42 }}>
        <SondaLista />
        <Sonda />
      </StaticContentProvider>
    );

    expect(screen.getByText('elementos: 0')).toBeInTheDocument();
    expect(screen.getByText(/título: \(vacío\)/)).toBeInTheDocument();
  });
});

describe('T-G-4: cada sección expone data-cms-key', () => {
  it('las cuatro, con la clave de su contenido', () => {
    const { container } = render(
      <StaticContentProvider
        value={{
          hero: { title: 'Portada' },
          about: { heading: 'Sobre nosotros' },
          testimonials: [{ author: 'Ana', quote: 'Muy bien' }],
          faqs: [{ question: '¿Cuánto cuesta?' }],
        }}
      >
        <Hero />
        <About />
        <Testimonials />
        <Faqs />
      </StaticContentProvider>
    );

    // Es lo que permite al panel desplazarse a la sección que se está editando (§6.1). Sin
    // ello, la vista previa de una landing larga enseña siempre la parte de arriba.
    const claves = [...container.querySelectorAll('[data-cms-key]')].map((nodo) =>
      nodo.getAttribute('data-cms-key')
    );

    expect(claves).toEqual(['hero', 'about', 'testimonials', 'faqs']);
  });
});

describe('las secciones deciden qué enseñar', () => {
  it('la portada sin título no se pinta', () => {
    render(
      <StaticContentProvider value={{ hero: { ctaLabel: 'Empezar', ctaHref: '/x' } }}>
        <Hero />
      </StaticContentProvider>
    );

    // Un botón suelto sin titular es peor que una sección ausente.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('el botón necesita texto y destino, no uno de los dos', () => {
    render(
      <StaticContentProvider value={{ hero: { title: 'Hola', ctaLabel: 'Empezar' } }}>
        <Hero />
      </StaticContentProvider>
    );

    expect(screen.getByText('Hola')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('«Sobre nosotros» respeta el interruptor del propio contenido', () => {
    render(
      <StaticContentProvider value={{ about: { heading: 'No se ve', visible: false } }}>
        <About />
      </StaticContentProvider>
    );

    // Quien edita apaga la sección desde el panel, sin borrar lo que escribió y sin tocar código.
    expect(screen.queryByText('No se ve')).not.toBeInTheDocument();
  });

  it('las estrellas se anuncian con su número', () => {
    render(
      <StaticContentProvider
        value={{ testimonials: [{ author: 'Ana', quote: 'Muy bien', rating: 4 }] }}
      >
        <Testimonials />
      </StaticContentProvider>
    );

    // Quien use un lector de pantalla oiría "estrella estrella estrella estrella" sin saber
    // sobre cuántas.
    expect(screen.getByText('4 de 5')).toBeInTheDocument();
  });
});
