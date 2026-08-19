import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountScreen } from '@/cms/ui/AccountScreen';

/** Cambiar la propia contraseña (#106, sobre `changePassword` de #81). */

function montar(overrides: Partial<Parameters<typeof AccountScreen>[0]> = {}) {
  const onCambiar = vi.fn(async () => ({ ok: true }));

  render(<AccountScreen correo="ana@ejemplo.com" onCambiar={onCambiar} {...overrides} />);

  return { onCambiar };
}

async function rellenar(nueva: string, repetida: string) {
  await userEvent.type(screen.getByLabelText('Tu contraseña actual'), 'la-de-siempre-larga');
  await userEvent.type(screen.getByLabelText('La nueva'), nueva);
  await userEvent.type(screen.getByLabelText('Repite la nueva'), repetida);
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar la contraseña' }));
}

describe('cambiar la contraseña', () => {
  it('avisa ANTES de que cerrará la sesión', () => {
    montar();

    // Quien cambia su contraseña y de pronto se ve en la pantalla de acceso, sin aviso, piensa
    // que algo se ha roto. Y lo que ha pasado es justo lo que quería que pasara (ADR-301).
    expect(screen.getByText(/tendrás que volver a entrar/)).toBeInTheDocument();
  });

  it('si las dos nuevas no coinciden, no se manda nada', async () => {
    const { onCambiar } = montar();

    await rellenar('una-contrasena-larga', 'otra-contrasena-larga');

    expect(await screen.findByText(/no coinciden/)).toBeInTheDocument();
    // La repetición no es un dato: es para no equivocarse al teclear a ciegas. Mandarla al
    // servidor sería mandar una contraseña más por la red para nada.
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('manda la actual y la nueva, en ese orden', async () => {
    const { onCambiar } = montar();

    await rellenar('una-contrasena-larga', 'una-contrasena-larga');

    expect(onCambiar).toHaveBeenCalledWith('la-de-siempre-larga', 'una-contrasena-larga');
  });

  it('un rechazo del servidor se cuenta', async () => {
    const onCambiar = vi.fn(async () => ({
      ok: false,
      message: 'La contraseña actual no es correcta.',
    }));
    montar({ onCambiar });

    await rellenar('una-contrasena-larga', 'una-contrasena-larga');

    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeInTheDocument();
  });

  it('los tres campos son de contraseña, no de texto', () => {
    montar();

    // Un `type="text"` aquí deja la contraseña a la vista de quien pase por detrás y, peor, la
    // ofrece al autocompletado del navegador como si fuera un nombre.
    for (const etiqueta of ['Tu contraseña actual', 'La nueva', 'Repite la nueva']) {
      expect(screen.getByLabelText(etiqueta)).toHaveAttribute('type', 'password');
    }
  });
});
