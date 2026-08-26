import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/preview/contenido/route';
import { GET as GET_PUBLICO } from '@/app/api/content/[key]/route';
import { contentEntries, getDb } from '@/cms/db';
import { signToken } from '@/cms/security/tokens';
import { describeIntegration } from './env';

/**
 * T-R-1 y T-R-4 … T-R-14: **la única ruta por la que un borrador sale de la aplicación**
 * (spec 08 §4.3, ADR-701).
 *
 * ## Por qué integración y no unidad
 *
 * Porque el caso que da sentido a todos los demás es un **200 con un borrador dentro**, y para
 * eso hace falta una base de datos con contenido de verdad. Sin él, "sin la variable responde
 * 404" pasaría también con la comprobación quitada — que es exactamente lo que le pasó a este
 * caso mientras la ruta era solo el interruptor, y por eso vivía en otro sitio con un 501 de
 * andamio al lado.
 *
 * Aquí el 404 y el 200 están en el mismo fichero y con el mismo montaje, así que cada rechazo
 * se mide contra lo que pasaría si no rechazara.
 *
 * ## Lo que no se repite aquí
 *
 * Qué se acepta como origen —T-R-7 incluido— vive en `tests/unit/vista-previa-remota.test.ts`,
 * sin red ni base de datos. Que el borrador sea solo el de la clave del token es de ADR-501 y
 * está probado en `preview-content.test.ts`. Esta ruta los **llama**; repetir sus casos sería
 * mantener dos veces la misma lista creyendo que se cubre el doble.
 */

const ORIGEN = 'https://mi-web.example';
const OTRO = 'https://otra.example';

function encender(origenes = ORIGEN) {
  vi.stubEnv('PREVIEW_ORIGINS', origenes);
}

/** Una petición como la que manda el cliente de §4.6 desde la web de destino. */
function pedir(opciones: { token?: string | null; origen?: string | null } = {}) {
  const url = new URL('https://mi-cms.example/api/preview/contenido');
  if (opciones.token !== null && opciones.token !== undefined) {
    url.searchParams.set('token', opciones.token);
  }

  const headers = new Headers();
  if (opciones.origen !== null && opciones.origen !== undefined) {
    headers.set('origin', opciones.origen);
  }

  return new Request(url, { headers });
}

async function ponerEntrada(key: string, type: string, draft: object, published: object | null) {
  await getDb()
    .insert(contentEntries)
    .values({
      key,
      type,
      draft: draft as Record<string, unknown>,
      published: published as Record<string, unknown> | null,
      status: published === null ? 'draft' : 'changed',
    })
    .onConflictDoUpdate({ target: contentEntries.key, set: { draft, published } });
}

