import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

/**
 * La frontera servidor → cliente (issue #125).
 *
 * ## El fallo que vigila
 *
 * Next tiene dos fronteras y solo una está protegida. `server-only` impide que el cliente
 * importe código de servidor, y hay tests que lo sostienen desde M0. **La de vuelta no la
 * vigila nada**, y ha fallado dos veces en M4:
 *
 * 1. PR #108: una flecha creada en un componente de servidor pasada a uno de cliente como si
 *    fuera una Server Action. Next no puede serializarla.
 * 2. PR #124: una función corriente exportada desde un módulo `'use client'` y llamada dentro
 *    de una Server Action.
 *
 * Las dos con la misma firma: **`typecheck`, `lint` y `build` los tres en verde**, y la página
 * reventando en tiempo de ejecución. La segunda además sobrevivió a la revisión de su PR
 * porque su rama solo se ejecuta cuando `publishAll` devuelve fallos.
 *
 * ## Las dos reglas, y por qué son estas
 *
 * **Regla 1 — de un módulo de cliente, el servidor solo puede importar componentes.** Cuando
 * un módulo lleva `'use client'`, lo que el servidor recibe al importarlo no es el valor: es
 * una *referencia* que Next resuelve en el navegador. Un componente funciona así —se renderiza
 * en el cliente, que es el propósito— pero una función corriente no se puede llamar, y una
 * constante no vale lo que dice.
 *
 * Se distinguen por el nombre, que es el criterio que React ya impone: los componentes van en
 * `PascalCase` porque JSX trata las minúsculas como etiquetas HTML. Así que se admite
 * `PascalCase`, se rechaza `camelCase` y también `GRITOS_EN_MAYÚSCULAS`, que parece un nombre
 * de componente y es una constante.
 *
 * **Regla 2 — un componente de servidor no pasa funciones escritas en el sitio.** Una flecha
 * creada al vuelo en el servidor no lleva la marca `'use server'`, así que no se puede
 * serializar hacia el cliente. La excepción es la Server Action escrita en línea, que sí lleva
 * la marca dentro.
 *
 * ## Lo que esto NO detecta, dicho para que nadie se confíe
 *
 * Es análisis de texto, no del grafo de módulos. Se le escapa una función de cliente que
 * llegue al servidor a través de un tercer módulo que la reexporte, y un nombre de componente
 * en minúscula —que además rompería JSX—. Cubre las dos formas que han fallado de verdad, y
 * las cubre en cuanto se escriben.
 */

const RAIZ = process.cwd();

/** Dónde se busca. `cms/core`, `cms/db` y demás entran: no importan interfaz, y no estorba. */
const DIRECTORIOS = ['app', 'cms', 'components'];

export interface HallazgoDeFrontera {
  readonly fichero: string;
  readonly linea: number;
  readonly regla: 'valor-de-cliente-en-servidor' | 'funcion-en-linea-en-servidor';
  readonly detalle: string;
}

/** Si un fichero declara ser de cliente. Se mira solo la cabecera, que es donde vale. */
export function esDeCliente(fuente: string): boolean {
  for (const linea of fuente.split('\n').slice(0, 10)) {
    const limpia = linea.trim();
    if (limpia === '') continue;
    if (limpia.startsWith('//') || limpia.startsWith('/*') || limpia.startsWith('*')) continue;
    return /^['"]use client['"]/.test(limpia);
  }
  return false;
}

/** Un nombre con forma de componente: `PascalCase`, y no una constante a gritos. */
export function pareceComponente(nombre: string): boolean {
  return /^[A-Z]/.test(nombre) && /[a-z]/.test(nombre) && !/^[A-Z0-9_]+$/.test(nombre);
}

interface Importacion {
  readonly linea: number;
  readonly especificador: string;
  readonly nombres: string[];
  readonly soloTipos: boolean;
}

/**
 * Lee las importaciones de un fichero.
 *
 * Sin analizador sintáctico a propósito: montar TypeScript entero para leer una cabecera de
 * imports es coste y dependencia por algo que se resuelve mirando el texto. El formato lo fija
 * Prettier en este repositorio, así que la forma es predecible.
 */
export function leerImportaciones(fuente: string): Importacion[] {
  const salida: Importacion[] = [];
  const lineas = fuente.split('\n');

  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i] ?? '';
    if (!/^\s*import\s/.test(linea)) continue;

    // Un import puede ocupar varias líneas cuando trae muchos nombres.
    let bloque = linea;
    let j = i;
    while (!bloque.includes('from') && j + 1 < lineas.length) {
      j += 1;
      bloque += `\n${lineas[j] ?? ''}`;
    }

    const desde = /from\s+['"]([^'"]+)['"]/.exec(bloque);
    if (desde === null) continue;

    const soloTipos = /^\s*import\s+type\s/.test(bloque);

    const llaves = /\{([\s\S]*?)\}/.exec(bloque);
    const nombres: string[] = [];

    if (llaves !== null) {
      for (const trozo of (llaves[1] ?? '').split(',')) {
        const limpio = trozo.trim();
        if (limpio === '') continue;
        // `type X` dentro de las llaves también se borra al compilar.
        if (limpio.startsWith('type ')) continue;
        // `X as Y`: manda el nombre local, que es el que se usa.
        nombres.push((limpio.split(/\s+as\s+/).pop() ?? limpio).trim());
      }
    } else {
      // Import por defecto o de espacio de nombres. Se normaliza el espaciado antes de mirar,
      // en vez de meter `\s*` por toda la expresión: esos cuantificadores encadenados son los
      // que hacen que una expresión pueda retroceder mucho, y el analizador de seguridad los
      // marca con razón.
      const normalizado = bloque.replace(/\s+/g, ' ').trim();
      const porDefecto = /^import (?:type )?([A-Za-z_$][\w$]*)/.exec(normalizado);
      if (porDefecto?.[1] !== undefined) nombres.push(porDefecto[1]);
    }

    salida.push({ linea: i + 1, especificador: desde[1] ?? '', nombres, soloTipos });
    i = j;
  }

  return salida;
}

