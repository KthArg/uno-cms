import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccesoConGoogle } from '@/cms/ui/AccesoConGoogle';

/**
 * T-233-15 y T-233-16: el botón de Google en la pantalla de acceso (spec 13 §6).
 *
 * Se prueba el componente y no la página porque la página es un componente de servidor
 * asíncrono que lee la sesión: montarla en jsdom obligaría a simular medio Auth.js para
 * comprobar algo de una línea. Lo que la página aporta —de dónde sale el booleano— es el caso
 * T-233-1, y que el proveedor exista de verdad es T-233-2.
 */

function accionVacia() {
  // La acción real es una Server Action; aquí solo importa que el formulario tenga una.
}

describe('T-233-15 — sin Google configurado no hay botón', () => {
  it('no se pinta nada en absoluto', () => {
    const { container } = render(<AccesoConGoogle disponible={false} entrar={accionVacia} />);

    expect(screen.queryByRole('button', { name: /google/i })).toBeNull();
    // Y tampoco el separador: un "o" suelto debajo del formulario, sin nada detrás, es peor
    // que no poner nada — parece que falta algo por cargar.
    expect(container).toBeEmptyDOMElement();
  });
});

describe('T-233-16 — con Google configurado aparece el botón', () => {
  it('con su nombre accesible', () => {
    render(<AccesoConGoogle disponible entrar={accionVacia} />);

    expect(screen.getByRole('button', { name: 'Entrar con Google' })).toBeInTheDocument();
  });

  it('y el logotipo va oculto al lector de pantalla', () => {
    // La palabra «Google» ya está escrita en el botón. Anunciar además el dibujo lo leería dos
    // veces, que es exactamente lo que evita el envoltorio `Icono` para el resto del panel.
    const { container } = render(<AccesoConGoogle disponible entrar={accionVacia} />);
    const dibujo = container.querySelector('svg');

    expect(dibujo).not.toBeNull();
    expect(dibujo?.getAttribute('aria-hidden')).toBe('true');
  });

  it('el separador es decorativo y no se anuncia', () => {
    const { container } = render(<AccesoConGoogle disponible entrar={accionVacia} />);

    expect(container.querySelector('[aria-hidden="true"].flex')).not.toBeNull();
  });
});
