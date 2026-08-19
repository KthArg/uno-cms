import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-A-4: **ninguna palabra de jerga técnica en la interfaz del panel** (SPEC §9).
 *
 * §9 lo pide sin rodeos: "cero palabras como slug, schema, cache". Es una frase que se cumple
 * el primer día y se incumple el tercero, porque la jerga se cuela de una en una y siempre con
 * una excusa razonable —"pero es que aquí `token` es lo más claro"—. Este test la detiene la
 * primera vez.
 *
 * ## Lo que hace que este test sirva: distinguir código de interfaz
 *
 * `const draft = …` es código. `Guardar draft` es interfaz. Un test que buscara la palabra a
 * secas marcaría las dos, se volvería insoportable y acabaría desactivado o lleno de
 * excepciones — que es como mueren estos tests.
 *
 * Así que solo se mira **texto que el editor puede leer**: literales de cadena que parecen
 * frases y texto suelto dentro del JSX. Nombres de variable, imports, rutas, clases de CSS y
 * comentarios quedan fuera a propósito.
 *
 * Es una heurística y puede tener falsos negativos —una palabra prohibida metida en una
 * plantilla rara se le escapa—. Prefiero eso a un test que nadie soporte: uno que se ejecuta y
 * pilla el 90 % vale más que uno perfecto que se desactiva.
 */

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

/** Dónde vive la interfaz del panel. */
const DIRECTORIOS = ['cms/ui', 'app/admin', 'app/setup'];

/**
 * Las palabras que el editor no debería leer nunca.
 *
 * Están en un solo sitio y se amplía aquí. Las tres primeras son literales de §9; el resto son
 * las que se cuelan solas al escribir un panel.
 */
const PROHIBIDAS = [
  'slug',
  'schema',
  'cache',
  'caché',
  'token',
  'payload',
  'commit',
  'deploy',
  'draft',
  'key',
  'endpoint',
  'query',
  'hash',
  'JSON',
  'API',
];

/**
 * Excepciones, con su motivo. Que haya que escribir el motivo es parte del diseño: una lista
 * de excepciones sin explicación crece hasta vaciar el test de sentido.
 */
const EXCEPCIONES: { texto: string; motivo: string }[] = [
  {
    texto: 'Guardar borrador',
    motivo: '"borrador" es la traducción de §9 y es exactamente lo que hay que decir.',
  },
];

/**
 * Los patrones, compilados una vez.
 *
 * `\b` a los lados para no marcar "clave" por contener "key" ni "encaje" por "caje".
 *
 * El aviso de `detect-non-literal-regexp` existe para cuando la expresion se construye con
 * entrada externa, que es de donde vienen la inyeccion y el ReDoS. Aqui la fuente es
 * `PROHIBIDAS`, una constante literal veinte lineas mas arriba en este mismo fichero, y la
 * alternativa seria escribir quince expresiones a mano y que se desincronizaran de la lista.
 */
const PATRONES: readonly (readonly [string, RegExp])[] = PROHIBIDAS.map((palabra) => [
  palabra,
  // eslint-disable-next-line security/detect-non-literal-regexp
  new RegExp(`\\b${palabra}\\b`, 'i'),
]);

interface Hallazgo {
  readonly fichero: string;
  readonly linea: number;
  readonly palabra: string;
  readonly texto: string;
}

function ficherosDeInterfaz(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...ficherosDeInterfaz(ruta));
    else if (['.tsx', '.ts'].includes(extname(entrada.name))) salida.push(ruta);
  }
  return salida;
}

/**
 * Quita todo lo que no es texto visible.
 *
 * El orden importa: los comentarios de bloque primero, porque pueden contener comillas que
 * romperían la detección de cadenas si se procesaran después.
 */
function soloTextoVisible(fuente: string): { linea: number; texto: string }[] {
  const sinComentariosDeBloque = fuente.replace(/\/\*[\s\S]*?\*\//g, (bloque) =>
    bloque.replace(/[^\n]/g, ' ')
  );

  const salida: { linea: number; texto: string }[] = [];

  sinComentariosDeBloque.split('\n').forEach((linea, indice) => {
    const numero = indice + 1;

    // Comentarios de línea fuera. Se busca `//` que no venga precedido de `:` (para no
    // destrozar una URL) ni de otra barra.
    const sinComentario = linea.replace(/(^|[^:/])\/\/.*$/, '$1');

    // Imports y rutas: no son texto para nadie.
    if (/^\s*import\s/.test(sinComentario)) return;

    // Texto suelto dentro de JSX: `>Guardar borrador<`.
    for (const match of sinComentario.matchAll(/>([^<>{}]{2,})</g)) {
      salida.push({ linea: numero, texto: match[1]! });
    }

    // Literales de cadena que parecen frases: llevan un espacio o empiezan por mayúscula.
    // `'text-sm'` y `'/admin/media'` no cuelan; `'Guardar borrador'` sí.
    for (const match of sinComentario.matchAll(/'([^']{2,})'|"([^"]{2,})"|`([^`$]{2,})`/g)) {
      const texto = match[1] ?? match[2] ?? match[3] ?? '';
      const pareceFrase = / /.test(texto) && !texto.includes('-') && !texto.startsWith('/');
      if (pareceFrase) salida.push({ linea: numero, texto });
    }
  });

  return salida;
}

function buscarJerga(): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];

  for (const directorio of DIRECTORIOS) {
    for (const fichero of ficherosDeInterfaz(join(RAIZ, directorio))) {
      const fuente = readFileSync(fichero, 'utf8');

      for (const { linea, texto } of soloTextoVisible(fuente)) {
        if (EXCEPCIONES.some((excepcion) => texto.includes(excepcion.texto))) continue;

        for (const [palabra, patron] of PATRONES) {
          if (patron.test(texto)) {
            hallazgos.push({
              fichero: relative(RAIZ, fichero).replace(/\\/g, '/'),
              linea,
              palabra,
              texto: texto.trim(),
            });
          }
        }
      }
    }
  }

  return hallazgos;
}

describe('T-A-4 — el panel no habla en jerga técnica', () => {
  it('ninguna palabra prohibida en el texto visible', () => {
    const hallazgos = buscarJerga();

    const detalle = hallazgos
      .map((h) => `${h.fichero}:${String(h.linea)} — «${h.palabra}» en "${h.texto}"`)
      .join('\n');

    expect(hallazgos, `jerga técnica en la interfaz del panel:\n${detalle}`).toEqual([]);
  });

  it('el detector distingue código de interfaz', () => {
    // Sin esta distinción el test marcaría `const draft = …` y acabaría desactivado, que es
    // como mueren estos tests. Se comprueba con las dos formas del mismo término.
    const fuente = [
      'const draft = leerBorrador();',
      "const clase = 'text-sm';",
      'return <p>Guardar el draft</p>;',
    ].join('\n');

    const visible = soloTextoVisible(fuente);

    expect(visible.map((v) => v.texto)).toContain('Guardar el draft');
    expect(visible.map((v) => v.texto)).not.toContain('text-sm');
  });

  it('el detector encuentra la jerga que se le pone delante', () => {
    // Verificación del propio test: sin esto, un fallo en la detección daría verde para
    // siempre y el contrato de §9 quedaría en un comentario.
    const visible = soloTextoVisible('return <p>Revisa el schema antes de publicar</p>;');

    expect(visible).toHaveLength(1);
    expect(/\bschema\b/i.test(visible[0]!.texto)).toBe(true);
  });
});
