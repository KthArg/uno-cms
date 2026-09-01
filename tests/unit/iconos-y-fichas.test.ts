import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../support/module-boundary';
import { ficherosDelPanel } from '../support/panel';

/**
 * T-215-2, T-215-3, T-215-4 y T-215-12: **los iconos y las fichas que se declaran** (spec 11,
 * issue #224, ADR-801 y ADR-803).
 *
 * ## Qué protege cada bloque, en una línea
 *
 * - Que los iconos salgan de una librería y no de SVG pegados a mano.
 * - Que entre en el paquete **solo el icono que se usa**, que es un cambio de una línea de
 *   perder y no lo detecta ni `typecheck` ni `lint`.
 * - Que ninguno llegue a la landing pública, que tiene presupuesto de 60 KB.
 * - Que no quede declarada una ficha que no usa nadie, que es exactamente lo que le pasó a
 *   `--font-serif` durante dos entregas sin que nadie lo notara.
 */

const CSS = readFileSync(join(REPO_ROOT, 'app', 'globals.css'), 'utf8');
const ICONOS = readFileSync(join(REPO_ROOT, 'cms', 'ui', 'iconos.tsx'), 'utf8');
const PAQUETE = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

/** Lo que pinta el panel, con su contenido, leído una vez. */
const FUENTES = ficherosDelPanel().map((ruta) => ({
  ruta,
  texto: readFileSync(join(REPO_ROOT, ruta), 'utf8'),
}));

describe('T-215-2 — los iconos vienen de una librería, no pegados a mano', () => {
  it('la librería está declarada como dependencia', () => {
    expect(PAQUETE.dependencies['lucide-react']).toBeDefined();
  });

  it('ningún componente del panel dibuja un `<svg>` propio', () => {
    // No es purismo: un SVG escrito a mano en un componente no tiene tamaño ni grosor de trazo
    // coherentes con los demás, y —lo que importa— **no pasa por el envoltorio** que decide si
    // el icono se anuncia o se oculta. Cada uno es una excepción a T-215-6 esperando.
    const conSvg = FUENTES.filter(({ texto }) => /<svg[\s>]/.test(texto)).map(({ ruta }) => ruta);

    expect(
      conSvg,
      'dibujan un SVG a mano en vez de usar `Icono` de `cms/ui/iconos.tsx` (ADR-801)'
    ).toEqual([]);
  });

  it('y la lista de ficheros no está vacía, o esto no comprobaría nada', () => {
    // El modo de fallo de una guarda que recorre ficheros: que deje de encontrarlos y se quede
    // en verde para siempre sin mirar nada. Ya pasó en este repositorio con otra guarda.
    expect(FUENTES.length).toBeGreaterThan(15);
  });
});

describe('T-215-3 — solo entra el icono que se usa', () => {
  it('la librería se importa en un único fichero', () => {
    // Si cada componente importara el suyo, la guarda de abajo tendría que recorrerlos todos y
    // cambiar de librería sería tocar veintitrés ficheros. Está decidido en ADR-801.
    const importan = FUENTES.filter(
      ({ ruta, texto }) => ruta !== 'cms/ui/iconos.tsx' && texto.includes('lucide-react')
    ).map(({ ruta }) => ruta);

    expect(importan, 'los iconos se piden a `cms/ui/iconos.tsx`, no a la librería').toEqual([]);
  });

  it('la importación es con nombre, nunca el índice entero', () => {
    // `import * as Icons from 'lucide-react'` mete las más de seis mil piezas del índice. Es una
    // línea, no rompe nada, pasa `typecheck` y `lint`, y solo se notaría en el presupuesto de
    // JavaScript **después** de estar dentro — sin decir de qué es el bulto.
    // **Se miran las líneas de código, no los comentarios**, y eso lo enseñó este caso al
    // estrenarse: `iconos.tsx` explica en su cabecera por qué no se hace `import * as`, y la
    // guarda leyó su propia advertencia como si fuera la infracción. Una guarda que se dispara
    // con la documentación de la regla es la que se acaba borrando.
    const codigo = ICONOS.split('\n')
      .filter((linea) => !/^\s*(\/\/|\*|\/\*)/.test(linea))
      .join('\n');

    expect(/import\s+\*\s+as\s+\w+\s+from\s+'lucide-react'/.test(codigo)).toBe(false);
    expect(/import\s*\{[^}]+\}\s*from\s*'lucide-react'/s.test(codigo)).toBe(true);
  });

  it('todo icono declarado lo usa alguien', () => {
    // Un icono en el mapa entra en el paquete **aunque no lo pinte nadie**, porque el mapa se
    // evalúa entero. Así que un nombre que sobra no es desorden: es peso.
    //
    // Ya pasó dentro de este mismo cambio — `guardar` se quedó suelto al descubrir que el
    // indicador de autosave tiene el texto fijado por `SPEC.md` §8 y no admite icono.
    const declarados = [...ICONOS.matchAll(/^\s{2}([a-zA-Z]+):\s*[A-Z]\w*,$/gm)].map((e) => e[1]!);

    expect(declarados.length, 'no se están leyendo los iconos del mapa').toBeGreaterThan(15);

    const sinUsar = declarados.filter(
      (nombre) =>
        !FUENTES.some(
          ({ ruta, texto }) => ruta !== 'cms/ui/iconos.tsx' && texto.includes(`de="${nombre}"`)
        ) &&
        // Los que se eligen por variable —`de={activa ? 'a' : 'b'}`— se nombran entrecomillados.
        !FUENTES.some(
          ({ ruta, texto }) => ruta !== 'cms/ui/iconos.tsx' && texto.includes(`'${nombre}'`)
        )
    );

    expect(sinUsar, 'están declarados y no los pinta nadie: quítalos del mapa').toEqual([]);
  });
});

