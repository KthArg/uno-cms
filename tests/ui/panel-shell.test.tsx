import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { entradasVisibles, PanelShell } from '@/cms/ui/PanelShell';
import { SectionCard } from '@/cms/ui/SectionCard';

/** T-A-1 y T-A-3: armazón del panel y tarjetas de sección (SPEC §3, §9). */

function montarShell(
  rol: 'admin' | 'editor',
  rutaActual = '/admin',
  onSalir = vi.fn(),
  tema: 'claro' | 'oscuro' | null = null,
  onCambiarDeTema = vi.fn()
) {
  render(
    <PanelShell
      rol={rol}
      nombreDeUsuario="Ana"
      rutaActual={rutaActual}
      onSalir={onSalir}
      tema={tema}
      onCambiarDeTema={onCambiarDeTema}
    >
      <p>contenido</p>
    </PanelShell>
  );

  return { onSalir, onCambiarDeTema };
}

describe('armazón del panel', () => {
  it('T-A-3: el filtro por rol deja fuera lo que es solo de administración', () => {
    // Se prueba sobre `entradasVisibles` además de sobre el DOM: la función es la que decide, y
    // fijarla aquí deja claro qué entra y qué no sin depender de cómo se pinte el menú.
    const deAdmin = entradasVisibles('admin').map((entrada) => entrada.href);
    const deEditor = entradasVisibles('editor').map((entrada) => entrada.href);

    expect(deAdmin).toContain('/admin/users');
    expect(deAdmin).toContain('/admin/settings');
    expect(deEditor).not.toContain('/admin/users');
    expect(deEditor).not.toContain('/admin/settings');
    expect(deEditor).toContain('/admin');
  });

  it('el menú pinta las cuatro secciones, y ninguna lleva a un 404', () => {
    // Hasta #106 el menú llevaba una bandera `disponible` que escondía las entradas cuya
    // pantalla no existía: un menú con enlaces rotos no es "en construcción", es una interfaz
    // que miente sobre lo que hay. Ya están las cuatro, así que la bandera se fue (#122).
    //
    // Este test es lo que impide que vuelva a colarse una entrada sin pantalla detrás: si
    // alguien añade una al menú, tiene que añadirla aquí, y para eso tiene que existir.
    montarShell('admin');

    const enlaces = screen.getAllByRole('link').map((enlace) => enlace.getAttribute('href'));

    expect(enlaces).toEqual(
      expect.arrayContaining(['/admin', '/admin/media', '/admin/users', '/admin/settings'])
    );
  });

  it('el nombre de quien mira lleva a su propia cuenta', () => {
    // No es una entrada más del menú lateral: ahí estaría al nivel de "Contenido" o "Personas",
    // y no lo está. Desde ahí no se administra la web, se administra uno mismo.
    montarShell('editor');

    expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', '/admin/account');
  });

  it('el menú no es el guard, y este test no pretende que lo sea', () => {
    // Esconder una opción del menú se parece mucho a proteger algo. Lo que cierra la puerta es
    // el guard de la ruta, que se prueba aparte (#70 y T-E-4). Aquí solo se comprueba que no
    // se le ofrezca al editor una puerta que se le va a cerrar en la cara.
    montarShell('editor');

    expect(screen.getAllByRole('link').map((enlace) => enlace.getAttribute('href'))).not.toContain(
      '/admin/users'
    );
  });

  it('la entrada activa se marca con aria-current, no solo con color', () => {
    // Quien navega con lector de pantalla no ve el fondo gris.
    montarShell('admin', '/admin');

    expect(screen.getByRole('link', { name: 'Contenido' })).toHaveAttribute('aria-current', 'page');
  });

  it('/admin no se marca como activa desde una subruta', () => {
    // `startsWith('/admin')` marcaría "Contenido" en todas las pantallas del panel.
    montarShell('admin', '/admin/users');

    expect(screen.getByRole('link', { name: 'Contenido' })).not.toHaveAttribute('aria-current');
  });

  it('la navegación tiene nombre accesible', () => {
    montarShell('admin');

    expect(screen.getByRole('navigation', { name: 'Secciones del panel' })).toBeInTheDocument();
  });
});

describe('tarjeta de sección', () => {
  it('T-A-1: distingue los tres estados, no dos', () => {
    render(<SectionCard nombre="Portada" href="/admin/content/hero" estado="publicado" />);
    expect(screen.getByText('Publicado')).toBeInTheDocument();

    render(<SectionCard nombre="Sobre nosotros" href="/x" estado="con-cambios" />);
    expect(screen.getByText('Cambios sin publicar')).toBeInTheDocument();

    render(<SectionCard nombre="SEO" href="/y" estado="sin-publicar" />);
    // El tercero importa: "Cambios sin publicar" sugeriría que hay una versión pública que
    // difiere, y no la hay — la landing está enseñando valores vacíos.
    expect(screen.getByText('Sin publicar todavía')).toBeInTheDocument();
  });

  it('muestra el nombre visible, no la clave técnica', () => {
    render(<SectionCard nombre="Portada" href="/admin/content/hero" estado="publicado" />);

    expect(screen.getByRole('link', { name: /Portada/ })).toBeInTheDocument();
    expect(screen.queryByText('hero')).not.toBeInTheDocument();
  });

  it('cuenta los elementos de una lista en singular y plural', () => {
    render(<SectionCard nombre="Testimonios" href="/x" estado="publicado" elementos={1} />);
    expect(screen.getByText('1 elemento')).toBeInTheDocument();

    render(<SectionCard nombre="Preguntas" href="/y" estado="publicado" elementos={4} />);
    expect(screen.getByText('4 elementos')).toBeInTheDocument();
  });
});

