import { describe, expect, it } from 'vitest';
import { mensajeDeSetup } from '@/cms/mensajes-de-setup';

/**
 * Lo que dice `/setup` cuando no crea la cuenta. Antes, un despliegue sin `SETUP_TOKEN` decía
 * «el código no es correcto», y quien lo montaba buscaba un error de tecleo que no existía.
 */
describe('los mensajes de /setup dicen qué falla de verdad', () => {
  it('sin SETUP_TOKEN en el despliegue, lo dice y dice dónde ponerlo', () => {
    const mensaje = mensajeDeSetup('no-disponible');
    expect(mensaje).toContain('SETUP_TOKEN');
    expect(mensaje).toMatch(/vuelve a desplegar/);
    expect(mensaje).not.toBe(mensajeDeSetup('token'));
  });

  it('un código que no coincide sigue siendo «no es correcto»', () => {
    expect(mensajeDeSetup('token')).toBe('El código de instalación no es correcto.');
  });

  it('y la contraseña, lo suyo', () => {
    expect(mensajeDeSetup('password')).toMatch(/12 caracteres/);
  });
});