/** Resuelve un especificador a un fichero del repositorio, o `null` si es de fuera. */
function resolver(especificador: string, desdeFichero: string): string | null {
  let base: string;

  if (especificador.startsWith('@/')) base = join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith('.')) base = resolve(dirname(desdeFichero), especificador);
  else return null;

  for (const candidato of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    if (existsSync(candidato) && extname(candidato) !== '') return candidato;
  }

  return null;
}

/**
 * Busca funciones escritas al vuelo como valor de una propiedad JSX.
 *
 * La Server Action en línea —`action={async () => { 'use server'; … }}`— sí es válida, así que
 * se mira si la marca aparece en las líneas siguientes antes de dar el aviso.
 */
export function funcionesEnLinea(fuente: string): { linea: number; detalle: string }[] {
  const lineas = fuente.split('\n');
  const salida: { linea: number; detalle: string }[] = [];

  for (let i = 0; i < lineas.length; i += 1) {
    const linea = lineas[i] ?? '';

    // `algo={() => …}` o `algo={async () => …}` o `algo={function …}`. Mismo criterio que
    // arriba: se normaliza el espaciado y la expresión queda sin cuantificadores encadenados.
    const normalizada = linea.replace(/\s+/g, ' ');
    const match = /(\w+)=\{ ?(?:async )?(?:\([^)]*\) ?=>|function)/.exec(normalizada);
    if (match === null) continue;

    const siguientes = lineas.slice(i, i + 6).join('\n');
    if (/['"]use server['"]/.test(siguientes)) continue;

    salida.push({ linea: i + 1, detalle: `propiedad «${match[1] ?? '?'}»` });
  }

  return salida;
}

function ficheros(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...ficheros(ruta));
    else if (['.ts', '.tsx'].includes(extname(entrada.name))) salida.push(ruta);
  }
  return salida;
}

export function analizarFrontera(): HallazgoDeFrontera[] {
  const rutas = DIRECTORIOS.flatMap((dir) => ficheros(join(RAIZ, dir)));
  const fuentes = new Map(rutas.map((ruta) => [ruta, readFileSync(ruta, 'utf8')]));

  const hallazgos: HallazgoDeFrontera[] = [];

  for (const [ruta, fuente] of fuentes) {
    // Un módulo de cliente puede usar libremente otros módulos de cliente.
    if (esDeCliente(fuente)) continue;

    const relativa = relative(RAIZ, ruta).replace(/\\/g, '/');

    // Regla 1.
    for (const importacion of leerImportaciones(fuente)) {
      if (importacion.soloTipos) continue;

      const destino = resolver(importacion.especificador, ruta);
      if (destino === null) continue;

      const fuenteDestino = fuentes.get(destino);
      if (fuenteDestino === undefined || !esDeCliente(fuenteDestino)) continue;

      for (const nombre of importacion.nombres) {
        if (pareceComponente(nombre)) continue;

        hallazgos.push({
          fichero: relativa,
          linea: importacion.linea,
          regla: 'valor-de-cliente-en-servidor',
          detalle:
            `importa «${nombre}» de ${relative(RAIZ, destino).replace(/\\/g, '/')}, que es ` +
            `un módulo de cliente. Lo que llega al servidor no es el valor sino una ` +
            `referencia, así que llamarlo revienta en tiempo de ejecución`,
        });
      }
    }

    // Regla 2, solo donde hay JSX.
    if (relativa.endsWith('.tsx')) {
      for (const { linea, detalle } of funcionesEnLinea(fuente)) {
        hallazgos.push({
          fichero: relativa,
          linea,
          regla: 'funcion-en-linea-en-servidor',
          detalle:
            `${detalle} con una función escrita en el sitio. Se crea en el servidor y no ` +
            `lleva la marca de Server Action, así que Next no puede serializarla hacia el ` +
            `cliente`,
        });
      }
    }
  }

  return hallazgos;
}
