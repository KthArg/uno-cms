import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelShell } from '@/cms/ui/PanelShell';
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
  it('T-A-3: un editor no ve la entrada de personas ni la de ajustes', () => {
    montarShell('editor');

    expect(screen.queryByRole('link', { name: 'Personas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ajustes' })).not.toBeInTheDocument();
    // Lo que sí le corresponde, sigue estando.
    expect(screen.getByRole('link', { name: 'Contenido' })).toBeInTheDocument();
  });

  it('T-A-3: un admin sí las ve', () => {
    montarShell('admin');

    expect(screen.getByRole('link', { name: 'Personas' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustes' })).toBeInTheDocument();
  });

  it('el menú no es el guard, y este test no pretende que lo sea', () => {
    // Esconder una opción del menú se parece mucho a proteger algo. Lo que cierra la puerta
    // es el guard de la ruta, que se prueba aparte (#70 y T-E-4). Aquí solo se comprueba que
    // no se le ofrezca al editor una puerta que se le va a cerrar en la cara.
    montarShell('editor');

    expect(screen.getAllByRole('link').map((enlace) => enlace.getAttribute('href'))).not.toContain(
      '/admin/users'
    );
  });

  it('la entrada activa se marca con aria-current, no solo con color', () => {
    // Quien navega con lector de pantalla no ve el fondo gris.
    montarShell('admin', '/admin/media');

    expect(screen.getByRole('link', { name: 'Imágenes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Contenido' })).not.toHaveAttribute('aria-current');
  });

  it('estar en una subruta marca su sección, pero /admin no se marca desde una subruta', () => {
    // `startsWith('/admin')` marcaría "Contenido" en todas las pantallas del panel.
    montarShell('admin', '/admin/users');

    expect(screen.getByRole('link', { name: 'Personas' })).toHaveAttribute('aria-current', 'page');
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
