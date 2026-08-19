import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { entradasVisibles, PanelShell } from '@/cms/ui/PanelShell';
import { SectionCard } from '@/cms/ui/SectionCard';

/** T-A-1 y T-A-3: armazón del panel y tarjetas de sección (SPEC §3, §9). */

function montarShell(rol: 'admin' | 'editor', rutaActual = '/admin') {
  render(
    <PanelShell rol={rol} nombreDeUsuario="Ana" rutaActual={rutaActual}>
      <p>contenido</p>
    </PanelShell>
  );
}

describe('armazón del panel', () => {
  it('T-A-3: el filtro por rol deja fuera lo que es solo de administración', () => {
    // Se prueba sobre `entradasVisibles` y no sobre el DOM porque esas pantallas todavía no
    // existen —llegan en #104 y #106— y el menú no pinta enlaces que darían 404. El filtro por
    // rol sí existe ya, y es lo que hay que fijar antes de que aparezcan.
    const deAdmin = entradasVisibles('admin').map((entrada) => entrada.href);
    const deEditor = entradasVisibles('editor').map((entrada) => entrada.href);

    expect(deAdmin).toContain('/admin/users');
    expect(deAdmin).toContain('/admin/settings');
    expect(deEditor).not.toContain('/admin/users');
    expect(deEditor).not.toContain('/admin/settings');
    expect(deEditor).toContain('/admin');
  });

  it('el menú no pinta enlaces a pantallas que todavía no existen', () => {
    // Un menú con enlaces rotos no es "en construcción": es una interfaz que miente sobre lo
    // que hay. Este test se vuelve trivial —y se quita— cuando M4 termine.
    montarShell('admin');

    const enlaces = screen.getAllByRole('link').map((enlace) => enlace.getAttribute('href'));
    // `/admin/media` ya existe desde #104, así que sale del menú. Quedan las de #106.
    expect(enlaces).not.toContain('/admin/users');
    expect(enlaces).not.toContain('/admin/settings');
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
