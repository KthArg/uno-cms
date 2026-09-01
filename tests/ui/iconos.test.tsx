import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icono } from '@/cms/ui/iconos';

/**
 * T-215-6: **cada icono con significado lleva su texto accesible; los decorativos se ocultan**
 * (spec 11 §5, issue #224).
 *
 * ## Por qué esto se comprueba en el componente y no pantalla por pantalla
 *
 * Porque pantalla por pantalla es una lista que se queda corta el día que alguien añade la
 * siguiente. Aquí la propiedad se comprueba **donde se decide**: si el envoltorio hace lo
 * correcto en los dos casos, ningún icono del panel puede estar mal, porque no hay otra forma
 * de pintar uno — y de eso se encarga la guarda estática que prohíbe los `<svg>` a mano.
 *
 * ## Y por qué importa
 *
 * Un icono sin `aria-hidden` al lado de la palabra que dice lo mismo hace que un lector de
 * pantalla lea «papelera Eliminar». Uno solo, sin nombre, se anuncia como nada: un botón vacío.
 * Los dos fallos son invisibles mirando la pantalla, que es lo que hace que se acumulen.
 */

describe('T-215-6 — los iconos y el lector de pantalla', () => {
  it('sin etiqueta queda oculto: es decoración al lado del texto que ya lo dice', () => {
    const { container } = render(<Icono de="publicar" />);
    const dibujo = container.querySelector('svg');

    expect(dibujo).toHaveAttribute('aria-hidden', 'true');
    // Sin `role`, para que no se anuncie como imagen sin nombre — que es peor que no anunciarse.
    expect(dibujo).not.toHaveAttribute('role', 'img');
  });

  it('con etiqueta se anuncia, y con ese nombre', () => {
    render(<Icono de="alerta" etiqueta="Atención" />);

    // `getByRole('img', { name })` es exactamente lo que resuelve un lector de pantalla: si esto
    // pasa, el icono es alcanzable y se llama como debe.
    expect(screen.getByRole('img', { name: 'Atención' })).toBeInTheDocument();
  });

  it('un icono oculto no aparece como imagen para nadie', () => {
    // El caso contrario del anterior. Sin él, un envoltorio que pusiera `role="img"` siempre
    // pasaría el de arriba y dejaría el panel lleno de imágenes anónimas.
    render(<Icono de="publicar" />);

    expect(screen.queryByRole('img')).toBeNull();
  });

  it('el tamaño y el trazo son los del panel salvo que se pidan otros', () => {
    // No es estética: el trazo de fábrica de la librería es 2, y sobre cristal se lee como una
    // mancha. Que el valor viva en el envoltorio es lo que evita tener que acordarse en cada uso.
    const { container } = render(<Icono de="publicar" />);
    const dibujo = container.querySelector('svg');

    expect(dibujo).toHaveAttribute('stroke-width', '1.75');
    expect(dibujo).toHaveAttribute('width', '20');

    const { container: menudo } = render(<Icono de="publicar" tamano={14} />);
    expect(menudo.querySelector('svg')).toHaveAttribute('width', '14');
  });

  it('las clases que se le pasan se suman a las suyas, no las sustituyen', () => {
    // `shrink-0` lo pone el envoltorio porque dentro de un flex con texto largo un icono sin él
    // se aplasta hasta volverse un garabato. Si `className` lo pisara, ese fallo volvería solo
    // en las pantallas con textos que desbordan — o sea, tarde.
    const { container } = render(<Icono de="publicar" className="text-alarma" />);
    const dibujo = container.querySelector('svg');

    expect(dibujo?.getAttribute('class')).toContain('shrink-0');
    expect(dibujo?.getAttribute('class')).toContain('text-alarma');
  });
});
