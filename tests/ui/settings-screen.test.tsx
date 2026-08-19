import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from '@/cms/ui/SettingsScreen';

/** Los ajustes del sitio (#106, ADR-410). */

function montar(overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) {
  const onGuardar = vi.fn(async () => ({ ok: true }));

  render(
    <SettingsScreen
      nombreDelSitio="Mi sitio"
      seo={{ defaultTitle: 'Un título' }}
      onGuardar={onGuardar}
      {...overrides}
    />
  );

  return { onGuardar };
}

describe('los ajustes', () => {
  it('dice que esto NO se publica, que es lo contrario del resto del panel', () => {
    montar();

    // Quien lleva media hora publicando textos llega con la costumbre puesta. Aquí guardar
    // cambia la web al momento, y hay que decirlo antes de que pulse.
    expect(screen.getByText(/se aplican a tu web en cuanto los guardas/)).toBeInTheDocument();
  });

  it('guardar el nombre manda solo esa clave', async () => {
    const { onGuardar } = montar();

    const nombre = screen.getByLabelText('Nombre del sitio');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, 'Otro nombre');
    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[0]!);

    // Son dos guardados distintos porque son dos claves distintas. Mandar las dos cada vez
    // pisaría lo que la otra tuviera escrito sin que nadie lo hubiera tocado.
    expect(onGuardar).toHaveBeenCalledWith('site', { siteName: 'Otro nombre' });
  });

  it('guardar lo de compartir manda sus tres campos', async () => {
    const { onGuardar } = montar();

    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[1]!);

    expect(onGuardar).toHaveBeenCalledWith('seo', {
      defaultTitle: 'Un título',
      defaultDescription: '',
      ogImageUrl: '',
    });
  });

  it('un campo rechazado enseña el motivo en su sitio', async () => {
    const onGuardar = vi.fn(async () => ({
      ok: false,
      errores: [{ path: 'ogImageUrl', message: 'Usa una ruta interna o una dirección http(s).' }],
    }));
    montar({ onGuardar });

    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[1]!);

    expect(await screen.findByText(/Usa una ruta interna/)).toBeInTheDocument();
    // Y el campo queda marcado, no solo con texto rojo debajo: quien navega con lector de
    // pantalla no ve el color.
    expect(screen.getByLabelText('Imagen al compartir')).toHaveAttribute('aria-invalid', 'true');
  });

  it('al guardar bien lo dice, y dice que ya está en la web', async () => {
    montar();

    await userEvent.click(screen.getAllByRole('button', { name: 'Guardar' })[0]!);

    expect(await screen.findByText(/Ya está en tu web/)).toBeInTheDocument();
  });
});
