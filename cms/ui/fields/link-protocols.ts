/**
 * Los protocolos de enlace aceptables, **copiados** para el cliente (ADR-411).
 *
 * ## Por qué hay una copia, que es lo que hay que justificar
 *
 * La autoridad sobre qué es un enlace aceptable vive en `cms/core/links.ts`, y ese módulo es
 * `server-only` por decisión de M1: exponerlo al cliente exigiría la exención `// isomorphic:`,
 * que el test del issue #46 solo concede a módulos que **no emiten ni una línea de
 * JavaScript**. `links.ts` emite bastante.
 *
 * Pero el editor de texto rico necesita saber qué destinos admite mientras el editor escribe.
 * Sin eso, Tiptap usa su propia lista —que incluye protocolos que nosotros no queremos— y el
 * saneador del servidor borra el enlace al guardar: el editor ve "Guardado ✓" y su enlace ha
 * desaparecido sin que nadie le diga nada.
 *
 * Así que se duplica **solo el dato**, nunca la lógica. La comprobación de verdad —caracteres
 * de control, `//host` disfrazado de ruta, protocolos raros— sigue estando únicamente en el
 * servidor, que es quien decide lo que se guarda.
 *
 * ## Y lo que hace que la copia sea aceptable
 *
 * Un test compara esta lista con la del servidor y **falla si divergen**. Duplicar sin ese
 * test sería dejar dos verdades sueltas esperando a separarse; con él, separarse rompe CI.
 */
export const PROTOCOLOS_DE_ENLACE = ['http', 'https', 'mailto', 'tel'] as const;
