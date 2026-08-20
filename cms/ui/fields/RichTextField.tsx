'use client';

import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';
import type { RichTextField as RichTextFieldDef } from '@/cms/core/config';
import { allowedLinkProtocols } from '@/cms/links';

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
  /**
   * Lo último que este editor emitió, para distinguir un cambio propio de uno de fuera.
   *
   * Se declara antes que el editor porque `onUpdate` lo escribe: dejarlo debajo funciona
   * —el callback corre después del render— pero obliga a leer el fichero al revés.
   */
  const ultimoEmitido = useRef<string | null>(null);

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
        // La lista de `cms/links.ts`, que desde ADR-500 es **la misma** que usa el servidor:
        // ya no hay copia que pueda divergir. Sin pasarla, Tiptap usa la suya —más larga— y el
        // saneador borraría el enlace al guardar sin decir nada.
        //
        // Tiptap los quiere sin los dos puntos; el módulo los guarda con ellos porque compara
        // contra `URL.protocol`. La diferencia es de formato, no de contenido.
        //
        // Esto **no** es la validación: es el aviso en vivo. Quien decide lo que se guarda es
        // `isSafeLink`, que además mira caracteres de control y rutas disfrazadas.
        protocols: allowedLinkProtocols.map((protocolo) => protocolo.replace(':', '')),
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
      ultimoEmitido.current = JSON.stringify(instancia.isEmpty ? null : documento);
      // Un documento sin nada se manda como ausencia, no como un `doc` vacío: son lo mismo
      // para el lector y distintos para el esquema, y `undefined` es lo que de verdad hay.
      onChange(instancia.isEmpty ? undefined : documento);
    },
  });

  /**
   * Sincroniza el contenido cuando el valor cambia **desde fuera**.
   *
   * `useEditor` recibe `content` una sola vez, al crearse. Sin esto, el editor se queda con lo
   * de antes cuando alguien recupera el borrador local (#103), restaura una revisión (#105) o
   * recarga tras un conflicto de versión — y como no dispara `onChange`, lo siguiente que se
   * guarde sería el texto viejo pisando el que se acaba de recuperar.
   *
   * La parte delicada es **no pisar mientras se escribe**. Un efecto que asignara el contenido
   * en cada render movería el cursor al principio con cada tecla. Por eso se compara contra lo
   * último que el editor emitió: si coincide, el cambio venía de aquí y no hay nada que hacer.
   */
  useEffect(() => {
    if (editor === null) return;

    const entrante = JSON.stringify(value ?? null);
    if (entrante === ultimoEmitido.current) return;
    if (entrante === JSON.stringify(editor.getJSON())) return;

    ultimoEmitido.current = entrante;
    // `emitUpdate: false` porque aplicar un valor de fuera no es una edición: avisar
    // provocaría un guardado de algo que acaba de leerse del servidor.
    //
    // **Y aquí hay algo que decir en vez de dar por hecho.** El tipo de Tiptap documenta que
    // el valor por defecto es `true`, así que la opción debería importar. Pero al ponerla a
    // `true` a propósito, el evento **tampoco** se emite: la mutación sobrevive y el test no
    // distingue. O sea que en esta versión el comportamiento correcto se obtiene igual sin la
    // opción, y esta línea es un cinturón contra el valor por defecto documentado, no algo que
    // esté verificado.
    //
    // Se queda porque el coste es cero y el riesgo que cubre es real: si una versión futura
    // empieza a emitir, recuperar un borrador dispararía un guardado inútil y gastaría un
    // `version`. PENDIENTE(#121): averiguar por qué no se emite y que un test lo detecte
    // antes que un editor.
    editor.commands.setContent((value ?? { type: 'doc', content: [] }) as Record<string, unknown>, {
      emitUpdate: false,
    });
  }, [editor, value]);

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
