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
