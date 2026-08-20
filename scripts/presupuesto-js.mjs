import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El presupuesto de JavaScript de la landing (SPEC §8, issues #117 y #154, ADR-601).
 *
 * ## Por qué son dos números y no el de la spec
 *
 * §8 dice "JS de cliente en la landing ≤ 60 KB gz". **Ninguna página de este stack baja de 100 KB**,
 * ni siquiera una sin un solo componente de cliente nuestro: el armazón de Next 15 y React 19 —que
 * §2 fija— son 101,6 KB comprimidos. Nuestro código entero son 5,6.
 *
 * Está en el issue #154 con las medidas, y resuelto en ADR-601: se mide **lo que sí controlamos**,
 * con un presupuesto estricto, y se pone un techo al total para que una actualización del
 * framework no lo dispare en silencio.
 *
 * ## Cómo se separa una cosa de la otra
 *
 * El armazón se mide contra una ruta que **no contiene ningún componente de cliente nuestro**
 * —`/_not-found` más el layout raíz—. Todo lo que la landing descarga y esa ruta no, es nuestro.
 *
 * Esa definición es lo que hace la medida honesta: se recalibra sola cuando el framework cambie,
 * en vez de depender de una lista de ficheros escrita a mano que se queda vieja.
 */

/**
 * Lo que puede pesar **nuestro** código en la landing.
 *
 * Hoy son 5,6 KB, así que el límite es poco más del doble: sitio para unas cuantas secciones más
 * —cada una ronda medio KB— y para que crezca el proveedor de la vista previa.
 *
 * **El número sale de una medida, no de lo que suena bien.** Empecé poniendo 20 KB y lo probé
 * metiendo `zod` en una sección de la landing, que es el fallo típico: una librería que entra por
 * la puerta de atrás. Sumó 12,6 KB y **cabía**, con 1,8 de margen. Un presupuesto que deja pasar
 * justo lo que existe para cazar no sirve de nada.
 *
 * Con 12 KB, esa misma librería se pasa por seis. Y para crecer de verdad hay margen: doblar
 * nuestro código son doce secciones nuevas.
 */
const PRESUPUESTO_PROPIO_BYTES = 12 * 1024;

/**
 * El techo del total, armazón incluido.
 *
 * No es un presupuesto que aspiremos a bajar: es un detector. Hoy son 106,1 KB; el techo está un
 * 13 % por encima, lo bastante para no saltar con el ruido de una versión de parche y lo bastante
 * cerca para enterarse de un salto de versión mayor que sume treinta.
 *
 * Si salta, la respuesta no es subirlo: es mirar qué creció y decidirlo con su motivo escrito.
 */
const TECHO_TOTAL_BYTES = 120 * 1024;

const NEXT = join(process.cwd(), '.next');

/** Rutas del manifiesto que forman la landing pública. */
const LANDING = ['/(site)/layout', '/(site)/page'];

/** Rutas del manifiesto sin ni un componente de cliente nuestro: eso es el armazón. */
const ARMAZON = ['/_not-found/page', '/layout'];

function leerManifiesto() {
  try {
    return JSON.parse(readFileSync(join(NEXT, 'app-build-manifest.json'), 'utf8'));
  } catch {
    console.error(
      'No se encuentra .next/app-build-manifest.json. Ejecuta `pnpm build` antes que esto.'
    );
    process.exit(1);
  }
}

const manifiesto = leerManifiesto();

// Verificación del propio script: si las claves cambiaran —porque alguien mueve un grupo de
// rutas— mediría cero y diría que todo cabe de sobra. Un presupuesto que pasa por no medir nada
// es peor que no tenerlo.
const ausentes = [...LANDING, ...ARMAZON].filter((clave) => manifiesto.pages[clave] === undefined);

if (ausentes.length > 0) {
  console.error(`No están en el manifiesto: ${ausentes.join(', ')}`);
  console.error(`Las que hay: ${Object.keys(manifiesto.pages).join(', ')}`);
  console.error('Si la estructura de rutas cambió, actualiza LANDING/ARMAZON en este script.');
  process.exit(1);
}

function scriptsDe(claves) {
  return new Set(
    claves.flatMap((clave) => manifiesto.pages[clave]).filter((f) => f.endsWith('.js'))
  );
}

function gz(ruta) {
  // La regla de lint avisa de leer un fichero con una ruta que no es literal, y tiene razón en
  // general. Aquí la ruta viene del manifiesto que acaba de escribir nuestro propio build, no de
  // fuera; y se comprueba igual que caiga dentro de `.next`, porque "viene de nuestro build" es
  // una suposición y no cuesta nada convertirla en una comprobación.
  const completa = join(NEXT, ruta);
  if (!completa.startsWith(NEXT)) {
    console.error(`Ruta fuera de .next en el manifiesto: ${ruta}`);
    process.exit(1);
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return gzipSync(readFileSync(completa), { level: 9 }).length;
}

const deLaLanding = scriptsDe(LANDING);
const delArmazon = scriptsDe(ARMAZON);

const propios = [...deLaLanding]
  .filter((fichero) => !delArmazon.has(fichero))
  .map((fichero) => ({ fichero, bytes: gz(fichero) }))
  .sort((a, b) => b.bytes - a.bytes);

const totalPropio = propios.reduce((suma, m) => suma + m.bytes, 0);
const total = [...deLaLanding].reduce((suma, fichero) => suma + gz(fichero), 0);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

console.log('\nJavaScript de la landing, comprimido:\n');
console.log('  Nuestro código:');
for (const { fichero, bytes } of propios) {
  console.log(`    ${kb(bytes).padStart(9)}  ${fichero}`);
}
console.log(`\n    ${kb(totalPropio).padStart(9)}  nuestro, de ${kb(PRESUPUESTO_PROPIO_BYTES)}`);
console.log(`    ${kb(total - totalPropio).padStart(9)}  armazón (Next + React, SPEC §2)`);
console.log(`    ${kb(total).padStart(9)}  TOTAL, de un techo de ${kb(TECHO_TOTAL_BYTES)}\n`);

const problemas = [];

// El fallo dice **qué** presupuesto se pasó y **por cuánto**. Un job en rojo que solo dice que
// falló se ignora a la tercera vez.
if (totalPropio > PRESUPUESTO_PROPIO_BYTES) {
  problemas.push(
    `Nuestro código se pasa por ${kb(totalPropio - PRESUPUESTO_PROPIO_BYTES)}. ` +
      'Arriba está la lista por tamaño: el primero es por donde empezar a mirar.'
  );
}

if (total > TECHO_TOTAL_BYTES) {
  problemas.push(
    `El total se pasa del techo por ${kb(total - TECHO_TOTAL_BYTES)}. ` +
      'Si nuestro código cabe, lo que creció es el armazón: mira qué versión cambió antes de ' +
      'subir el techo.'
  );
}

if (problemas.length > 0) {
  for (const problema of problemas) console.error(problema);
  process.exit(1);
}

console.log(
  `Dentro de presupuesto: ${kb(PRESUPUESTO_PROPIO_BYTES - totalPropio)} de margen propio, ` +
    `${kb(TECHO_TOTAL_BYTES - total)} hasta el techo.`
);
