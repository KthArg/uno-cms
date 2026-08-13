import 'server-only';
import { z } from 'zod';
import { isSafeLink } from './links';

/**
 * Allowlist de richtext (SPEC §6.3): "p, strong, em, a[href http/https/mailto], ul, ol, li,
 * h2-h4, blockquote; estilos y clases stripped".
 *
 * La spec lo expresa en etiquetas HTML porque describe el resultado visible. Lo que se
 * guarda es JSON de ProseMirror (ADR-003), así que la allowlist se traduce a los nombres de
 * nodo y marca de Tiptap. La tabla de equivalencia está abajo para que la traducción sea
 * auditable y no haya que fiarse de mi lectura.
 *
 * Lo que **no** está en la lista se descarta. Y no se descarta "sanitizando" una cadena de
 * HTML: aquí no hay HTML. El documento se valida como estructura y luego se renderiza como
 * elementos de React (ADR-107, issue #19), así que no existe ningún punto en el que pueda
 * inyectarse markup.
 */

/** Nodo de ProseMirror → etiqueta de SPEC §6.3. */
const ALLOWED_NODES = {
  doc: '(raíz)',
  paragraph: 'p',
  text: '(texto)',
  hardBreak: 'br',
  heading: 'h2–h4',
  bulletList: 'ul',
  orderedList: 'ol',
  listItem: 'li',
  blockquote: 'blockquote',
} as const;

/** Marca de ProseMirror → etiqueta de SPEC §6.3. */
const ALLOWED_MARKS = {
  bold: 'strong',
  italic: 'em',
  link: 'a',
} as const;

/** SPEC §6.3 dice h2–h4: h1 pertenece a la página, no al contenido de un campo. */
const ALLOWED_HEADING_LEVELS = new Set([2, 3, 4]);

/**
 * Atributos admitidos por nodo y por marca. Todo lo demás se **rechaza**, no se ignora.
 *
 * SPEC §6.3 dice "estilos y clases stripped". Descartarlos al renderizar sería suficiente
 * mientras el renderizador sea el nuestro (ADR-107), pero eso deja el atributo guardado en
 * la base de datos, esperando a que alguien escriba un segundo camino de render —una
 * exportación, un feed, un correo— que sí lo lea. Lo que no se guarda no puede filtrarse
 * después.
 */
const ALLOWED_NODE_ATTRS: Record<string, readonly string[]> = {
  heading: ['level'],
  orderedList: ['start'],
};

const ALLOWED_MARK_ATTRS: Record<string, readonly string[]> = {
  link: ['href', 'target', 'rel'],
};

function checkAttrs(
  attrs: Record<string, unknown> | undefined,
  allowed: readonly string[],
  ctx: z.RefinementCtx,
  kind: 'nodo' | 'marca',
  typeName: string
): void {
  if (attrs === undefined) return;

  for (const name of Object.keys(attrs)) {
    if (!allowed.includes(name)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['attrs', name],
        message:
          `Atributo no permitido '${name}' en ${kind} '${typeName}'. ` +
          (allowed.length > 0 ? `Permitidos: ${allowed.join(', ')}.` : 'No admite atributos.'),
      });
    }
  }
}

export const allowedRichTextNodes: readonly string[] = Object.freeze(Object.keys(ALLOWED_NODES));
export const allowedRichTextMarks: readonly string[] = Object.freeze(Object.keys(ALLOWED_MARKS));

const markSchema = z
  .object({
    type: z.string(),
    attrs: z.record(z.unknown()).optional(),
  })
  .superRefine((mark, ctx) => {
    if (!(mark.type in ALLOWED_MARKS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Marca no permitida: '${mark.type}'. Permitidas: ${allowedRichTextMarks.join(', ')}.`,
      });
      return;
    }

    checkAttrs(mark.attrs, ALLOWED_MARK_ATTRS[mark.type] ?? [], ctx, 'marca', mark.type);

    if (mark.type === 'link') {
      const href = mark.attrs?.['href'];
      if (!isSafeLink(href)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['attrs', 'href'],
          message: 'El enlace usa un destino no permitido.',
        });
      }
    }
  });

type NodeShape = {
  type: string;
  text?: string;
  marks?: unknown[];
  attrs?: Record<string, unknown>;
  content?: NodeShape[];
};

const nodeSchema: z.ZodType<NodeShape> = z.lazy(() =>
  z
    .object({
      type: z.string(),
      text: z.string().optional(),
      marks: z.array(markSchema).optional(),
      attrs: z.record(z.unknown()).optional(),
      content: z.array(nodeSchema).optional(),
    })
    .superRefine((node, ctx) => {
      if (!(node.type in ALLOWED_NODES)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Nodo no permitido: '${node.type}'. Permitidos: ${allowedRichTextNodes.join(', ')}.`,
        });
        return;
      }

      checkAttrs(node.attrs, ALLOWED_NODE_ATTRS[node.type] ?? [], ctx, 'nodo', node.type);

      if (node.type === 'heading') {
        const level = node.attrs?.['level'];
        if (typeof level !== 'number' || !ALLOWED_HEADING_LEVELS.has(level)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['attrs', 'level'],
            message: 'Solo se permiten encabezados de nivel 2 a 4.',
          });
        }
      }
    })
);

export const richTextDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(nodeSchema),
});

/**
 * Un documento "no vacío" es el que tiene al menos un nodo con texto (ADR-202).
 *
 * Recorre la estructura sin volver a validarla contra `richTextDocSchema`. La primera
 * versión sí la revalidaba, y era un problema latente: esta función se llama desde un
 * `.refine()`, o sea **después** de que Zod ya haya validado el documento, de modo que
 * había dos validaciones del mismo dato que podían discrepar si una de las dos cambiaba.
 * Aquí solo se pregunta "¿hay texto?", y cualquier cosa que no se reconozca cuenta como
 * ausencia de texto.
 */
export function richTextHasContent(value: unknown): boolean {
  const hasText = (nodes: unknown): boolean => {
    if (!Array.isArray(nodes)) return false;

    return nodes.some((node: unknown) => {
      if (typeof node !== 'object' || node === null) return false;
      const { text, content } = node as { text?: unknown; content?: unknown };

      if (typeof text === 'string' && text.trim() !== '') return true;
      return hasText(content);
    });
  };

  if (typeof value !== 'object' || value === null) return false;
  return hasText((value as { content?: unknown }).content);
}

/** Documento vacío, que es lo que se guarda al sembrar un campo richtext sin default. */
export function emptyRichTextDoc(): { type: 'doc'; content: [] } {
  return { type: 'doc', content: [] };
}
