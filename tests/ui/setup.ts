import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Preparación de los tests de componentes del panel.
 *
 * `cleanup` después de cada test y no al final: sin él, cada `render` deja su árbol en el
 * documento y las consultas de Testing Library —que buscan en todo el `body`— encuentran
 * elementos de tests anteriores. El síntoma es un "found multiple elements" que aparece solo
 * cuando los tests corren juntos, y desaparece al ejecutarlos de uno en uno.
 */
afterEach(() => {
  cleanup();
});

/**
 * Lo que jsdom no implementa y ProseMirror usa.
 *
 * `getClientRects` y `elementFromPoint` son APIs de **maquetación**, y jsdom no maqueta nada:
 * no hay cajas, ni posiciones, ni puntos. ProseMirror las llama al montar el editor y al
 * situar el cursor.
 *
 * Estos son sustitutos vacíos, y conviene saber exactamente qué compran y qué no:
 *
 * - **Compran** que el editor se monte y que se pueda comprobar qué contenido tiene. Eso es
 *   lo que prueban los tests de sincronización: que un valor de fuera se refleja dentro.
 * - **No compran nada sobre el cursor, la selección ni el desplazamiento.** Todo lo que
 *   dependa de dónde está algo en la pantalla es, por definición, no comprobable aquí. Esos
 *   casos van al e2e, con un navegador de verdad.
 *
 * Sin los sustitutos, los tests fallaban en CI —con un `TypeError` dentro de un
 * `MutationObserver`— y pasaban en local, que es la peor forma de fallar.
 */
if (typeof Element !== 'undefined') {
  Element.prototype.getClientRects ??= function getClientRects() {
    return Object.assign([], { item: () => null, length: 0 }) as unknown as DOMRectList;
  };
  Element.prototype.getBoundingClientRect ??= function getBoundingClientRect() {
    return new DOMRect(0, 0, 0, 0);
  };
}

if (typeof document !== 'undefined') {
  document.elementFromPoint ??= () => null;
}