describeIntegration('la ruta que sirve borradores hacia fuera', () => {
  beforeEach(async () => {
    // `signToken` y `verifyToken` **lanzan** sin `APP_SECRET`: es un contrato deliberado de M2,
    // no un descuido, y por eso se pone aquí en vez de dejar que el test lo descubra.
    vi.stubEnv('APP_SECRET', 'un-secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres');

    await ponerEntrada('hero', 'hero', { title: 'BORRADOR hero' }, { title: 'publicado hero' });
    await ponerEntrada(
      'about',
      'about',
      { heading: 'BORRADOR about' },
      { heading: 'publicado about' }
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('T-R-5: con la fase encendida, origen de la lista y token válido, responde 200', async () => {
    encender();

    const respuesta = await GET(
      pedir({ origen: ORIGEN, token: signToken('preview-remoto', { key: 'hero' }) })
    );

    expect(respuesta.status).toBe(200);
    // El origen **exacto** de esta petición, nunca `*`. Con `*`, cualquier página abierta en el
    // navegador de quien edita podría leer la respuesta con un token filtrado.
    expect(respuesta.headers.get('access-control-allow-origin')).toBe(ORIGEN);
    expect(respuesta.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('T-R-6: la respuesta buena lleva `Vary: Origin` y `no-store`', async () => {
    encender();

    const respuesta = await GET(
      pedir({ origen: ORIGEN, token: signToken('preview-remoto', { key: 'hero' }) })
    );

    // `no-store` porque son borradores. `Vary` porque la respuesta depende de `Origin`: sin él,
    // una caché intermedia serviría a un origen lo que respondimos a otro.
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
    expect(respuesta.headers.get('vary')).toBe('Origin');
  });

  it('T-R-8: sale el borrador de la clave del token y lo publicado de todo lo demás', async () => {
    encender();

    const respuesta = await GET(
      pedir({ origen: ORIGEN, token: signToken('preview-remoto', { key: 'hero' }) })
    );
    const cuerpo = (await respuesta.json()) as {
      contenido: Record<string, Record<string, string>>;
      objetivo: { key: string };
    };

    // Lo que hace que la clave dentro de la firma acote algo (ADR-501): un token filtrado no es
    // una llave maestra a todo lo que hay sin publicar.
    expect(cuerpo.contenido['hero']?.['title']).toBe('BORRADOR hero');
    expect(cuerpo.contenido['about']?.['heading']).toBe('publicado about');
    expect(cuerpo.objetivo.key).toBe('hero');
  });

  it('T-R-1: sin `PREVIEW_ORIGINS`, la misma petición responde 404', async () => {
    // La misma petición que acaba de dar 200, con lo único que cambia siendo la variable. Es lo
    // que hace que este caso pueda fallar.
    vi.stubEnv('PREVIEW_ORIGINS', undefined);

    const respuesta = await GET(
      pedir({ origen: ORIGEN, token: signToken('preview-remoto', { key: 'hero' }) })
    );

    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).toBe('');
    expect(respuesta.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('T-R-4 y T-R-7: un origen que no está en la lista, 404 y sin cabecera CORS', async () => {
    encender();
    const token = signToken('preview-remoto', { key: 'hero' });

    for (const origen of [OTRO, `${ORIGEN}.malo.io`, 'https://sub.mi-web.example', null]) {
      const respuesta = await GET(pedir({ origen, token }));

      expect(respuesta.status, String(origen)).toBe(404);
      // **Sin la cabecera**, no con la cabecera puesta a otra cosa: un navegador que recibiera
      // `Access-Control-Allow-Origin` con cualquier valor útil dejaría leer la respuesta.
      expect(respuesta.headers.get('access-control-allow-origin'), String(origen)).toBeNull();
    }
  });

  it('T-R-11: sin token, caducado, mal firmado y de otro propósito responden igual', async () => {
    encender();

    const caducado = signToken('preview-remoto', { key: 'hero' }, -1);
    const local = signToken('preview', { key: 'hero' });
    const [payload] = signToken('preview-remoto', { key: 'hero' }).split('.');

    for (const token of [null, '', 'basura', caducado, local, `${payload}.${'A'.repeat(43)}`]) {
      const respuesta = await GET(pedir({ origen: ORIGEN, token }));

      expect(respuesta.status, String(token)).toBe(404);
      expect(await respuesta.text(), String(token)).toBe('');
      expect(respuesta.headers.get('access-control-allow-origin'), String(token)).toBeNull();
    }
  });

  it('T-R-9: un token de `preview` no abre esta ruta aunque el origen sea correcto', async () => {
    // Está en el caso de arriba junto a los demás rechazos, y aparte aquí porque no es lo mismo:
    // los otros son entradas rotas y este es un token **nuestro, válido y bien firmado**. Lo
    // único que lo separa es el propósito, y eso es lo que se está comprobando.
    encender();

    const respuesta = await GET(
      pedir({ origen: ORIGEN, token: signToken('preview', { key: 'hero' }) })
    );

    expect(respuesta.status).toBe(404);
  });
});

describeIntegration('lo de siempre no cambia con la fase encendida', () => {
  beforeEach(async () => {
    vi.stubEnv('APP_SECRET', 'un-secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres');
    encender();

    await ponerEntrada('hero', 'hero', { title: 'BORRADOR hero' }, { title: 'publicado hero' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('T-R-13: `/api/content/:key` sigue sirviendo solo lo publicado', async () => {
    // Es **la mitad del trabajo de esta fase**: lo que se añade es una ruta, no un permiso
    // general. Si esto se rompiera, la ruta pública de siempre estaría publicando borradores
    // sin que nadie pulse nada, y el token y la lista de orígenes no servirían de nada.
    const respuesta = await GET_PUBLICO(new Request('https://mi-cms.example/api/content/hero'), {
      params: Promise.resolve({ key: 'hero' }),
    });
    const cuerpo = (await respuesta.json()) as { data: Record<string, string> };

    expect(respuesta.status).toBe(200);
    expect(cuerpo.data['title']).toBe('publicado hero');
    expect(JSON.stringify(cuerpo)).not.toContain('BORRADOR');
  });

  it('T-R-14: `/api/content/:key` sigue sin cabeceras CORS', async () => {
    // Ni con `Origin` de la lista. Que un origen esté autorizado a leer borradores por la ruta
    // nueva no lo autoriza a nada aquí: son dos permisos distintos y esta ruta no tiene ninguno.
    const respuesta = await GET_PUBLICO(
      new Request('https://mi-cms.example/api/content/hero', { headers: { origin: ORIGEN } }),
      { params: Promise.resolve({ key: 'hero' }) }
    );

    expect(respuesta.headers.get('access-control-allow-origin')).toBeNull();
    expect(respuesta.headers.get('vary')).toBeNull();
  });
});
