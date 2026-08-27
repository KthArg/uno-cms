/**
 * Aplica las migraciones antes de construir, **cuando hay una base a la que aplicarlas**
 * (ADR-702, issue #192).
 *
 * ## Por qué esto existe
 *
 * Porque no lo hacía nadie. Las migraciones se aplicaban en CI para sus bases de test y en la
 * máquina de quien desarrolla; un despliegue nuevo se quedaba con una base sin tablas. Y el
 * README promete un botón de un clic: sin esto, ese botón produce un sitio que responde 500 en
 * la primera pantalla que se visita.
 *
 * ## Por qué en la construcción y no al arrancar
 *
 * Arrancar pasa muchas veces —cada arranque en frío de una función serverless— y a la vez.
 * Migrar es una operación con estado que no quiere compañía. La construcción pasa una vez por
 * despliegue, tiene las variables de entorno delante y **puede fallar sin dejar nada a medias**:
 * si la migración no va, no hay despliegue.
 *
 * ## Sin `DATABASE_URL` no se falla, y es deliberado
 *
 * El job de `build` de CI construye **sin base de datos** a propósito: `next build` es también el
 * guard de la frontera servidor/cliente de SPEC §7.1, y para eso no hace falta ninguna base.
 * Exigirla aquí dejaría el pipeline en rojo por algo que no es un fallo. Es el caso T-192-2, y es
 * el que se rompe sin querer al arreglar el otro.
 */

import { spawnSync } from 'node:child_process';

/**
 * Qué hacer, dado el entorno. Aparte para poder probarla sin ejecutar migraciones de verdad.
 *
 * Una cadena vacía cuenta como ausente: es lo que queda al declarar la variable en un panel de
 * despliegue y no rellenarla, y tratarla como una dirección haría fallar la construcción con un
 * error de conexión en vez de con el aviso de que falta.
 */
export function decidir(entorno) {
  const url = entorno.DATABASE_URL;

  if (typeof url !== 'string' || url.trim() === '') return 'saltar';

  return 'migrar';
}

/** El aviso que se lee en el registro de la construcción cuando no hay base. */
export const AVISO_SIN_BASE =
  '[migraciones] Sin DATABASE_URL: no se aplica ninguna migración.\n' +
  '              Es lo normal al construir sin base de datos (CI, comprobaciones locales).\n' +
  '              En un despliegue de verdad esto significa que la base NO está preparada.';

// `import.meta.main` no existe en todas las versiones de Node que valen para este proyecto, así
// que se compara el fichero que se está ejecutando. Sin esto, importar el módulo desde un test
// aplicaría migraciones de verdad.
const esEjecuciónDirecta =
  process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (esEjecuciónDirecta) {
  if (decidir(process.env) === 'saltar') {
    console.warn(AVISO_SIN_BASE);
  } else {
    console.log('[migraciones] Aplicando las migraciones pendientes…');

    // El mismo comando que `pnpm db:migrate`, no una copia con otros argumentos: si algún día
    // cambia, cambia en un sitio. `--conditions=react-server` es lo que hace que drizzle-kit
    // resuelva el driver de cable y no el HTTP de Neon (ADR-200).
    const resultado = spawnSync(
      process.execPath,
      ['--conditions=react-server', './node_modules/drizzle-kit/bin.cjs', 'migrate'],
      { stdio: 'inherit' }
    );

    if (resultado.status !== 0) {
      console.error(
        '[migraciones] Han fallado. No se construye: desplegar código que no cuadra con la\n' +
          '              base de datos es peor que no desplegar.'
      );
      process.exit(resultado.status ?? 1);
    }
  }
}
