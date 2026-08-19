import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PersonaDelPanel } from '@/cms/core/users';
import { UsersScreen } from '@/cms/ui/UsersScreen';

/** La pantalla de personas (#106): invitar, cambiar qué puede hacer alguien y quitar acceso. */

const YO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

const PERSONAS: PersonaDelPanel[] = [
  {
    id: YO,
    nombre: 'Ana',
    correo: 'ana@ejemplo.com',
    rol: 'admin',
    activa: true,
    sinEstrenar: false,
  },
  {
    id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    nombre: 'Bruno',
    correo: 'bruno@ejemplo.com',
    rol: 'editor',
    activa: true,
    sinEstrenar: true,
  },
];

function montar(overrides: Partial<Parameters<typeof UsersScreen>[0]> = {}) {
  const onInvitar = vi.fn(async () => ({
    ok: true,
    enlace: 'https://ejemplo.com/admin/invitacion?c=xyz',
  }));
  const onCambiarRol = vi.fn(async () => ({ ok: true }));
  const onDesactivar = vi.fn(async () => ({ ok: true }));

  render(
    <UsersScreen
      personas={PERSONAS}
      miId={YO}
      onInvitar={onInvitar}
      onCambiarRol={onCambiarRol}
      onDesactivar={onDesactivar}
      {...overrides}
    />
  );

  return { onInvitar, onCambiarRol, onDesactivar };
}

describe('invitar', () => {
  it('enseña el enlace y avisa de que caduca y no se manda solo', async () => {
    montar();

    await userEvent.type(screen.getByLabelText('Nombre'), 'Carmen');
    await userEvent.type(screen.getByLabelText('Correo'), 'carmen@ejemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Invitar' }));

    // Este es el único sitio donde ese enlace existe: §10.2 deja el correo fuera del MVP, así
    // que si quien invita cierra la pantalla sin copiarlo, hay que invitar otra vez.
    expect(await screen.findByDisplayValue(/invitacion\?c=xyz/)).toBeInTheDocument();
    expect(screen.getByText(/Caduca en 24 horas/)).toBeInTheDocument();
    expect(screen.getByText(/No se lo enviamos nosotros/)).toBeInTheDocument();
    expect(screen.getByText(/no vas a poder volver a verlo/)).toBeInTheDocument();
  });

  it('manda lo que se escribió, con lo que podrá hacer', async () => {
    const { onInvitar } = montar();

    await userEvent.type(screen.getByLabelText('Nombre'), 'Carmen');
    await userEvent.type(screen.getByLabelText('Correo'), 'carmen@ejemplo.com');
    await userEvent.selectOptions(screen.getByLabelText('Qué podrá hacer'), 'admin');
    await userEvent.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(onInvitar).toHaveBeenCalledWith({
      nombre: 'Carmen',
      correo: 'carmen@ejemplo.com',
      rol: 'admin',
    });
  });

  it('un fallo se cuenta en vez de dejar la pantalla igual', async () => {
    const onInvitar = vi.fn(async () => ({
      ok: false,
      message: 'Ya hay una cuenta con ese correo.',
    }));
    montar({ onInvitar });

    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(await screen.findByText('Ya hay una cuenta con ese correo.')).toBeInTheDocument();
    // Y no aparece ningún enlace: enseñar uno cuando no se ha creado nada sería peor que el
    // error.
    expect(screen.queryByText(/Caduca en 24 horas/)).not.toBeInTheDocument();
  });
});

describe('la lista', () => {
  it('la fila de quien mira no ofrece nada', () => {
    montar();

    // Quitarse a uno mismo el acceso o el rol no tiene deshacer desde dentro, y la action ya lo
    // rechaza: enseñar los controles sería ofrecer algo que va a fallar.
    expect(screen.getByText('Eres tú')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Quitar el acceso a Ana' })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Qué puede hacer Ana')).not.toBeInTheDocument();
  });

  it('marca a quien todavía no ha entrado', () => {
    montar();

    // Le dice a quien administra a quién le falta por compartir su enlace.
    expect(screen.getByText('Todavía no ha entrado')).toBeInTheDocument();
  });

  it('cambiar qué puede hacer alguien manda su identificador y el rol nuevo', async () => {
    const { onCambiarRol } = montar();

    await userEvent.selectOptions(screen.getByLabelText('Qué puede hacer Bruno'), 'admin');

    expect(onCambiarRol).toHaveBeenCalledWith('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'admin');
  });

  it('los roles se llaman por lo que dejan hacer, no por su nombre técnico', () => {
    montar();

    expect(screen.getAllByText('Puede escribir y publicar').length).toBeGreaterThan(0);
    expect(screen.queryByText('editor')).not.toBeInTheDocument();
  });
});

describe('quitar acceso', () => {
  it('la confirmación dice qué pasa con lo que esa persona escribió', async () => {
    montar();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar el acceso a Bruno' }));

    expect(
      screen.getByRole('alertdialog', { name: /¿Quitarle el acceso a Bruno\?/ })
    ).toBeInTheDocument();
    expect(screen.getByText(/se cerrará la sesión que tenga abierta/)).toBeInTheDocument();
    expect(screen.getByText(/se queda como está/)).toBeInTheDocument();
  });

  it('cancelar no quita nada', async () => {
    const { onDesactivar } = montar();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar el acceso a Bruno' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onDesactivar).not.toHaveBeenCalled();
  });

  it('el foco entra en Cancelar', async () => {
    montar();

    await userEvent.click(screen.getByRole('button', { name: 'Quitar el acceso a Bruno' }));

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('si es el último administrador, se cuenta el motivo', async () => {
    const onDesactivar = vi.fn(async () => ({
      ok: false,
      message: 'No puedes quitarle el acceso: es la única persona que puede administrar.',
    }));
    montar({ onDesactivar });

    await userEvent.click(screen.getByRole('button', { name: 'Quitar el acceso a Bruno' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, quitar el acceso' }));

    expect(
      await screen.findByText(/es la única persona que puede administrar/)
    ).toBeInTheDocument();
  });
});
