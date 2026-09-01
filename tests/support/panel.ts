import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO_ROOT } from './module-boundary';

/**
 * Los ficheros que pintan el panel (spec 10).
 *
 * Se recorre el disco en vez de mantener una lista: una lista se queda corta en cuanto alguien
 * añade una pantalla, y una guarda que no mira los ficheros nuevos es peor que no tenerla,
 * porque parece que los mira.
 *
 * `app/(site)` queda fuera **a propósito**: la landing pública no entra en esta fase y sigue
 * con sus colores literales. Es una exclusión declarada, no un olvido — si algún día entra,
 * se quita de aquí y los casos que la cubren aparecen solos.
 */
const DIRECTORIOS = ['cms/ui', 'app/admin', 'app/setup'];

export function ficherosDelPanel(): readonly string[] {
  const encontrados: string[] = [];

  const recorrer = (directorio: string): void => {
    for (const entrada of readdirSync(directorio)) {
      const ruta = join(directorio, entrada);

      if (statSync(ruta).isDirectory()) {
        recorrer(ruta);
        continue;
      }

      // **También los `.ts`, y no siempre fue así.** Al mover las clases compartidas a
      // `cms/ui/estilos.ts` (#224), un fichero que es justamente el que más clases de color
      // tiene se habría quedado fuera de la vigilancia. Una guarda que deja de mirar donde se
      // acaba de concentrar el riesgo es peor que no tenerla, porque parece que lo mira.
      if (entrada.endsWith('.tsx') || entrada.endsWith('.ts'))
        encontrados.push(relative(REPO_ROOT, ruta).replaceAll('\\', '/'));
    }
  };

  for (const directorio of DIRECTORIOS) recorrer(join(REPO_ROOT, directorio));

  return encontrados;
}
