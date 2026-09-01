import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelShell } from '@/cms/ui/PanelShell';
import { ANILLO_DE_FOCO, BOTON_ICONO, BOTON_PRINCIPAL, CAMPO } from '@/cms/ui/estilos';

/**
 * T-213-3 y T-213-4: **el panel se puede usar desde un móvil** (spec 10 §5, issue #220).
 *
 * ## Lo que este fichero puede comprobar, y lo que no
 *
 * jsdom **no maqueta**: no aplica la hoja de estilos, no resuelve `@media` y todas las cajas
 * miden cero. Así que aquí no se puede medir un ancho ni comprobar que algo desaparece a 390 px.
 * Eso lo miden los e2e, con un navegador de verdad y una ventana de móvil.
 *
 * Lo que sí se puede comprobar, y es donde vive el error que se repite:
 *
 * - Que las secciones se alcanzan **con un solo juego de enlaces**. La primera versión de #220
 *   tenía dos navegaciones —una para el móvil y otra para el escritorio— y los enlaces salían
 *   duplicados en el DOM. Se descubrió porque los tests del armazón se pusieron rojos, y tenían
 *   razón por debajo de lo que decían: dos árboles que dicen lo mismo se separan en cuanto
 *   alguien toque uno.
 * - Que las clases que fijan los 44 px están **en el vocabulario común** y no repartidas. Es una
 *   comprobación sobre cadenas, sí; lo que evita es que la próxima pantalla nazca incumpliendo
 *   el mínimo, que es como se llegó a once de catorce.
 */

function montar(rutaActual = '/admin') {
  render(
    <PanelShell
      rol="admin"
      nombreDeUsuario="Ana"
      rutaActual={rutaActual}
      onSalir={vi.fn()}
      tema={null}
      onCambiarDeTema={vi.fn()}
    >
      <p>contenido</p>
    </PanelShell>
  );
}

describe('T-213-4 — se llega a las cuatro secciones con un solo juego de enlaces', () => {
  it('hay una sola navegación de secciones, no una por tamaño de pantalla', () => {
    montar();

    // `getAllByRole` y no `getByRole`: lo que se afirma es **cuántas hay**, y con `getByRole`
    // el fallo sería una excepción de la librería en vez de un número que se lee.
    const navegaciones = screen.getAllByRole('navigation', { name: 'Secciones del panel' });

    expect(
      navegaciones,
      'dos navegaciones con las mismas secciones son dos sitios que mantener, y en el DOM ' +
        'salen los enlaces duplicados aunque el CSS esconda una'
    ).toHaveLength(1);
  });

  it('y cada sección aparece una sola vez', () => {
    montar();

    const seccion = screen.getAllByRole('navigation', { name: 'Secciones del panel' })[0]!;

    for (const texto of ['Contenido', 'Imágenes', 'Personas', 'Ajustes']) {
      expect(within(seccion).getAllByRole('link', { name: texto }), texto).toHaveLength(1);
    }
  });

  it('la sección en la que estás se marca con aria-current, esté como esté pintada', () => {
    // La barra de abajo marca lo activo con color y la columna con un fondo. Ninguna de las dos
    // cosas existe para quien navega con lector de pantalla: lo que lo dice es esto.
    montar('/admin/media');

    const seccion = screen.getAllByRole('navigation', { name: 'Secciones del panel' })[0]!;

    expect(within(seccion).getByRole('link', { name: 'Imágenes' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(seccion).getByRole('link', { name: 'Contenido' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('el texto de cada sección sigue estando, no solo el icono', () => {
    // «Iconos antes que descripciones» es sobre el orden y el peso visual, no sobre quitar las
    // palabras: cuatro iconos mudos en una barra son cuatro adivinanzas, y el vocabulario lo
    // fija `SPEC.md` §9. Sin este caso, la tentación de dejar solo el dibujo no la para nada.
    montar();

    const seccion = screen.getAllByRole('navigation', { name: 'Secciones del panel' })[0]!;

    for (const texto of ['Contenido', 'Imágenes', 'Personas', 'Ajustes']) {
      expect(within(seccion).getByText(texto)).toBeInTheDocument();
    }
  });
});

describe('T-213-3 — el mínimo de 44 px vive en el vocabulario, no en cada pantalla', () => {
  it('los botones y los campos lo llevan de fábrica', () => {
    // `h-11` y `min-h-11` son 44 px en la escala de Tailwind. Que estén aquí y no en cada
    // componente es lo que hace que la próxima pantalla no nazca incumpliéndolo — que es como
    // se llegó a once de catorce zonas pulsables por debajo del mínimo (spec 10 §2).
    expect(BOTON_PRINCIPAL).toContain('h-11');
    expect(BOTON_ICONO).toContain('size-11');

    // El campo lleva `min-h` y no `h`: tiene que poder crecer con el texto, pero nunca encoger
    // por debajo. Medido en un móvil antes de esto: los del editor daban **42 px**, porque la
    // altura salía del relleno y de la letra, y la letra cambió.
    expect(CAMPO).toContain('min-h-11');
  });

  it('y todo lo pulsable lleva su anillo de foco', () => {
    // Sobre cristal el anillo por defecto del navegador se pierde entre el desenfoque y el filo.
    // No es estética: sin él, quien navega con teclado deja de saber dónde está.
    for (const clase of [BOTON_PRINCIPAL, BOTON_ICONO, CAMPO]) {
      expect(clase).toContain(ANILLO_DE_FOCO);
    }
  });
});
