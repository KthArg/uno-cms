import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { pedirPublicado } from '@/examples/web-remota/lib/contenido.js';
import { escapar, jsonParaScript, paginaHtml, texto } from '@/examples/web-remota/lib/pagina.js';
import { sinComentarios } from '../support/codigo';
import { REPO_ROOT } from '../support/module-boundary';

/**
 * T-194-1 … T-194-5: **el ejemplo de web alimentada desde fuera** (issue #195).
 *
 * ## Por qué un ejemplo lleva tests
 *
 * Porque un ejemplo **se copia entero**. Lo que tenga mal no se queda aquí: se reparte a cada
 * persona que lo lea, y con la confianza de venir del propio proyecto. Un ejemplo con una
 * inyección de HTML enseña a inyectar.
 *
 * Y porque es lo único que sostiene la afirmación de `docs/DEVELOPER.md`: que el contrato se
 * puede seguir sin añadir nada que no esté escrito allí.
 */

const CMS = 'https://mi-cms.example';

/** Una respuesta del CMS, del tipo que sea. */
function respuesta(cuerpo: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) });
}

describe('T-194-1 — lo publicado se pide desde el servidor', () => {
  it('llama a `/api/content/:key` del CMS, por clave', async () => {
    const buscar = vi.fn((url: string) =>
      url.endsWith('/testimonials') || url.endsWith('/faqs')
        ? respuesta({ items: [{ author: 'Ana' }] })
        : respuesta({ data: { title: 'Hola' } })
    );

    const contenido = await pedirPublicado(CMS, buscar);

    const pedidas = buscar.mock.calls.map(([url]) => url);
    expect(pedidas).toContain(`${CMS}/api/content/hero`);
    expect(pedidas).toContain(`${CMS}/api/content/testimonials`);
    // Los singletons vienen en `data` y las colecciones en `items`: son dos formas distintas y
    // confundirlas deja la sección vacía sin decir nada.
    expect(contenido['hero']).toEqual({ title: 'Hola' });
    expect(contenido['testimonials']).toEqual([{ author: 'Ana' }]);
  });

  it('una barra final de más no rompe la dirección', async () => {
    // `CMS_URL=https://mi-cms.com/` es lo que sale de copiar la dirección del navegador, y sin
    // esto produciría `//api/content/hero`.
    const buscar = vi.fn((_url: string) => respuesta({ data: {} }));

    await pedirPublicado(`${CMS}/`, buscar);

    expect(buscar.mock.calls[0]?.[0]).toBe(`${CMS}/api/content/hero`);
  });

  it('una clave que falla no tumba la página', async () => {
    // Una sección ausente se ve. Una página en blanco por un 500 del CMS también, y además no
    // dice nada.
    const buscar = vi.fn((url: string) =>
      url.endsWith('/hero')
        ? Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
        : respuesta({ data: { heading: 'Sobre nosotros' } })
    );

    const contenido = await pedirPublicado(CMS, buscar);

    expect(contenido['hero']).toBeUndefined();
    expect(contenido['about']).toEqual({ heading: 'Sobre nosotros' });
  });
});

describe('T-194-5 — sin `CMS_URL` no arranca en silencio', () => {
  it('lo dice, y dice qué falta', async () => {
    // Sin esto pediría a `undefined/api/content/hero` y el fallo llegaría como un error de red
    // que no menciona la variable que falta.
    for (const sinValor of ['', '   ', undefined as unknown as string]) {
      await expect(pedirPublicado(sinValor)).rejects.toThrow(/CMS_URL/);
    }
  });
});

