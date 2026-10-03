import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObjectSchema } from '@/cms/core/config';
import { EntryEditor, type EntryEditorProps } from '@/cms/ui/EntryEditor';
import { PanelShell, type PanelShellProps } from '@/cms/ui/PanelShell';

/**
 * Spec 17 §5.9: el panel dice en qué idioma se trabaja (T-ID-39 a T-ID-42).
 */

const SCHEMA: ObjectSchema = {
  kind: 'object',
  label: 'Portada',
  fields: { title: { kind: 'text', label: 'Título principal', required: true } },
} as unknown as ObjectSchema;

const IDIOMAS = [
  { codigo: 'es', nombre: 'Español' },
  { codigo: 'en', nombre: 'English' },
];

function pintarShell(idiomas?: PanelShellProps['idiomas']) {
  render(
    <PanelShell
      rol="editor"
      nombreDeUsuario="Ana"
      rutaActual="/admin"
      onSalir={vi.fn()}
      tema={null}
      onCambiarDeTema={vi.fn()}
      {...(idiomas === undefined ? {} : { idiomas })}
    >
      <p>contenido</p>
    </PanelShell>
  );
}

function pintarEditor(extra: Partial<EntryEditorProps> = {}) {
  render(
    <EntryEditor
      nombreSeccion="Portada"
      schema={SCHEMA}
      valoresIniciales={{ title: 'Hello' }}
      versionInicial={1}
      guardar={async () => ({ ok: true, version: 2 })}
      publicar={async () => ({ ok: true })}
      deshacer={async () => ({ ok: true })}
      entryKey="hero"
      sePuedeDeshacer={false}
      {...extra}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('T-ID-39 — con un solo idioma, nada nuevo', () => {
  it('ni selector en la cabecera ni etiqueta en el editor', () => {
    pintarShell();
    pintarEditor();

    expect(screen.queryByRole('group', { name: 'Idioma del contenido' })).toBeNull();
    expect(screen.queryByText(/^En /)).toBeNull();
    expect(screen.queryByRole('button', { name: /rellenar/i })).toBeNull();
  });
});

describe('T-ID-40 — el selector', () => {
  it('enseña los dos idiomas por su nombre y marca el actual', () => {
    pintarShell({ lista: IDIOMAS, actual: 'en', onCambiar: vi.fn() });

    const grupo = screen.getByRole('group', { name: 'Idioma del contenido' });
    expect(within(grupo).getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(grupo).getByRole('button', { name: 'Español' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('cada botón manda su código y la ruta en la que se está', () => {
    pintarShell({ lista: IDIOMAS, actual: 'es', onCambiar: vi.fn() });

    const ingles = screen.getByRole('button', { name: 'English' });
    expect(ingles).toHaveAttribute('name', 'idioma');
    expect(ingles).toHaveAttribute('value', 'en');

    // La ruta viaja para que el servidor decida si hay que salir de un elemento de lista, que no
    // existe en el otro idioma.
    const formulario = ingles.closest('form');
    expect(formulario?.querySelector('input[name="ruta"]')).toHaveAttribute('value', '/admin');
  });
});

describe('T-ID-41 — la etiqueta del editor', () => {
  it('dice en qué idioma se está editando', () => {
    pintarEditor({ idioma: { codigo: 'en', nombre: 'English' } });

    expect(screen.getByText('En English')).toBeInTheDocument();
  });

  it('y separa la copia local del borrador por idioma', async () => {
    // Sin el idioma en la clave, el editor inglés ofrecería «recuperar» lo escrito en el español.
    const usuario = userEvent.setup();
    pintarEditor({ idioma: { codigo: 'en', nombre: 'English' }, esperaMs: 60_000 });

    await usuario.type(screen.getByLabelText(/Título principal/), '!');

    const claves = Object.keys(window.localStorage);
    expect(claves.some((clave) => clave.endsWith('Portada@en'))).toBe(true);
    expect(claves.some((clave) => clave.endsWith('Portada'))).toBe(false);
  });
});

describe('T-ID-42 — «Rellenar desde Español»', () => {
  it('aparece solo si la página lo ofrece, y pide confirmación antes de copiar', async () => {
    const usuario = userEvent.setup();
    const accion = vi.fn(async () => ({ ok: false as const, message: 'parado en el test' }));
    pintarEditor({
      idioma: { codigo: 'en', nombre: 'English' },
      rellenar: { desde: 'Español', accion },
      esperaMs: 60_000,
    });

    // Algo escrito y sin guardar todavía: el autoguardado espera un minuto.
    await usuario.type(screen.getByLabelText(/Título principal/), '!');
    await usuario.click(screen.getByRole('button', { name: 'Rellenar desde Español' }));

    // Sustituye todo lo escrito: sin confirmar, no se llama.
    expect(accion).not.toHaveBeenCalled();
    expect(screen.getByText('¿Rellenar con lo escrito en Español?')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Sí, rellenar' }));

    // Con la versión **después** de guardar lo pendiente —la 2 que devuelve `guardar`—, y no con
    // la 1 que tenía el editor: con esa, la action respondería un conflicto contra uno mismo.
    expect(accion).toHaveBeenCalledWith(2);
    expect(await screen.findByText('parado en el test')).toBeInTheDocument();
  });

  it('sin `rellenar`, no hay botón aunque el editor esté en otro idioma', () => {
    pintarEditor({ idioma: { codigo: 'en', nombre: 'English' } });

    expect(screen.queryByRole('button', { name: /rellenar/i })).toBeNull();
  });
});
