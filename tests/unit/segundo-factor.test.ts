import { describe, expect, it } from 'vitest';
import {
  cifrarSecreto,
  codigoTotp,
  descifrarSecreto,
  generarCodigosDeRecuperacion,
  generarSecreto,
  huellaDeRecuperacion,
  pareceDeRecuperacion,
  pasoDe,
  uriOtpauth,
  verificarTotp,
} from '@/cms/segundo-factor';

/** T-V-1 a T-V-3: las piezas puras de la verificación en dos pasos (spec 20). */

/** El secreto de los vectores de RFC 6238 para SHA-1: «12345678901234567890» en ASCII. */
const SECRETO_DEL_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

const APP_SECRET = 'un-app-secret-de-pruebas-con-mas-de-treinta-y-dos';

describe('T-V-1 — TOTP como lo define RFC 6238', () => {
  // Los vectores del apéndice B del RFC son de ocho cifras; los de seis son sus seis últimas.
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ])('en el segundo %i, %s', (segundos, esperado) => {
    expect(codigoTotp(SECRETO_DEL_RFC, new Date(segundos * 1000))).toBe(esperado);
  });

  it('acepta el paso anterior y el siguiente, por un reloj algo desfasado, y ninguno más', () => {
    const ahora = new Date(1_700_000_000_000);
    const secreto = generarSecreto();
    const en = (pasos: number) => codigoTotp(secreto, new Date(ahora.getTime() + pasos * 30_000));

    expect(verificarTotp(secreto, en(0), ahora)).toBe(pasoDe(ahora));
    expect(verificarTotp(secreto, en(-1), ahora)).toBe(pasoDe(ahora) - 1);
    expect(verificarTotp(secreto, en(1), ahora)).toBe(pasoDe(ahora) + 1);
    expect(verificarTotp(secreto, en(-2), ahora)).toBeNull();
    expect(verificarTotp(secreto, en(2), ahora)).toBeNull();
  });

  it('rechaza lo que no son seis cifras', () => {
    const secreto = generarSecreto();
    for (const malo of ['', '12345', '1234567', 'abcdef', '12 34 5']) {
      expect(verificarTotp(secreto, malo), malo).toBeNull();
    }
  });

  it('un secreto nuevo es base32 de 160 bits, y el enlace lo lleva dentro', () => {
    const secreto = generarSecreto();
    expect(secreto).toMatch(/^[A-Z2-7]{32}$/);
    const uri = uriOtpauth(secreto, 'ana@ejemplo.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\/UnoCMS%3Aana%40ejemplo\.com\?/);
    expect(new URL(uri).searchParams.get('secret')).toBe(secreto);
  });
});

describe('T-V-2 — el secreto se guarda cifrado, y falla en vez de devolver basura', () => {
  it('cifrar y descifrar lo devuelve igual, y no aparece en claro', () => {
    const secreto = generarSecreto();
    const guardado = cifrarSecreto(secreto, APP_SECRET);

    expect(guardado).not.toContain(secreto);
    expect(guardado.startsWith('v1.')).toBe(true);
    expect(descifrarSecreto(guardado, APP_SECRET)).toBe(secreto);
  });

  it('dos cifrados del mismo secreto son distintos: el IV es nuevo cada vez', () => {
    const secreto = generarSecreto();
    expect(cifrarSecreto(secreto, APP_SECRET)).not.toBe(cifrarSecreto(secreto, APP_SECRET));
  });

  it('con otro APP_SECRET, lanza', () => {
    const guardado = cifrarSecreto(generarSecreto(), APP_SECRET);
    expect(() => descifrarSecreto(guardado, `${APP_SECRET}-otro`)).toThrow();
  });

  it('con un byte cambiado, lanza', () => {
    const [v, iv, etiqueta, cifrado] = cifrarSecreto(generarSecreto(), APP_SECRET).split('.');
    const tocado = Buffer.from(cifrado!, 'base64url');
    tocado[0] = tocado[0]! ^ 1;
    expect(() =>
      descifrarSecreto([v, iv, etiqueta, tocado.toString('base64url')].join('.'), APP_SECRET)
    ).toThrow();
  });

  it('con un APP_SECRET corto, no cifra', () => {
    expect(() => cifrarSecreto(generarSecreto(), 'corto')).toThrow(/APP_SECRET/);
  });
});

describe('T-V-3 — los códigos de recuperación', () => {
  it('diez, distintos, con forma XXXXX-XXXXX y sin caracteres que se confundan', () => {
    const codigos = generarCodigosDeRecuperacion();
    expect(codigos).toHaveLength(10);
    expect(new Set(codigos).size).toBe(10);
    for (const codigo of codigos) {
      expect(codigo).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
      expect(pareceDeRecuperacion(codigo)).toBe(true);
    }
  });

  it('la huella no depende de mayúsculas ni del guion, y un código de la app no lo parece', () => {
    expect(huellaDeRecuperacion('ABCDE-FGHJK')).toBe(huellaDeRecuperacion('abcdefghjk'));
    expect(huellaDeRecuperacion('ABCDE-FGHJK')).not.toBe(huellaDeRecuperacion('ABCDE-FGHJM'));
    expect(pareceDeRecuperacion('123456')).toBe(false);
  });
});
