import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PublishAllButton, type PublishAllResult } from '@/cms/ui/PublishAllButton';

/**
 * "Publicar todo" y su continuación automática (#119, SPEC §9).
 *
 * `publishAll` publica como mucho cien entradas por llamada, porque el bucle corre dentro de una
 * Server Action y en serverless la función tiene un límite de duración. El bucle que las encadena
 * vive aquí, en el cliente, donde cada llamada es corta y ninguna choca con ese límite.
 */

function vuelta(overrides: Partial<PublishAllResult> = {}): PublishAllResult {
  return { publicadas: [], fallidas: [], restantes: 0, ...overrides };
}

describe('publicar todo continúa solo', () => {
  it('encadena vueltas hasta que no quedan, y suma los informes', async () => {
    const action = vi
      .fn<() => Promise<PublishAllResult>>()
      .mockResolvedValueOnce(vuelta({ publicadas: ['a', 'b'], restantes: 3 }))
      .mockResolvedValueOnce(vuelta({ publicadas: ['c', 'd'], restantes: 1 }))
      .mockResolvedValueOnce(vuelta({ publicadas: ['e'], restantes: 0 }));

    render(<PublishAllButton action={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar todo' }));

    expect(action).toHaveBeenCalledTimes(3);

    // **El total, no el del último tramo.** Sin acumular, el editor leería "se ha publicado 1
    // sección" después de haber publicado cinco.
    expect(await screen.findByText('Se han publicado 5 secciones.')).toBeInTheDocument();
  });

  it('las que se quedan fuera se cuentan aunque sean de vueltas distintas', async () => {
    const action = vi
      .fn<() => Promise<PublishAllResult>>()
      .mockResolvedValueOnce(
        vuelta({
          publicadas: ['a'],
          fallidas: [{ nombre: 'Portada', motivo: 'Falta Título' }],
          restantes: 2,
        })
      )
      .mockResolvedValueOnce(
        vuelta({
          fallidas: [{ nombre: 'Sobre nosotros', motivo: 'Falta Encabezado' }],
          restantes: 0,
        })
      );

    render(<PublishAllButton action={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar todo' }));

    // ADR-401: todo-o-nada **por entrada**. Perder de vista las que fallaron en una vuelta
    // anterior dejaría al editor creyendo que su sitio está al día.
    expect(await screen.findByText(/Portada/)).toBeInTheDocument();
    expect(screen.getByText(/Sobre nosotros/)).toBeInTheDocument();
  });

  it('se para si una vuelta no avanza, en vez de insistir para siempre', async () => {
    // El servidor dice que quedan y no publica ninguna. Seguir pidiendo sería un bucle infinito
    // contra la base de datos de alguien.
    const action = vi
      .fn<() => Promise<PublishAllResult>>()
      .mockResolvedValue(vuelta({ restantes: 7 }));

    render(<PublishAllButton action={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar todo' }));

    expect(action).toHaveBeenCalledTimes(1);
    // Y no se le manda a repetir lo que acaba de no funcionar.
    expect(await screen.findByText(/Vuelve a intentarlo más tarde/)).toBeInTheDocument();
  });

  it('un error corta la cadena y se cuenta', async () => {
    const action = vi
      .fn<() => Promise<PublishAllResult>>()
      .mockResolvedValueOnce(vuelta({ publicadas: ['a'], restantes: 5 }))
      .mockResolvedValueOnce(vuelta({ error: 'No se ha podido publicar.' }));

    render(<PublishAllButton action={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar todo' }));

    expect(action).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('No se ha podido publicar.')).toBeInTheDocument();
  });

  it('sin nada que publicar lo dice, y no pide una segunda vuelta', async () => {
    const action = vi.fn<() => Promise<PublishAllResult>>().mockResolvedValue(vuelta());

    render(<PublishAllButton action={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar todo' }));

    expect(action).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('No había cambios sin publicar.')).toBeInTheDocument();
  });
});
