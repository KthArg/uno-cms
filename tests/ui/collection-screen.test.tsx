import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ElementoDeColeccion } from '@/cms/core/collections';
import { CollectionScreen } from '@/cms/ui/CollectionScreen';

/** La pantalla de una colección (#111): ordenar, crear y eliminar. */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ELEMENTOS: ElementoDeColeccion[] = [
  { key: 'testimonials.a', titulo: 'Ana', estado: 'publicado', sortOrder: 0 },
  { key: 'testimonials.b', titulo: 'Bruno', estado: 'sin-publicar', sortOrder: 1 },
  { key: 'testimonials.c', titulo: 'Carmen', estado: 'con-cambios', sortOrder: 2 },
];

function montar(overrides: Partial<Parameters<typeof CollectionScreen>[0]> = {}) {
  const onReordenar = vi.fn(async () => ({ ok: true }));
  const onEliminar = vi.fn(async () => ({ ok: true }));
  const onCrear = vi.fn(async () => ({ ok: true, key: 'testimonials.nuevo' }));

  render(
    <CollectionScreen
      nombreColeccion="Testimonios"
      elementos={ELEMENTOS}
      onCrear={onCrear}
      onReordenar={onReordenar}
      onEliminar={onEliminar}
      puedeEliminar
      {...overrides}
    />
  );

  return { onReordenar, onEliminar, onCrear };
}

describe('ordenar', () => {
  it('mueve un elemento y manda la lista COMPLETA', async () => {
    const { onReordenar } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Bajar Ana' }));

    // `reorderItems` rechaza las listas parciales (#80), así que la interfaz no puede
    // mandarlas: se manda entera y en su orden nuevo, no un "mueve este de aquí a allá".
    expect(onReordenar).toHaveBeenCalledWith([
      'testimonials.b',
      'testimonials.a',
      'testimonials.c',
    ]);
  });

  it('el nombre accesible de cada botón dice qué se mueve', () => {
    montar();

    // "Subir" a secas, repetido tres veces, no distingue nada para quien navega con lector de
    // pantalla: oiría "botón Subir, botón Subir, botón Subir".
    expect(screen.getByRole('button', { name: 'Subir Bruno' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bajar Carmen' })).toBeInTheDocument();
  });

  it('el primero no se puede subir ni el último bajar', () => {
    montar();

    expect(screen.getByRole('button', { name: 'Subir Ana' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar Carmen' })).toBeDisabled();
  });

  it('si el servidor rechaza el orden, la pantalla vuelve al anterior', async () => {
    const onReordenar = vi.fn(async () => ({
      ok: false,
      message: 'La lista ha cambiado mientras la reordenabas.',
    }));
    montar({ onReordenar });

    await userEvent.click(screen.getByRole('button', { name: 'Bajar Ana' }));

    // Dejar la pantalla con un orden que la base de datos no tiene es peor que no haber movido
    // nada: el editor cree que ya está y se va.
    expect(await screen.findByText(/La lista ha cambiado/)).toBeInTheDocument();
    const nombres = screen.getAllByRole('link').map((enlace) => enlace.textContent);
    expect(nombres).toEqual(['Ana', 'Bruno', 'Carmen']);
  });
});

describe('eliminar', () => {
  it('pide confirmación diciendo qué se pierde, no «¿estás seguro?»', async () => {
    montar();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Ana' }));

    // El nombre del elemento y qué pasa con la web. Un cuadro genérico se acepta sin leer a la
    // tercera vez, y entonces solo añade un clic.
    expect(screen.getByRole('alertdialog', { name: /¿Eliminar «Ana»\?/ })).toBeInTheDocument();
    expect(screen.getByText(/también desaparecerá de tu web/)).toBeInTheDocument();
  });

  it('lo que no está publicado dice que la web no cambia', async () => {
    montar();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Bruno' }));

    expect(screen.getByText(/tu web no cambia/)).toBeInTheDocument();
  });

  it('cancelar no elimina nada', async () => {
    const { onEliminar } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Ana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onEliminar).not.toHaveBeenCalled();
  });

  it('Escape cierra la confirmación', async () => {
    const { onEliminar } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Ana' }));
    await userEvent.keyboard('{Escape}');

    // Sin esto, quien navega con teclado se queda encerrado en un cuadro que ha abierto sin
    // querer.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onEliminar).not.toHaveBeenCalled();
  });

  it('el foco entra en Cancelar, no en el botón destructivo', async () => {
    montar();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar Ana' }));

    // Quien confirma con Intro sin haber leído acaba de cancelar, que es el error barato de
    // los dos.
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('un editor sin permiso no ve el botón de eliminar', () => {
    montar({ puedeEliminar: false });

    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });
});

describe('lista vacía', () => {
  it('explica cómo empezar en vez de enseñar un hueco', () => {
    montar({ elementos: [] });

    expect(screen.getByText(/Todavía no hay nada en esta lista/)).toBeInTheDocument();
    expect(screen.getByText(/No se verá en tu web hasta que lo publiques/)).toBeInTheDocument();
  });
});
