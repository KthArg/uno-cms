import { describe, expect, it } from 'vitest';
import { richTextDocSchema, sanitizeRichText } from '@/cms/core/richtext';

/**
 * El saneador de richtext (SPEC §5.3 "sanitiza richtext", §6.3 la allowlist).
 *
 * La propiedad que hay que demostrar no es "quita `javascript:`" —eso es un caso—, sino que
 * **la salida siempre pasa `richTextDocSchema`**, que es la puerta que usa la publicación. Si
 * el saneador dejara pasar algo que el esquema rechaza, el borrador se guardaría y luego sería
 * impublicable, y el editor vería un error sobre algo que él no escribió.
 */

const veneno = [
  {
    nombre: 'enlace javascript:',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'pincha',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    },
  },
  {
    nombre: 'clase y estilo',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { class: 'x', style: 'position:fixed;inset:0' },
          content: [{ type: 'text', text: 'hola' }],
        },
      ],
    },
  },
  {
    nombre: 'nodo desconocido',
    doc: {
      type: 'doc',
      content: [
        { type: 'script', content: [{ type: 'text', text: 'alert(1)' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'lo bueno' }] },
      ],
    },
  },
  {
    nombre: 'marca desconocida',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'texto', marks: [{ type: 'blink' }] }],
        },
      ],
    },
  },
  {
    nombre: 'target en un enlace por lo demás válido',
    doc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'ir',
              marks: [{ type: 'link', attrs: { href: 'https://ejemplo.com', target: '_blank' } }],
            },
          ],
        },
      ],
    },
  },
  {
    nombre: 'doc anidado',
    doc: {
      type: 'doc',
      content: [{ type: 'doc', content: [{ type: 'paragraph' }] }],
    },
  },
  {
    nombre: 'encabezado de nivel prohibido',
    doc: {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'H1' }] }],
    },
  },
];

describe('sanitizeRichText', () => {
  it.each(veneno)('la salida pasa el esquema estricto: $nombre', ({ doc }) => {
    const limpio = sanitizeRichText(doc);

    // Este es el aserto que importa. Los de abajo comprueban casos concretos; este comprueba
    // la propiedad, y es el que detecta lo que no se me haya ocurrido enumerar.
    expect(richTextDocSchema.safeParse(limpio).success).toBe(true);
  });

  it('quita el enlace y conserva el texto', () => {
    const limpio = sanitizeRichText(veneno[0]!.doc);

    const serializado = JSON.stringify(limpio);
    expect(serializado).toContain('pincha');
    expect(serializado).not.toContain('javascript');
  });

  it('quita class y style, y conserva el párrafo', () => {
    const limpio = sanitizeRichText(veneno[1]!.doc);

    const serializado = JSON.stringify(limpio);
    expect(serializado).toContain('hola');
    expect(serializado).not.toContain('position:fixed');
    expect(serializado).not.toContain('"class"');
  });

  it('descarta el nodo desconocido con sus hijos, no lo desenvuelve', () => {
    // Desenvolver dejaría el texto colgando de la raíz, que no es un documento válido.
    const limpio = sanitizeRichText(veneno[2]!.doc);

    const serializado = JSON.stringify(limpio);
    expect(serializado).not.toContain('alert(1)');
    expect(serializado).toContain('lo bueno');
  });

  it('quita la marca desconocida y deja el texto', () => {
    const limpio = sanitizeRichText(veneno[3]!.doc);

    expect(JSON.stringify(limpio)).toContain('texto');
    expect(JSON.stringify(limpio)).not.toContain('blink');
  });

  it('conserva un enlace seguro y le quita el target', () => {
    const limpio = sanitizeRichText(veneno[4]!.doc);

    const serializado = JSON.stringify(limpio);
    expect(serializado).toContain('https://ejemplo.com');
    // `target` es presentación, no contenido: lo pone el renderizador (SPEC §6.3).
    expect(serializado).not.toContain('_blank');
  });

  it('degrada un encabezado de nivel prohibido a párrafo, sin perder el texto', () => {
    const limpio = sanitizeRichText(veneno[6]!.doc);

    const serializado = JSON.stringify(limpio);
    expect(serializado).toContain('H1');
    expect(serializado).toContain('paragraph');
    expect(serializado).not.toContain('heading');
  });

  it('cualquier cosa que no sea un documento se convierte en uno vacío', () => {
    for (const basura of [null, undefined, 'texto', 42, [], { content: 'no es un array' }]) {
      const limpio = sanitizeRichText(basura);
      expect(limpio).toEqual({ type: 'doc', content: [] });
      expect(richTextDocSchema.safeParse(limpio).success).toBe(true);
    }
  });

  it('un documento ya limpio no cambia de contenido', () => {
    // Sanear no puede ser destructivo con lo válido: si lo fuera, el autosave iría comiéndose
    // el trabajo del editor guardado a guardado.
    const original = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'negrita', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' y ' },
            {
              type: 'text',
              text: 'enlace',
              marks: [{ type: 'link', attrs: { href: 'https://ejemplo.com' } }],
            },
          ],
        },
      ],
    };

    expect(sanitizeRichText(original)).toEqual(original);
  });

  it('sanear dos veces da lo mismo que sanear una', () => {
    // Idempotencia: el borrador pasa por aquí en cada guardado, así que un saneador que
    // "corrigiera" un poco más en cada pasada iría degradando el texto con el autosave.
    for (const { doc } of veneno) {
      const una = sanitizeRichText(doc);
      expect(sanitizeRichText(una)).toEqual(una);
    }
  });
});
