import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RevisionDelHistorial } from '@/cms/core/history';
import { HistoryScreen } from '@/cms/ui/HistoryScreen';

/** T-E-2 y T-E-3: el historial y su confirmación (SPEC §9). */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const REVISIONES: RevisionDelHistorial[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    publishedAt: new Date('2026-03-15T10:30:00Z'),
    autor: 'Ana',
    resumen: 'La versión con el titular corto',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    publishedAt: new Date('2026-02-01T09:00:00Z'),
    autor: null,
    resumen: 'La versión de antes',
  },
];

function montar(overrides: Partial<Parameters<typeof HistoryScreen>[0]> = {}) {
  const onRestaurar = vi.fn(async () => ({ ok: true }));

  render(
    <HistoryScreen
      nombreSeccion="Portada"
      entryKey="hero"
      revisiones={REVISIONES}
      onRestaurar={onRestaurar}
      hayCambiosSinPublicar={false}
      {...overrides}
    />
  );

  return { onRestaurar };
}

describe('el historial', () => {
  it('enseña algo del contenido, no solo la fecha', () => {
    montar();

    // Una lista de fechas no permite elegir: quien abre el historial busca "aquella versión en
    // la que el titular decía otra cosa".
    expect(screen.getByText('La versión con el titular corto')).toBeInTheDocument();
    expect(screen.getByText('La versión de antes')).toBeInTheDocument();
  });

  it('cada botón dice de qué versión es', () => {
    montar();

    // Dos botones llamados "Volver a esta versión" no distinguen nada para quien navega con
    // lector de pantalla.
    const botones = screen.getAllByRole('button', { name: /Volver a la versión de/ });
    expect(botones).toHaveLength(2);
    expect(botones[0]?.getAttribute('aria-label')).not.toBe(botones[1]?.getAttribute('aria-label'));
  });

  it('sin revisiones explica cuándo aparecerán', () => {
    montar({ revisiones: [] });

    // Y dice el motivo real, que sorprende: la primera publicación no genera revisión porque no
    // sustituye nada (ADR-402).
    expect(screen.getByText(/Todavía no hay versiones anteriores/)).toBeInTheDocument();
    expect(screen.getByText(/la primera no sustituye nada/)).toBeInTheDocument();
  });
});

describe('T-E-2 y T-E-3: la confirmación de restaurar', () => {
  it('dice que la web NO cambia', async () => {
    montar();

    await userEvent.click(screen.getAllByRole('button', { name: /Volver a la versión de/ })[0]!);

    // La action ya garantiza que restaurar no publica (#79). Que el sistema haga lo correcto no
    // basta si la pantalla no lo explica: el historial es un sitio donde se curiosea.
    expect(screen.getByText(/Tu web no cambia hasta que lo publiques/)).toBeInTheDocument();
  });

  it('avisa de lo que se pierde si hay cambios sin publicar', async () => {
    montar({ hayCambiosSinPublicar: true });

    await userEvent.click(screen.getAllByRole('button', { name: /Volver a la versión de/ })[0]!);

    expect(
      screen.getByText(/lo que tienes escrito sin publicar, que se perderá/)
    ).toBeInTheDocument();
  });

  it('cancelar no restaura nada', async () => {
    const { onRestaurar } = montar();

    await userEvent.click(screen.getAllByRole('button', { name: /Volver a la versión de/ })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onRestaurar).not.toHaveBeenCalled();
  });

  it('Escape cierra la confirmación', async () => {
    const { onRestaurar } = montar();

    await userEvent.click(screen.getAllByRole('button', { name: /Volver a la versión de/ })[0]!);
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onRestaurar).not.toHaveBeenCalled();
  });

  it('el foco entra en Cancelar', async () => {
    montar();

    await userEvent.click(screen.getAllByRole('button', { name: /Volver a la versión de/ })[0]!);

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('confirmar restaura la revisión que se eligió, no otra', async () => {
    const { onRestaurar } = montar();

    await userEvent.click(screen.getAllByRole('button', { name: /Volver a la versión de/ })[1]!);
    await userEvent.click(screen.getByRole('button', { name: 'Sí, volver a esta versión' }));

    expect(onRestaurar).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  });

  it('un fallo del servidor se cuenta en vez de dejar la pantalla igual', async () => {
    const onRestaurar = vi.fn(async () => ({ ok: false, message: 'No hemos encontrado eso.' }));
    montar({ onRestaurar });

    await userEvent.click(screen.getAllByRole('button', { name: /Volver a la versión de/ })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Sí, volver a esta versión' }));

    expect(await screen.findByText('No hemos encontrado eso.')).toBeInTheDocument();
  });
});
