import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registrarImagen } from '@/cms/actions';
import { resetBucketsForTests, setSessionProviderForTests } from '@/cms/actions/pipeline';
import { getDb, media, users } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-205-1 a T-205-3: **la imagen se anota sin esperar al aviso de Vercel** (issue #205, ADR-705).
 *
 * Medido en el despliegue antes de escribir esto: el refresco del cliente salía **un segundo
 * antes** de que llegara el aviso que escribía la fila, así que la biblioteca se pintaba sin la
 * imagen. Y ese aviso era el único que la escribía: si no llega, el fichero se queda en el
 * almacén y el CMS no se entera nunca.
 */

const ALMACEN = 'https://9lcnpfkujauvaxx4.public.blob.vercel-storage.com';
const NOMBRE = 'media/2026-08/8a1f0c2e-1111-4222-8333-444455556666.png';

function imagen(pathname = NOMBRE) {
  return {
    url: `${ALMACEN}/${pathname}`,
    pathname,
    filename: 'Mi Foto.png',
    mimeType: 'image/png',
  };
}

async function entrarComo(role: 'admin' | 'editor') {
  const [user] = await getDb()
    .insert(users)
    .values({ email: `${role}@ejemplo.com`, name: 'Quien sube', passwordHash: 'x', role })
    .returning();

  setSessionProviderForTests(() => Promise.resolve({ userId: user!.id, email: user!.email, role }));
}

describeIntegration('registrar una imagen recién subida', () => {
  beforeEach(() => {
    resetBucketsForTests();
  });

  afterEach(() => {
    setSessionProviderForTests(null);
  });

  it('T-205-1: queda registrada, sin que haya llegado ningún aviso', async () => {
    await entrarComo('editor');

    const resultado = await registrarImagen(imagen());

    expect(resultado.ok).toBe(true);

    const filas = await getDb().select().from(media);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.pathname).toBe(NOMBRE);
    expect(filas[0]?.url).toBe(`${ALMACEN}/${NOMBRE}`);
  });

  it('T-205-2: registrarla dos veces no la duplica', async () => {
    // El aviso de Vercel escribe lo mismo, y puede llegar antes o después. El segundo en llegar
    // no debe hacer nada **ni fallar**: si fallara, quien sube vería un error por algo que salió
    // bien.
    await entrarComo('editor');

    expect((await registrarImagen(imagen())).ok).toBe(true);
    expect((await registrarImagen(imagen())).ok).toBe(true);

    expect(await getDb().select().from(media)).toHaveLength(1);
  });

  it('el nombre que manda el cliente no decide dónde se guarda', async () => {
    // `filename` es **una etiqueta**: se pinta en la biblioteca y React lo escapa. Lo que decide
    // la dirección es `pathname`, que va comprobado. Así que un nombre hostil se guarda tal cual
    // —menos los caracteres de control, que romperían el listado— y no llega a ninguna parte.
    await entrarComo('editor');
    await registrarImagen({ ...imagen(), filename: '../../Mi <b>Foto</b>.png' });

    const [fila] = await getDb().select().from(media);

    expect(fila?.filename).not.toContain('');
    expect(fila?.pathname).toBe(NOMBRE);
    expect(fila?.url).toBe(`${ALMACEN}/${NOMBRE}`);
  });

  it('T-205-3: sin sesión no se registra nada', async () => {
    setSessionProviderForTests(() => Promise.resolve(null));

    const resultado = await registrarImagen(imagen());

    expect(resultado.ok).toBe(false);
    expect(await getDb().select().from(media)).toHaveLength(0);
  });

  describe('T-205-4: y lo que le mandan lo comprueba, campo por campo', () => {
    /**
     * **Este bloque llama a la action de verdad, y esa es toda la gracia.**
     *
     * La primera versión reproducía el criterio en un test unitario, sobre las mismas funciones
     * pero fuera de la action. Pasaba en verde con las tres comprobaciones **quitadas**: se
     * estaba probando a sí misma. Lo enseñó la mutación, no releerla — se lee igual de bien de
     * las dos maneras.
     *
     * Sin esto, cualquiera con sesión mete en la biblioteca una fila que apunta a donde quiera,
     * y esa fila es la que el panel enseña y la que la landing sirve.
     */
    const RECHAZOS: readonly (readonly [string, Parameters<typeof registrarImagen>[0]])[] = [
      ['otro dominio', { ...imagen(), url: `https://malo.io/${NOMBRE}` }],
      ['sin https', { ...imagen(), url: `http://x.public.blob.vercel-storage.com/${NOMBRE}` }],
      // Lleva el dominio dentro: un `includes` sobre la cadena entera lo daría por bueno. El
      // host ya analizado, no. Es el que decide si la comprobación está bien hecha.
      [
        'el dominio metido en la query',
        { ...imagen(), url: `https://malo.io/?x=.public.blob.vercel-storage.com/${NOMBRE}` },
      ],
      [
        'nuestro dominio como prefijo del suyo',
        { ...imagen(), url: `https://public.blob.vercel-storage.com.malo.io/${NOMBRE}` },
      ],
      ['algo que no es una url', { ...imagen(), url: 'no es una url' }],
      // Nombre válido, dominio válido, y la URL apunta a otro objeto: se guardaría un nombre
      // correcto señalando a algo que no es.
      [
        'la url y el nombre no coinciden',
        {
          ...imagen(),
          url: `${ALMACEN}/media/2026-08/99999999-1111-4222-8333-444455556666.png`,
        },
      ],
      // El nombre crudo del fichero de quien sube: es lo que se guardaba antes de #199.
      ['un nombre que no genera el CMS', imagen('Screenshot 2026-08-19 212752.png')],
      ['un nombre con la extensión cambiada', imagen(NOMBRE.replace('.png', '.gif'))],
      ['un tipo que no aceptamos', { ...imagen(), mimeType: 'image/svg+xml' }],
    ];

    for (const [caso, entrada] of RECHAZOS) {
      it(`no se registra: ${caso}`, async () => {
        await entrarComo('editor');

        const resultado = await registrarImagen(entrada);

        expect(resultado.ok).toBe(false);
        expect(await getDb().select().from(media)).toHaveLength(0);
      });
    }
  });
});
