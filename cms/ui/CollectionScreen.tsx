'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ElementoDeColeccion } from '@/cms/core/collections';
import { ConfirmarAccion } from './ConfirmarAccion';
import { EstadoDeSeccion } from './EstadoDeSeccion';

/**
 * La pantalla de una colección: listar, crear, ordenar y eliminar (SPEC §5.3, §9).
 *
 * ## Se ordena con botones, no arrastrando
 *
 * El issue #111 pedía arrastre. Se cambia a "subir" y "bajar", y conviene decir por qué en vez
 * de dejarlo como un detalle:
 *
 * - **Arrastrar no funciona con teclado**, y la accesibilidad básica es un criterio de este
 *   hito. Hacerlo bien exige duplicar la interacción con teclas de todas formas, o sea que los
 *   botones hay que escribirlos igual.
 * - Una lista de una landing tiene cinco o diez elementos. El arrastre gana cuando hay
 *   decenas y mover uno al final es tedioso; con cinco, dos clics son más rápidos que apuntar.
 * - Sin dependencia nueva.
 *
 * Lo que no cambia es el contrato: `reorderItems` exige la lista **completa** (M3, #80), así
 * que se manda entera y no un "mueve este de aquí a allá".
 */

export interface CollectionScreenProps {
  readonly nombreColeccion: string;
  readonly elementos: readonly ElementoDeColeccion[];
  readonly onCrear: () => Promise<{ ok: boolean; key?: string; message?: string }>;
  readonly onReordenar: (orderedKeys: string[]) => Promise<{ ok: boolean; message?: string }>;
  readonly onEliminar: (key: string) => Promise<{ ok: boolean; message?: string }>;
  readonly puedeEliminar: boolean;
}

export function CollectionScreen({
  nombreColeccion,
  elementos,
  onCrear,
  onReordenar,
  onEliminar,
  puedeEliminar,
}: CollectionScreenProps) {
  const router = useRouter();
  const [orden, setOrden] = useState<readonly ElementoDeColeccion[]>(elementos);
  const [aEliminar, setAEliminar] = useState<ElementoDeColeccion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const crear = async (): Promise<void> => {
    setOcupado(true);
    const resultado = await onCrear();
    setOcupado(false);

    if (!resultado.ok || resultado.key === undefined) {
      setAviso(resultado.message ?? 'No se ha podido crear.');
      return;
    }

    // Se va directo a editarlo. Dejar al editor mirando una fila vacía recién aparecida es
    // pedirle que adivine que ahora tiene que pulsarla.
    router.push(`/admin/content/${resultado.key}`);
  };

  const mover = async (indice: number, direccion: -1 | 1): Promise<void> => {
    const destino = indice + direccion;
    if (destino < 0 || destino >= orden.length) return;

    const siguiente = [...orden];
    const [movido] = siguiente.splice(indice, 1);
    if (movido === undefined) return;
    siguiente.splice(destino, 0, movido);

    // Se pinta ya y se confirma después: mover algo tiene que responder al instante o parece
    // que no ha pasado nada.
    setOrden(siguiente);
    setOcupado(true);

    const resultado = await onReordenar(siguiente.map((elemento) => elemento.key));
    setOcupado(false);

    if (!resultado.ok) {
      // Y se deshace si el servidor dice que no. Dejar la pantalla con un orden que la base de
      // datos no tiene es peor que no haber movido nada.
      setOrden(orden);
      setAviso(resultado.message ?? 'No se ha podido cambiar el orden.');
      return;
    }

    setAviso(null);
  };

  const eliminar = async (elemento: ElementoDeColeccion): Promise<void> => {
    setAEliminar(null);
    const resultado = await onEliminar(elemento.key);

    if (!resultado.ok) {
      setAviso(resultado.message ?? 'No se ha podido eliminar.');
      return;
    }

    setOrden((previos) => previos.filter((otro) => otro.key !== elemento.key));
    setAviso(`Se ha eliminado «${elemento.titulo}».`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{nombreColeccion}</h1>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            void crear();
          }}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Añadir
        </button>
      </div>

      <p aria-live="polite" className="text-sm text-slate-600">
        {aviso}
      </p>

      {orden.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="text-slate-700">Todavía no hay nada en esta lista.</p>
          <p className="mt-1 text-sm text-slate-500">
            Pulsa «Añadir» para crear el primero. No se verá en tu web hasta que lo publiques.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {orden.map((elemento, indice) => (
            <li
              key={elemento.key}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/content/${elemento.key}`}
                  className="font-medium text-slate-900 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  {elemento.titulo}
                </Link>
              </div>

              <EstadoDeSeccion estado={elemento.estado} />

              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={indice === 0 || ocupado}
                  // El nombre accesible dice **qué** se mueve: "Subir" a secas, repetido diez
                  // veces, no distingue nada para quien navega con lector de pantalla.
                  aria-label={`Subir ${elemento.titulo}`}
                  onClick={() => {
                    void mover(indice, -1);
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={indice === orden.length - 1 || ocupado}
                  aria-label={`Bajar ${elemento.titulo}`}
                  onClick={() => {
                    void mover(indice, 1);
                  }}
                  className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  ↓
                </button>
              </div>

              {puedeEliminar && (
                <button
                  type="button"
                  aria-label={`Eliminar ${elemento.titulo}`}
                  onClick={() => {
                    setAEliminar(elemento);
                  }}
                  className="text-sm text-red-700 underline underline-offset-4 hover:text-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                >
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {aEliminar !== null && (
        <ConfirmarAccion
          titulo={`¿Eliminar «${aEliminar.titulo}»?`}
          descripcion={
            aEliminar.estado === 'publicado' || aEliminar.estado === 'con-cambios'
              ? 'Está publicado, así que también desaparecerá de tu web. No se puede recuperar.'
              : 'No se puede recuperar. Todavía no estaba publicado, así que tu web no cambia.'
          }
          textoConfirmar="Sí, eliminar"
          onConfirmar={() => {
            void eliminar(aEliminar);
          }}
          onCancelar={() => {
            setAEliminar(null);
          }}
        />
      )}

      <p className="text-sm text-slate-500">
        El orden se guarda solo. Lo que escribas dentro de cada elemento hay que publicarlo desde su
        pantalla o con «Publicar todo».
      </p>
    </div>
  );
}