describe('T-215-4 — ningún icono llega a la landing pública', () => {
  it('ni la librería ni el módulo de iconos entran en `app/(site)` ni en `components/site`', () => {
    // La landing tiene presupuesto de 60 KB de JavaScript y listón de Lighthouse propios, y
    // **está fuera de esta fase por decisión de quien lo pidió** (spec 11 §8).
    //
    // Esto va además del presupuesto de JavaScript porque el presupuesto avisa tarde y mal: se
    // pone rojo cuando el bulto ya está dentro, y no dice de qué es.
    const deLaLanding = [
      'app/(site)/layout.tsx',
      'app/(site)/page.tsx',
      'components/site/Hero.tsx',
      'components/site/About.tsx',
      'components/site/Faqs.tsx',
      'components/site/Testimonials.tsx',
    ];

    const contaminados = deLaLanding.filter((ruta) => {
      let texto: string;
      try {
        texto = readFileSync(join(REPO_ROOT, ruta), 'utf8');
      } catch {
        // Un fichero que ya no existe no es un fallo de esta guarda; lo cazaría el suyo.
        return false;
      }

      return texto.includes('lucide-react') || texto.includes('cms/ui/iconos');
    });

    expect(contaminados, 'la landing no lleva iconos: spec 11 §8 y el presupuesto de §8').toEqual(
      []
    );
  });
});

describe('T-215-12 — ninguna ficha declarada se queda sin usar', () => {
  it('todas las del bloque claro las nombra alguien', () => {
    // **De dónde sale este caso.** `--font-serif` apuntaba a `var(--fuente-titulares)`, que no
    // definía ningún fichero del repositorio, y `font-serif` no aparecía en ningún componente.
    // O sea que el serif de la spec 10 §6 no existió nunca en ninguna pantalla — y no se notó
    // porque una ficha muerta se ve exactamente igual que la decisión de no usarla (ADR-803).
    //
    // Se acepta un uso en cualquiera de los tres sitios donde una ficha puede vivir: como clase
    // en un componente, dentro de una utilidad del propio CSS, o como entrada de la guarda de
    // contraste —que es el caso de `fondo-claro`, una ficha de medida y no de pintura—.
    const contraste = readFileSync(
      join(REPO_ROOT, 'tests', 'unit', 'fichas-de-color.test.ts'),
      'utf8'
    );

    const bloqueClaro = /@theme\s*\{/.exec(CSS);
    expect(bloqueClaro, 'no se encuentra el bloque @theme').not.toBeNull();

    const abre = CSS.indexOf('{', bloqueClaro!.index);
    const cuerpo = CSS.slice(abre + 1, CSS.indexOf('}', abre));
    const fichas = [...cuerpo.matchAll(/--color-([a-z-]+):/g)].map((e) => e[1]!);

    expect(fichas.length, 'no se están leyendo las fichas').toBeGreaterThan(20);

    const huerfanas = fichas.filter((ficha) => {
      // En el CSS solo cuenta como uso `var(--color-x)`: la línea que la **declara** no es un
      // uso, y sin esa distinción esta guarda estaría siempre verde.
      if (CSS.includes(`var(--color-${ficha})`)) return false;
      if (contraste.includes(`'${ficha}'`)) return false;

      // En los componentes, como sufijo de una utilidad de Tailwind: `bg-papel`, `text-tinta`.
      // El guion delante evita que `acento` case dentro de `sobre-acento`.
      //
      // El aviso de `detect-non-literal-regexp` existe para expresiones construidas con entrada
      // externa, que es de donde vienen la inyección y el ReDoS. Aquí `ficha` sale de
      // `app/globals.css` **de este mismo repositorio**, leído veinte líneas más arriba, y su
      // forma la acota el propio patrón que lo extrae: `--color-([a-z-]+)`, o sea minúsculas y
      // guiones. No hay nada que un atacante pueda poner ahí sin poder ya escribir en el CSS.
      //
      // La alternativa —escribir treinta y tantas expresiones a mano— se desincronizaría de las
      // fichas a la primera que se añadiera, que es justo lo que esta guarda existe para evitar.
      // eslint-disable-next-line security/detect-non-literal-regexp
      return !FUENTES.some(({ texto }) => new RegExp(`[a-z]-${ficha}\\b`).test(texto));
    });

    expect(
      huerfanas,
      'están declaradas y no las usa nadie. O se usan, o se quitan: una ficha huérfana ' +
        'promete un color que no está puesto (ADR-803)'
    ).toEqual([]);
  });
});
