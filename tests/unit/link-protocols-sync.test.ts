import { describe, expect, it } from 'vitest';
import { allowedLinkProtocols } from '@/cms/core/links';
import { PROTOCOLOS_DE_ENLACE } from '@/cms/ui/fields/link-protocols';

/**
 * ADR-411: la lista de protocolos del cliente está **copiada** de la del servidor, porque
 * `cms/core/links.ts` es `server-only` y el editor de texto rico necesita el dato para avisar
 * en vivo.
 *
 * Este test es lo que hace aceptable esa copia. Sin él serían dos verdades sueltas esperando a
 * separarse; con él, separarse rompe CI.
 *
 * Lo que se compara es **solo el dato**. La lógica de validación no está duplicada: vive
 * únicamente en el servidor, que es quien decide lo que se guarda.
 */

describe('ADR-411 — las dos listas de protocolos no pueden divergir', () => {
  it('la del cliente es exactamente la del servidor', () => {
    // El servidor los guarda con dos puntos (`http:`) porque compara contra `URL.protocol`;
    // Tiptap los quiere sin ellos. La diferencia es de formato, no de contenido.
    const delServidor = [...allowedLinkProtocols].map((protocolo) => protocolo.replace(':', ''));

    expect([...PROTOCOLOS_DE_ENLACE].sort()).toEqual(delServidor.sort());
  });

  it('ninguna de las dos admite protocolos peligrosos', () => {
    // Redundante con el test de `isSafeLink`, y a propósito: si alguien amplía las dos listas
    // a la vez para "arreglar" el test de arriba, este sigue en pie.
    for (const prohibido of ['javascript', 'data', 'blob', 'vbscript', 'file']) {
      expect([...PROTOCOLOS_DE_ENLACE]).not.toContain(prohibido);
    }
  });
});
