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

/** Un documento "no vacío" es el que tiene al menos un nodo con texto (ADR-202). */
export function richTextHasContent(value: unknown): boolean {
  const parsed = richTextDocSchema.safeParse(value);
  if (!parsed.success) return false;

  const hasText = (nodes: NodeShape[]): boolean =>
    nodes.some(
      (node) =>
        (typeof node.text === 'string' && node.text.trim() !== '') ||
        (node.content !== undefined && hasText(node.content))
    );

  return hasText(parsed.data.content);
}

/** Documento vacío, que es lo que se guarda al sembrar un campo richtext sin default. */
export function emptyRichTextDoc(): { type: 'doc'; content: [] } {
  return { type: 'doc', content: [] };
}
