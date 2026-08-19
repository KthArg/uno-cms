import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { s } from '@/cms/core/config';
import { EntryForm, type ValoresDeEntrada } from '@/cms/ui/EntryForm';

/**
 * T-B-1 a T-B-5: el formulario se genera desde el esquema (SPEC §5.1, §3).
 *
 * **El esquema es inventado, no `cms.config.ts`**, y esa es la decisión que hace que estos
 * tests signifiquen algo. Con el real, un formulario escrito a mano —tres campos de texto
 * puestos uno a uno— pasaría exactamente igual. Con uno que el panel no ha visto nunca, solo
 * pasa si de verdad recorre el esquema.
 *
 * Es el contrato de §5.1: adaptar el CMS a otro proyecto es escribir `cms.config.ts`. Eso solo
 * es cierto si añadir un campo ahí lo hace aparecer aquí sin tocar el panel.
 */

const ESQUEMA_INVENTADO = s.object({
  titulo: s.text({ label: 'Título de la promoción', required: true, max: 60 }),
  descripcion: s.text({ label: 'Descripción larga', multiline: true }),
  cuerpo: s.richtext({ label: 'Texto de la oferta' }),
  descuento: s.number({ label: 'Descuento en euros', min: 0, max: 500, integer: true }),
  visible: s.boolean({ label: 'Mostrar la promoción' }),
  tamano: s.select({
    label: 'Tamaño del cartel',
    options: [
      { value: 'pequeno', label: 'Pequeño' },
      { value: 'grande', label: 'Grande' },
    ],
  }),
  destino: s.link({ label: 'A dónde lleva' }),
  cartel: s.image({ label: 'Cartel' }),
  fondo: s.color({ label: 'Color de fondo' }),
});

function montar(overrides: Partial<Parameters<typeof EntryForm>[0]> = {}) {
  const onChange = vi.fn<(valores: ValoresDeEntrada) => void>();

  render(<EntryForm schema={ESQUEMA_INVENTADO} values={{}} onChange={onChange} {...overrides} />);

  return { onChange };
}

