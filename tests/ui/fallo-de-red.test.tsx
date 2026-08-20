import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountScreen } from '@/cms/ui/AccountScreen';
import { CollectionScreen } from '@/cms/ui/CollectionScreen';
import { FALLO_DE_RED } from '@/cms/ui/fallo-de-red';
import { PublishAllButton } from '@/cms/ui/PublishAllButton';
import { SettingsScreen } from '@/cms/ui/SettingsScreen';
import { UsersScreen } from '@/cms/ui/UsersScreen';

/**
 * Qué hace el panel cuando una llamada al servidor **lanza** en vez de responder.
 *
 * ## El fallo que estos tests fijan
 *
 * Las pantallas manejaban bien el "no se pudo": una action devuelve `{ ok: false }` con su
 * motivo y la pantalla lo cuenta. Lo que no manejaban es que la llamada **ni siquiera llegue** —
 * una Server Action rechaza si la red se cae, si el servidor devuelve un 500 o si el despliegue
 * cambia a mitad de la petición.
 *
 * Sin capturarlo, el `await` propagaba, el manejador moría ahí y la bandera de "ocupado" **nunca
 * volvía a bajar**: el botón se quedaba deshabilitado diciendo "Guardando…" para siempre, sin un
 * solo mensaje, y la única salida era recargar la página.
 *
 * Estaba en seis pantallas. Lo encontré releyendo el bucle de "Publicar todo" que había escrito
 * el día anterior, no ejecutándolo: en local la red no se cae nunca.
 *
 * ## Lo que se comprueba en cada una
 *
 * Las dos cosas que importan, y en este orden: que **lo diga** y que la pantalla **siga usable**.
 * Lo segundo es lo que se rompía; lo primero es lo que lo hace útil.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** Una action que se cae por la red. */
const seCae = () => vi.fn().mockRejectedValue(new Error('Failed to fetch'));

describe('publicar todo', () => {
  it('lo dice y el botón vuelve a estar disponible', async () => {
    render(<PublishAllButton action={seCae()} />);

    const boton = screen.getByRole('button', { name: 'Publicar todo' });
    await userEvent.click(boton);

    expect(await screen.findByText(FALLO_DE_RED)).toBeInTheDocument();
    // Lo que se rompía: sin el `finally`, el botón se quedaba en "Publicando…" para siempre.
    expect(boton).toBeEnabled();
    expect(boton).toHaveTextContent('Publicar todo');
  });

  it('conserva lo que sí llegó a publicarse antes de caerse', async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({ publicadas: ['a', 'b'], fallidas: [], restantes: 5 })
      .mockRejectedValue(new Error('Failed to fetch'));

    render(<PublishAllButton action={action} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publicar todo' }));

    // Lo publicado está **confirmado** —cada entrada va en su transacción—, así que decir que no
    // se publicó nada sería peor que el propio fallo de red.
    expect(await screen.findByText('Se han publicado 2 secciones.')).toBeInTheDocument();
    expect(screen.getByText(FALLO_DE_RED)).toBeInTheDocument();
  });
});

describe('personas', () => {
  const PERSONAS = [
    {
      id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      nombre: 'Bruno',
      correo: 'b@ejemplo.com',
      rol: 'editor' as const,
      activa: true,
      sinEstrenar: false,
    },
  ];

  it('invitar lo dice y el formulario sigue vivo', async () => {
    render(
      <UsersScreen
        personas={PERSONAS}
        miId="otra"
        onInvitar={seCae()}
        onCambiarRol={vi.fn()}
        onDesactivar={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText('Nombre'), 'Carmen');
    await userEvent.type(screen.getByLabelText('Correo'), 'c@ejemplo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(await screen.findByText(FALLO_DE_RED)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invitar' })).toBeEnabled();
  });

  it('quitar el acceso lo dice', async () => {
    render(
      <UsersScreen
        personas={PERSONAS}
        miId="otra"
        onInvitar={vi.fn()}
        onCambiarRol={vi.fn()}
        onDesactivar={seCae()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Quitar el acceso a Bruno' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, quitar el acceso' }));

    expect(await screen.findByText(FALLO_DE_RED)).toBeInTheDocument();
    // Y la persona sigue apareciendo como activa: quitarla de la lista sin haberlo conseguido
    // sería enseñar un estado que la base de datos no tiene.
    expect(screen.getByRole('button', { name: 'Quitar el acceso a Bruno' })).toBeInTheDocument();
  });
});

describe('colecciones', () => {
  const ELEMENTOS = [
    { key: 'testimonials.a', titulo: 'Ana', estado: 'publicado' as const, sortOrder: 0 },
    { key: 'testimonials.b', titulo: 'Bruno', estado: 'publicado' as const, sortOrder: 1 },
  ];

  it('reordenar lo dice y deja la lista como estaba', async () => {
    render(
      <CollectionScreen
        nombreColeccion="Testimonios"
        elementos={ELEMENTOS}
        onCrear={vi.fn()}
        onReordenar={seCae()}
        onEliminar={vi.fn()}
        puedeEliminar
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Bajar Ana' }));

    expect(await screen.findByText(FALLO_DE_RED)).toBeInTheDocument();
    // Igual que cuando el servidor rechaza el orden: dejar la pantalla con uno que la base de
    // datos no tiene es peor que no haber movido nada.
    expect(screen.getAllByRole('link').map((enlace) => enlace.textContent)).toEqual([
      'Ana',
      'Bruno',
    ]);
  });

  it('crear lo dice y el botón vuelve', async () => {
    render(
      <CollectionScreen
        nombreColeccion="Testimonios"
        elementos={ELEMENTOS}
        onCrear={seCae()}
        onReordenar={vi.fn()}
        onEliminar={vi.fn()}
        puedeEliminar
      />
    );

    const boton = screen.getByRole('button', { name: 'Añadir' });
    await userEvent.click(boton);

    expect(await screen.findByText(FALLO_DE_RED)).toBeInTheDocument();
    expect(boton).toBeEnabled();
  });
});

describe('ajustes', () => {
  it('lo dice y se puede volver a intentar', async () => {
    render(<SettingsScreen nombreDelSitio="Mi sitio" seo={{}} onGuardar={seCae()} />);

    const boton = screen.getAllByRole('button', { name: 'Guardar' })[0]!;
    await userEvent.click(boton);

    // Aquí importa especialmente: estos ajustes tienen efecto inmediato, así que quedarse sin
    // saber si se guardaron es peor que en cualquier otra pantalla.
    expect(await screen.findByText(FALLO_DE_RED)).toBeInTheDocument();
    expect(boton).toBeEnabled();
  });
});

describe('tu cuenta', () => {
  it('lo dice y el formulario sigue vivo', async () => {
    render(<AccountScreen correo="ana@ejemplo.com" onCambiar={seCae()} />);

    await userEvent.type(screen.getByLabelText('Tu contraseña actual'), 'la-de-siempre-larga');
    await userEvent.type(screen.getByLabelText('La nueva'), 'una-contrasena-larga');
    await userEvent.type(screen.getByLabelText('Repite la nueva'), 'una-contrasena-larga');

    const boton = screen.getByRole('button', { name: 'Cambiar la contraseña' });
    await userEvent.click(boton);

    expect(await screen.findByText(FALLO_DE_RED)).toBeInTheDocument();
    expect(boton).toBeEnabled();
  });
});
