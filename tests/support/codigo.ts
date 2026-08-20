import ts from 'typescript';

/**
 * Quitar los comentarios antes de buscar patrones en el código fuente.
 *
 * ## Por qué existe esto
 *
 * Los tests estructurales buscan patrones —un `postMessage` a `'*'`, una ruta que no debería
 * estar en el sitemap—, y el sitio donde esos patrones aparecen escritos con más frecuencia es
 * **el comentario que explica por qué no deben aparecer**. Un test que castiga a quien escribe
 * el motivo es un test que enseña a no escribirlo.
 *
 * ## Por qué NO se hace con una expresión regular
 *
 * Lo intenté, y falló de la peor manera posible. La CSP del middleware contiene la cadena
 * `https://*.public.blob.vercel-storage.com`, y ese `/*` abre un "comentario" que el regex cierra
 * en el siguiente `*&#47;` que encuentre — **tragándose 1677 caracteres de código real**, entre
 * ellos la línea que el test iba a comprobar.
 *
 * Y el modo de fallo malo no es el que vi. Aquí produjo un rojo, que se investiga. En el test de
 * `postMessage` habría producido un **verde**: un `postMessage(msg, '*')` escondido dentro de la
 * región tragada no se encuentra, y el test dice que todo está bien.
 *
 * Así que se usa el compilador de TypeScript, que sí sabe distinguir una cadena de un
 * comentario. Es más lento y da igual: estos tests leen un puñado de ficheros.
 *
 * ## Qué devuelve, exactamente
 *
 * El código transpilado sin comentarios, no el original recortado. Para buscar patrones sirve
 * igual —los identificadores y las cadenas sobreviven— y conviene saberlo si algún día alguien
 * quiere comprobar números de línea: **no coinciden con los del fichero**.
 */
export function sinComentarios(codigo: string): string {
  return ts.transpileModule(codigo, {
    compilerOptions: {
      removeComments: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      // El JSX se conserva tal cual en vez de convertirse en llamadas a `createElement`: si se
      // transformara, un atributo escrito en JSX dejaría de encontrarse por su nombre.
      jsx: ts.JsxEmit.Preserve,
      isolatedModules: true,
    },
  }).outputText;
}