describe('formulario generado desde el esquema', () => {
  it('T-B-1 y T-B-3: aparecen los campos del esquema, sin que nadie los escriba en el panel', () => {
    montar();

    // Los ocho tipos, cada uno con la etiqueta que puso quien escribió la configuración.
    expect(screen.getByLabelText(/Título de la promoción/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Descripción larga/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Descuento en euros/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mostrar la promoción/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tamaño del cartel/)).toBeInTheDocument();
    expect(screen.getByLabelText(/A dónde lleva/)).toBeInTheDocument();
    expect(screen.getByText('Cartel')).toBeInTheDocument();
    expect(screen.getByLabelText(/Color de fondo en formato hexadecimal/)).toBeInTheDocument();
    // El de texto rico se carga aparte (SPEC §8) y en el test solo llega su hueco.
    expect(screen.getByText('Texto de la oferta')).toBeInTheDocument();
  });

  it('T-B-2: se muestra la etiqueta, nunca la clave técnica', () => {
    montar();

    expect(screen.queryByText('titulo')).not.toBeInTheDocument();
    expect(screen.queryByText('descripcion')).not.toBeInTheDocument();
    expect(screen.queryByText('cartel')).not.toBeInTheDocument();
  });

  it('T-B-5: cada control tiene su etiqueta asociada', () => {
    montar();

    // `getByLabelText` ya falla si no lo está, pero el aserto explícito dice **por qué** está
    // el test: sin la asociación, un lector de pantalla anuncia "cuadro de texto" sin más.
    const titulo = screen.getByLabelText(/Título de la promoción/);
    expect(titulo.id).not.toBe('');
    expect(document.querySelector(`label[for="${titulo.id}"]`)).not.toBeNull();
  });

  it('T-B-4: el error de la action se pinta en su campo y se enlaza con aria', () => {
    montar({
      errors: [{ path: 'titulo', message: 'Falta Título de la promoción en Promociones.' }],
    });

    const titulo = screen.getByLabelText(/Título de la promoción/);
    expect(titulo).toHaveAttribute('aria-invalid', 'true');
    expect(titulo.getAttribute('aria-describedby')).toContain('error');
    expect(screen.getByText('Falta Título de la promoción en Promociones.')).toBeInTheDocument();

    // Y no se pinta en el campo de al lado.
    expect(screen.getByLabelText(/Descripción larga/)).not.toHaveAttribute('aria-invalid');
  });

  it('escribir en un campo avisa con el objeto entero', async () => {
    const { onChange } = montar();

    await userEvent.type(screen.getByLabelText(/Título de la promoción/), 'Rebajas');

    // Con cada tecla; lo que importa es que el último aviso trae el valor completo.
    expect(onChange).toHaveBeenCalled();
    const ultimo = onChange.mock.calls.at(-1)?.[0];
    expect(ultimo).toMatchObject({ titulo: 's' });
  });

  it('vaciar un campo lo quita del objeto, no lo deja como cadena vacía', async () => {
    const onChange = vi.fn<(valores: ValoresDeEntrada) => void>();
    render(<EntryForm schema={ESQUEMA_INVENTADO} values={{ titulo: 'X' }} onChange={onChange} />);

    await userEvent.clear(screen.getByLabelText(/Título de la promoción/));

    // Con `''`, el esquema laxo lo ve como "presente y vacío" y el estricto lo rechaza al
    // publicar con un mensaje sobre un campo que el editor juraría no haber tocado.
    const ultimo = onChange.mock.calls.at(-1)?.[0];
    expect(ultimo).not.toHaveProperty('titulo');
  });

  it('un número vacío no se convierte en cero', async () => {
    const onChange = vi.fn<(valores: ValoresDeEntrada) => void>();
    render(<EntryForm schema={ESQUEMA_INVENTADO} values={{ descuento: 20 }} onChange={onChange} />);

    await userEvent.clear(screen.getByLabelText(/Descuento en euros/));

    // Poner cero cambiaría el dato del editor por uno inventado, y en un precio eso importa.
    const ultimo = onChange.mock.calls.at(-1)?.[0];
    expect(ultimo).not.toHaveProperty('descuento');
  });

  it('un select opcional ofrece la opción de no elegir; uno obligatorio no', () => {
    render(
      <EntryForm
        schema={s.object({
          libre: s.select({
            label: 'Libre',
            options: [{ value: 'a', label: 'A' }],
          }),
          forzoso: s.select({
            label: 'Forzoso',
            required: true,
            options: [{ value: 'a', label: 'A' }],
          }),
        })}
        values={{}}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Libre/)).toHaveTextContent('Sin elegir');
    // Ofrecerla en uno obligatorio sería dar a elegir algo que luego se rechaza al publicar.
    expect(screen.getByLabelText(/Forzoso/)).not.toHaveTextContent('Sin elegir');
  });

  it('el botón de elegir imagen no aparece si no hay biblioteca', () => {
    montar();

    // Llega en #104. Un botón que no hace nada es la versión pequeña del menú con enlaces
    // rotos.
    expect(screen.queryByRole('button', { name: /Elegir imagen/ })).not.toBeInTheDocument();
  });

  it('el botón de elegir imagen aparece cuando sí la hay', () => {
    const onElegirImagen = vi.fn<(campo: string) => void>();
    render(
      <EntryForm
        schema={ESQUEMA_INVENTADO}
        values={{}}
        onChange={vi.fn()}
        onElegirImagen={onElegirImagen}
      />
    );

    expect(screen.getByRole('button', { name: 'Elegir imagen' })).toBeInTheDocument();
  });

  it('una imagen sin descripción avisa en el sitio', () => {
    render(
      <EntryForm
        schema={ESQUEMA_INVENTADO}
        values={{ cartel: { mediaId: 'm1', url: '/x.png', alt: '' } }}
        onChange={vi.fn()}
      />
    );

    // §8: "el editor exige alt". Quien sube la imagen tiene el contexto para describirla en
    // ese momento y no lo tendrá dos semanas después.
    expect(screen.getByText('Describe la imagen antes de publicar.')).toBeInTheDocument();
  });

  it('una imagen decorativa no pide descripción', () => {
    render(
      <EntryForm
        schema={s.object({ adorno: s.image({ label: 'Adorno', decorative: true }) })}
        values={{ adorno: { mediaId: 'm1', url: '/x.png', alt: '' } }}
        onChange={vi.fn()}
      />
    );

    // Obligar a describir un adorno lleva a `alt="imagen"`, que es peor que nada porque un
    // lector de pantalla lo lee en voz alta.
    expect(screen.queryByText('Describe la imagen antes de publicar.')).not.toBeInTheDocument();
  });
});