describe('T-194-4 — lo que llega del CMS se escapa', () => {
  it('el escapado cubre también las comillas, que hacen falta en un atributo', () => {
    // El enlace del botón va dentro de `href="…"`. Sin escapar las comillas, un valor con una
    // comilla cierra el atributo y lo que siga es markup.
    expect(escapar('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapar('" onerror="x')).toBe('&quot; onerror=&quot;x');
    expect(escapar("' onmouseover='x")).toBe('&#39; onmouseover=&#39;x');
  });

  it('el título de la página sale escapado', () => {
    const html = paginaHtml({ seo: { title: '</title><script>alert(1)</script>' } }, CMS);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('y el contenido metido en el `<script>` no se puede salir de él', () => {
    // **El fallo que este caso encontró de verdad.** `JSON.stringify` escapa comillas, que es lo
    // que hace falta para que el JSON sea válido — y no toca `<`. El navegador cierra la etiqueta
    // al ver `</script>` antes de que nada mire el JavaScript, así que un título con
    // `</script><script>…` dentro se sale del bloque y lo que siga se ejecuta.
    const veneno = '</script><script>alert(1)</script>';
    const html = paginaHtml({ hero: { title: veneno } }, CMS);

    expect(html).not.toContain('</script><script>alert(1)');
    expect(jsonParaScript({ x: veneno })).not.toContain('</script>');
    // Y sigue siendo JSON válido: escapar no puede costar el contenido.
    expect(JSON.parse(jsonParaScript({ x: veneno })) as { x: string }).toEqual({ x: veneno });
  });

  it('el texto de un richtext se saca sin markup', () => {
    // ADR-107: el CMS entrega el richtext como documento de ProseMirror, no como HTML. Sacar el
    // texto es lo que impide que por ahí entre nada.
    expect(texto({ content: [{ text: 'hola' }, { content: [{ text: 'mundo' }] }] })).toBe(
      'hola mundo'
    );
    expect(texto(null)).toBe('');
    expect(texto({ content: 'no es una lista' })).toBe('');
  });
});

describe('T-194-2 y T-194-3 — el ejemplo y la documentación no pueden divergir', () => {
  const DEVELOPER = readFileSync(join(REPO_ROOT, 'docs', 'DEVELOPER.md'), 'utf8');
  const html = paginaHtml({ hero: { title: 'Hola' } }, CMS);

  /**
   * El **código** que se manda al navegador: lo que hay dentro de las etiquetas `script`, sin
   * comentarios.
   *
   * Sin quitarlos, el caso de abajo se pondría rojo por el comentario que **explica** que no se
   * pide contenido publicado desde aquí. Un test que no distingue código de prosa acaba
   * obligando a no escribir la prosa, que es la parte que hacía falta.
   */
  const enElNavegador = sinComentarios(
    html.slice(html.indexOf('<script'), html.lastIndexOf('</script>'))
  );

  it('T-194-2: el navegador no pide contenido publicado', () => {
    // **La trampa que este ejemplo existe para no propagar.** `/api/content/:key` no manda
    // cabeceras CORS (T-R-14), así que ese `fetch` falla con un `Failed to fetch` que no dice
    // por qué. Lo desconcertante es que la vista previa **sí** funciona desde el navegador, o
    // sea que lo difícil va y lo fácil no.
    expect(enElNavegador).not.toContain('/api/content/');
  });

  it('T-194-3: la vista previa arranca como dice la documentación', () => {
    for (const pieza of ['unocms_preview', 'preview-cliente.js', 'conectar(']) {
      expect(enElNavegador, `el ejemplo no usa ${pieza}`).toContain(pieza);
      expect(DEVELOPER, `la documentación no menciona ${pieza}`).toContain(pieza);
    }
  });

  it('T-194-3: y no hace falta nada que la documentación no cuente', () => {
    // Si el ejemplo llamara a una ruta del CMS que `DEVELOPER.md` no menciona, el contrato
    // documentado estaría incompleto y quien lo siguiera se quedaría a medias.
    // Una sola clase de caracteres con un `*`, sin cuantificadores anidados: `eslint-plugin
    // -security` marca `(?:…)+(?:…)*` como expresión con retroceso catastrófico, y tiene razón
    // en que la forma es esa aunque aquí la entrada sea nuestra.
    const rutasDelCms = [...enElNavegador.matchAll(/\/[a-z0-9/-]*\.js/g)].map(
      (encontrada) => encontrada[0]
    );

    for (const ruta of new Set(rutasDelCms)) {
      expect(DEVELOPER, `el ejemplo carga ${ruta} y la documentación no lo dice`).toContain(ruta);
    }
  });

  it('cada sección lleva su `data-cms-key`', () => {
    // Es lo que el CMS busca para desplazarse a la sección que se está editando (SPEC §6.1
    // paso 5). Sin él la vista previa funciona, pero quien edita busca a mano lo que escribió.
    for (const clave of ['hero', 'about', 'testimonials', 'faqs']) {
      expect(enElNavegador).toContain(`data-cms-key="${clave}"`);
    }
  });
});
