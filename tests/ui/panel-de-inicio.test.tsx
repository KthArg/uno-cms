import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SectionSummary } from '@/cms/core/content';
import { PanelDeInicio } from '@/cms/ui/PanelDeInicio';
import { PanelShell } from '@/cms/ui/PanelShell';

/**
 * T-216-1 y T-216-2: **el bento y el rail** (spec 12, issue #229).
 *
 * ## Qué protege este fichero
 *
 * Reordenar una pantalla está a un paso de quitarle algo que la spec exigía, y eso no lo detecta
 * ningún tipo ni ningún linter: la pantalla nueva compila igual de bien con una sección de menos.
 * Aquí se fija lo que `SPEC.md` §9 pide de esta pantalla, para que el próximo rediseño tenga que
 * mantenerlo o cambiar la spec a propósito.
 *
 * Y se fija la condición que hace aceptable el rail de iconos mudos (ADR-810): sin nombre
 * accesible y sin `title`, el rail se queda mudo de verdad y la decisión pasa a ser otra.
 */

const SECCIONES: SectionSummary[] = [
  { key: 'hero', nombre: 'Portada', tipo: 'singleton', estado: 'con-cambios' },
  { key: 'about', nombre: 'Sobre nosotros', tipo: 'singleton', estado: 'publicado' },
  {
    key: 'faqs',
    nombre: 'Preguntas frecuentes',
    tipo: 'coleccion',
    estado: 'sin-publicar',
    elementos: 3,
  },
];

const SERIE = [
  { dia: '2026-08-30', publicaciones: 0 },
  { dia: '2026-08-31', publicaciones: 2 },
  { dia: '2026-09-01', publicaciones: 1 },
];

function montarInicio(extra: Partial<Parameters<typeof PanelDeInicio>[0]> = {}) {
  render(
    <PanelDeInicio
      secciones={SECCIONES}
      cifras={[
        { valor: 3, etiqueta: 'Secciones' },
        { valor: 2, etiqueta: 'Sin publicar' },
      ]}
      serieDePublicaciones={SERIE}
      totalDePublicaciones={3}
      ultimaImagen={null}
      tituloDeLaPortada="Mi web"
      imagenDeLaPortada=""
      pendientes={2}
      publicarTodo={<button type="button">Publicar todo</button>}
      {...extra}
    />
  );
}

describe('T-216-1 — el bento sigue ofreciendo lo que fija SPEC §9', () => {
  it('cada sección aparece, con su estado y su enlace', () => {
    // §9: «tarjeta por sección con estado». Que ahora sean filas y no tarjetas no cambia lo que
    // esa frase promete —que cada sección se ve y se ve en qué estado está—, y este caso es lo
    // que impide que el próximo rediseño se lleve una por delante sin enterarse.
    montarInicio();

    for (const seccion of SECCIONES) {
      // Una función como filtro y no `new RegExp(nombre)`: el nombre accesible de la fila lleva
      // además el estado y el número de elementos, así que no vale la igualdad — y construir una
      // expresión con una variable enciende `detect-non-literal-regexp` con razón, porque el día
      // que ese nombre venga de fuera sería inyección.
      const fila = screen.getByRole('link', {
        name: (accesible: string) => accesible.includes(seccion.nombre),
      });

      expect(fila, seccion.nombre).toBeInTheDocument();
    }

    expect(screen.getByText('Cambios sin publicar')).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getByText('Sin publicar todavía')).toBeInTheDocument();
  });

  it('«Publicar todo» sigue siendo la acción de la pantalla', () => {
    montarInicio();

    expect(screen.getByRole('button', { name: 'Publicar todo' })).toBeInTheDocument();
  });

  it('y una colección enlaza a su lista, no al editor de una entrada', () => {
    // Se comprueba porque el bento reescribió estos enlaces: una colección que apunte al editor
    // da 404, y es un fallo que solo se ve pulsando.
    montarInicio();

    expect(screen.getByRole('link', { name: /Preguntas frecuentes/ })).toHaveAttribute(
      'href',
      '/admin/collections/faqs'
    );
    expect(screen.getByRole('link', { name: /Portada/ })).toHaveAttribute(
      'href',
      '/admin/content/hero'
    );
  });

  it('el resumen de estado dice cuántas quedan, con el vocabulario de siempre', () => {
    montarInicio();

    expect(screen.getByText('Hay 2 secciones con cambios sin publicar.')).toBeInTheDocument();
  });

  it('sin nada pendiente, lo dice y no ofrece publicar', () => {
    montarInicio({ pendientes: 0, publicarTodo: null });

    expect(screen.getByText('Todo está publicado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar todo' })).toBeNull();
  });

  it('la gráfica se anuncia con lo que mide, no como un dibujo suelto', () => {
    // Sin nombre, un lector de pantalla encuentra una imagen sin descripción en mitad del panel.
    montarInicio();

    expect(
      screen.getByRole('img', { name: /3 publicaciones en los últimos 3 días/ })
    ).toBeInTheDocument();
  });
});

describe('T-216-2 — el rail de iconos conserva el nombre de cada sección', () => {
  it('cada entrada tiene nombre accesible y `title`', () => {
    // **Es la condición que hace aceptable el rail** (ADR-810). En escritorio el texto deja de
    // pintarse; si además se fuera del documento, el rail quedaría mudo para quien lo escucha y
    // adivinanza para quien lo mira. Sin este caso, la condición se cae en el primer refactor.
    render(
      <PanelShell
        rol="admin"
        nombreDeUsuario="Ana"
        rutaActual="/admin"
        onSalir={vi.fn()}
        tema={null}
        onCambiarDeTema={vi.fn()}
      >
        <p>contenido</p>
      </PanelShell>
    );

    const secciones = screen.getByRole('navigation', { name: 'Secciones del panel' });

    for (const nombre of ['Contenido', 'Imágenes', 'Personas', 'Ajustes']) {
      const enlace = within(secciones).getByRole('link', { name: nombre });

      expect(enlace, nombre).toHaveAttribute('title', nombre);
      // Y el texto sigue en el documento: en el móvil se pinta debajo del icono, y en escritorio
      // lo tapa `sr-only` — que esconde a la vista, no al lector de pantalla.
      expect(within(enlace).getByText(nombre)).toBeInTheDocument();
    }
  });
});
