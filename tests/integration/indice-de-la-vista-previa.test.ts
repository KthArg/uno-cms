import { expect, it } from 'vitest';
import { readCollectionForPreview } from '@/cms/core/content';
import { previewContentConObjetivo } from '@/cms/core/preview-content';
import { contentEntries, getDb } from '@/cms/db';
import { describeIntegration } from './env';

/**
 * T-246-1 y T-246-2: **el índice que se manda al iframe apunta al elemento que dice** (issue #246).
 *
 * ## De dónde sale este fichero
 *
 * De un elemento que aparecía dos veces en la vista previa. `collectionKeysInOrder` llevaba encima
 * un comentario diciendo que descartaba los elementos sin publicar, y **no descartaba nada**: la
 * columna se pedía y no se miraba. La lectura que pinta la lista sí los descarta, así que cada
 * elemento sin publicar por delante corría el índice una posición.
 *
 * El proveedor escribía entonces el borrador en el hueco de al lado: dentro de la lista,
 * sustituyendo al vecino en silencio; fuera de ella, alargándola — y el elemento salía dos veces.
 *
 * ## Por qué se comprueba así y no contando elementos
 *
 * Porque lo que hay que amarrar no es un número, es que **dos funciones estén de acuerdo**: la que
 * calcula la posición y la que compone la lista. Un test que comprobara «el índice es 1» seguiría
 * pasando el día que la lista cambie de forma y volvería a haber dos verdades.
 */

const COLECCION = 'faqs';

const RESPUESTA = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sí.' }] }],
};

async function ponerElemento(key: string, pregunta: string, publicado: boolean) {
  const contenido = { question: pregunta, answer: RESPUESTA };

  await getDb()
    .insert(contentEntries)
    .values({
      key,
      type: COLECCION,
      draft: contenido,
      published: publicado ? contenido : null,
      status: publicado ? 'published' : 'draft',
    });
}

describeIntegration('el índice de la vista previa', () => {
  it('T-246-1: un elemento sin publicar por delante no corre el índice', async () => {
    /*
     * El orden es por `sortOrder` y luego por clave, así que `faqs.a-…` va antes que `faqs.b-…`.
     * El primero **no está publicado**: no sale en la lista que se pinta, y por tanto tampoco
     * puede contar para la posición del segundo.
     */
    await ponerElemento(`${COLECCION}.a-sin-publicar`, 'no se ha publicado', false);
    await ponerElemento(`${COLECCION}.b-publicado`, 'sí se ha publicado', true);

    const { contenido, objetivo } = await previewContentConObjetivo(`${COLECCION}.b-publicado`);

    expect(objetivo.coleccion).toBe(COLECCION);

    const lista = contenido[COLECCION];
    expect(Array.isArray(lista)).toBe(true);

    // **La comprobación que importa**: en la posición que se manda está el elemento que se edita.
    // Antes del arreglo el índice era 1 sobre una lista de un solo elemento, así que aquí había
    // `undefined` — y el proveedor, al escribir ahí, alargaba la lista.
    const enEsaPosicion = (lista as { question?: string }[])[objetivo.indice ?? -1];

    expect(enEsaPosicion).toBeDefined();
    expect(enEsaPosicion?.question).toBe('sí se ha publicado');
  });

  it('T-246-2: y el elemento que se edita cuenta aunque no esté publicado', async () => {
    /*
     * El otro lado de la moneda, y es lo que hace que el filtro no se pueda escribir a lo bruto:
     * `readCollectionForPreview` **sí** conserva el elemento autorizado aunque nunca se haya
     * publicado, porque se está editando y su borrador es justo lo que hay que enseñar.
     *
     * Un filtro que descartara todo lo no publicado dejaría a ese elemento fuera de las claves,
     * `indexOf` daría -1, y la vista previa se quedaría sin destino: se escribiría y no se vería
     * nada. Es el fallo contrario y igual de silencioso.
     */
    await ponerElemento(`${COLECCION}.a-publicado`, 'ya publicado', true);
    await ponerElemento(`${COLECCION}.b-nuevo`, 'recién creado', false);

    const { contenido, objetivo } = await previewContentConObjetivo(`${COLECCION}.b-nuevo`);

    expect(objetivo.indice).toBeDefined();

    const lista = contenido[COLECCION] as { question?: string }[];
    expect(lista[objetivo.indice ?? -1]?.question).toBe('recién creado');
  });

  it('las dos lecturas devuelven la misma cantidad de elementos', async () => {
    /*
     * La invariante, dicha de la forma más directa que se puede: si las dos funciones no
     * coinciden en **cuántos** elementos hay, ningún índice de una vale para la otra.
     *
     * Se prueba con la mezcla que provocaba el fallo —publicados y sin publicar, y el autorizado
     * entre medias— porque con todo publicado las dos coincidían y por eso el fallo tardó.
     */
    await ponerElemento(`${COLECCION}.a-publicado`, 'uno', true);
    await ponerElemento(`${COLECCION}.b-sin-publicar`, 'dos', false);
    await ponerElemento(`${COLECCION}.c-autorizado`, 'tres', false);
    await ponerElemento(`${COLECCION}.d-publicado`, 'cuatro', true);

    const objetivo = `${COLECCION}.c-autorizado`;
    const { contenido } = await previewContentConObjetivo(objetivo);
    const pintada = await readCollectionForPreview(COLECCION, objetivo);

    expect((contenido[COLECCION] as unknown[]).length).toBe(pintada.length);
    // Tres: los dos publicados y el autorizado. El que sobra —`b`, sin publicar y sin autorizar—
    // es exactamente el que corría los índices.
    expect(pintada.length).toBe(3);
  });
});