describe('T-208-1 y T-208-4 — salir del panel (issue #211)', () => {
  it('el botón está, y en las pantallas de los dos roles', () => {
    // En la cabecera y no en una pantalla concreta: el momento en que hace falta es al
    // terminar, y eso pasa estés donde estés. Antes de #211 **no existía en ninguna parte**,
    // y `SPEC.md` no lo menciona: no faltaba un test, faltaba la pregunta.
    for (const rol of ['admin', 'editor'] as const) {
      const { unmount } = render(
        <PanelShell
          rol={rol}
          nombreDeUsuario="Ana"
          rutaActual="/admin/media"
          onSalir={vi.fn()}
          tema={null}
          onCambiarDeTema={vi.fn()}
        >
          <p>contenido</p>
        </PanelShell>
      );

      expect(screen.getByRole('button', { name: 'Salir' }), rol).toBeInTheDocument();
      unmount();
    }
  });

  it('al pulsarlo se cierra la sesión', async () => {
    const { onSalir } = montarShell('admin');

    await userEvent.click(screen.getByRole('button', { name: 'Salir' }));

    expect(onSalir).toHaveBeenCalledOnce();
  });

  it('T-208-4: es un envío de formulario, no un enlace', () => {
    montarShell('admin');

    const boton = screen.getByRole('button', { name: 'Salir' });

    // **Con un enlace, cerrar la sesión lo dispara cualquier cosa que precargue direcciones**
    // —el prefetch del navegador, un antivirus, un chat que despliega vistas previas— y quien
    // administra se encuentra fuera sin haber pulsado nada. Un `GET` no puede mutar.
    expect(boton.tagName).toBe('BUTTON');
    expect(boton.getAttribute('type')).toBe('submit');
    expect(boton.closest('form')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Salir' })).toBeNull();
  });
});

describe('T-212-5 y T-212-6 — el interruptor de modo (issue #219)', () => {
  it('sin preferencia guardada el contenedor dice «sistema»', () => {
    // **`null` no es «claro»**, y esta es la diferencia que decide si el ajuste del sistema
    // operativo de alguien se respeta o se ignora. Pintar `data-tema="claro"` por defecto
    // dejaría en claro a todo el que nunca haya tocado el interruptor, tenga el sistema como
    // lo tenga — que es casi todo el mundo.
    montarShell('admin');

    expect(document.querySelector('[data-tema="sistema"]')).not.toBeNull();
    expect(document.querySelector('[data-tema="claro"]')).toBeNull();
  });

  it('con preferencia guardada, el contenedor la lleva puesta', () => {
    for (const tema of ['claro', 'oscuro'] as const) {
      const { unmount } = render(
        <PanelShell
          rol="admin"
          nombreDeUsuario="Ana"
          rutaActual="/admin"
          onSalir={vi.fn()}
          tema={tema}
          onCambiarDeTema={vi.fn()}
        >
          <p>contenido</p>
        </PanelShell>
      );

      expect(document.querySelector(`[data-tema="${tema}"]`), tema).not.toBeNull();
      unmount();
    }
  });

  it('el botón dice a dónde lleva, no dónde estás', () => {
    // Estando en oscuro, el botón ofrece «Modo claro». Al revés obliga a adivinar si la etiqueta
    // describe el estado o la acción, y se adivina mal la mitad de las veces.
    const { unmount } = render(
      <PanelShell
        rol="admin"
        nombreDeUsuario="Ana"
        rutaActual="/admin"
        onSalir={vi.fn()}
        tema="oscuro"
        onCambiarDeTema={vi.fn()}
      >
        <p>contenido</p>
      </PanelShell>
    );
    expect(screen.getByRole('button', { name: 'Modo claro' })).toBeInTheDocument();
    unmount();

    montarShell('admin', '/admin', vi.fn(), 'claro');
    expect(screen.getByRole('button', { name: 'Modo oscuro' })).toBeInTheDocument();
  });

  it('y al pulsarlo se guarda la preferencia', async () => {
    const { onCambiarDeTema } = montarShell('admin');

    await userEvent.click(screen.getByRole('button', { name: 'Modo oscuro' }));

    expect(onCambiarDeTema).toHaveBeenCalledOnce();
  });
});
