'use client';

import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { RichTextField as RichTextFieldDef } from '@/cms/core/config';
import { PROTOCOLOS_DE_ENLACE } from './link-protocols';

/**
 * El campo de texto rico (SPEC §6.3).
 *
 * ## Las extensiones son exactamente la allowlist, ni una más
 *
 * `SPEC.md` §6.3 fija lo que se puede guardar: `p, strong, em, a[href], ul, ol, li, h2-h4,
 * blockquote`. `StarterKit` trae bastante más —código, tachado, línea horizontal, títulos de
 * cualquier nivel— y dejarlo por defecto tendría una consecuencia concreta y fea: **el editor
 * ofrecería formato que el saneador del servidor recorta al guardar**.
 *
 * El editor escribe algo en negrita tachada, pulsa guardar, ve "Guardado ✓" y el tachado ha
 * desaparecido. Nadie le ha dicho nada. Eso no es un fallo de seguridad —el saneador hace
 * bien su trabajo— es un fallo de producto: la herramienta ofrece algo que no cumple.
 *
 * Así que se apaga aquí lo que el servidor va a quitar allí. Si algún día se amplía la
 * allowlist, hay que ampliarla en los dos sitios, y por eso están nombrados el uno en el otro.
 *
 * ## Este componente NO pinta su etiqueta
 *
 * La pinta `EntryForm`, fuera del límite perezoso. Si la etiqueta viviera aquí dentro, el
 * campo estaría **sin etiqueta durante toda la carga de Tiptap**: quien navegue con lector de
 * pantalla en ese momento se encuentra un cuadro sin nombre, y quien mire la pantalla ve un
 * rectángulo gris sin saber de qué campo es. Lo encontró un test que buscaba la etiqueta y no
 * la encontraba.
 */

/** Lo que `StarterKit` trae y §6.3 no permite. */
const EXTENSIONES_APAGADAS = {
  code: false as const,
  codeBlock: false as const,
  strike: false as const,
  horizontalRule: false as const,
  // El enlace se configura aparte, con su validación de destino.
  link: false as const,
} as const;

export interface RichTextFieldProps {
  readonly id: string;
  readonly field: RichTextFieldDef;
  readonly value: unknown;
  readonly onChange: (valor: unknown) => void;
  readonly error?: string | undefined;
}

export function CampoTextoRico({ id, field, value, onChange, error }: RichTextFieldProps) {
  const editor = useEditor({
    // `false` en el servidor: Tiptap lo pide explícitamente para no renderizar en SSR y
    // provocar una discrepancia de hidratación.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        ...EXTENSIONES_APAGADAS,
        // Solo h2–h4. El h1 pertenece a la página, no al contenido de un campo (§6.3).
        heading: { levels: [2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        // La lista de `cms/ui/fields/link-protocols.ts`, que un test amarra a la del servidor
        // (ADR-411). Sin pasarla, Tiptap usa la suya —más larga— y el saneador borraría el
        // enlace al guardar sin decir nada.
        //
        // Esto **no** es la validación: es el aviso en vivo. Quien decide lo que se guarda es
        // `isSafeLink` en el servidor, que además mira caracteres de control y rutas
        // disfrazadas.
        protocols: [...PROTOCOLOS_DE_ENLACE],
      }),
    ],
    content: (value ?? { type: 'doc', content: [] }) as Record<string, unknown>,
    editorProps: {
      attributes: {
        id,
        class: `prose prose-sm max-w-none min-h-32 rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900 ${
          error === undefined ? 'border-slate-300' : 'border-red-500'
        }`,
        ...(field.help === undefined ? {} : { 'aria-describedby': `${id}-ayuda` }),
      },
    },
    onUpdate: ({ editor: instancia }) => {
      const documento = instancia.getJSON();
      // Un documento sin nada se manda como ausencia, no como un `doc` vacío: son lo mismo
      // para el lector y distintos para el esquema, y `undefined` es lo que de verdad hay.
      onChange(instancia.isEmpty ? undefined : documento);
    },
  });

  return (
    <>
      <BarraDeFormato editor={editor} />
      <EditorContent editor={editor} />
    </>
  );
}

type Editor = NonNullable<ReturnType<typeof useEditor>>;

const BOTONES: { nombre: string; activo: string; aplicar: (editor: Editor) => void }[] = [
  { nombre: 'Negrita', activo: 'bold', aplicar: (e) => e.chain().focus().toggleBold().run() },
  { nombre: 'Cursiva', activo: 'italic', aplicar: (e) => e.chain().focus().toggleItalic().run() },
  {
    nombre: 'Título',
    activo: 'heading',
    aplicar: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    nombre: 'Lista',
    activo: 'bulletList',
    aplicar: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    nombre: 'Cita',
    activo: 'blockquote',
    aplicar: (e) => e.chain().focus().toggleBlockquote().run(),
  },
];

function BarraDeFormato({ editor }: { editor: Editor | null }) {
  if (editor === null) return null;

  return (
    // `role="toolbar"` para que un lector de pantalla anuncie el grupo, y no cinco botones
    // sueltos flotando encima de un cuadro de texto.
    <div role="toolbar" aria-label="Formato del texto" className="flex flex-wrap gap-1">
      {BOTONES.map((boton) => (
        <button
          key={boton.nombre}
          type="button"
          // `aria-pressed` porque son interruptores, no acciones: el estado importa tanto
          // como el nombre.
          aria-pressed={editor.isActive(boton.activo)}
          onClick={() => {
            boton.aplicar(editor);
          }}
          className={`rounded px-2 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
            editor.isActive(boton.activo)
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {boton.nombre}
        </button>
      ))}
    </div>
  );
}
