import { describe, expect, it } from 'vitest';
import { scrubMeta, truncateIp } from '@/cms/security/audit';

/**
 * T-58-3 y T-58-4, en su parte pura: truncado de IP y limpieza de metadatos.
 *
 * Van en un test unitario y no de integración porque no tocan la base de datos, y porque
 * son las dos funciones que conviene poder ejercitar con muchos casos y sin coste.
 */

describe('T-58-4 — los metadatos nunca guardan secretos', () => {
  it.each([
    'password',
    'Password',
    'PASSWORD',
    'newPassword',
    'passwordConfirm',
    'contrasena',
    'contraseña',
    'clave',
    'token',
    'setupToken',
    'secret',
    'authorization',
    'cookie',
    'passwordHash',
    'apiKey',
    'api_key',
    'credential',
  ])('redacta la clave %s', (key) => {
    expect(scrubMeta({ [key]: 'valor-secreto' })).toEqual({ [key]: '[redactado]' });
  });

  it('redacta en profundidad, no solo en el primer nivel', () => {
    // El error típico no es pasar `{ password }`: es pasar el cuerpo entero de la petición
    // y que la contraseña vaya tres niveles más abajo.
    const scrubbed = scrubMeta({
      request: { body: { form: { email: 'a@b.com', password: 'hunter2' } } },
    });

    expect(scrubbed).toEqual({
      request: { body: { form: { email: 'a@b.com', password: '[redactado]' } } },
    });
  });

  it('una clave sensible redacta el subárbol entero, no solo su hoja', () => {
    // `credentials` contiene "credential", así que se redacta el objeto completo y se
    // pierde el correo que había dentro. Es deliberado y es la política declarada en el
    // módulo: redactar de más cuesta un dato de depuración, redactar de menos cuesta una
    // contraseña en texto plano en la base de datos.
    //
    // Este test existe porque el comportamiento sorprende —lo descubrí escribiendo el test
    // anterior, que fallaba por esto— y sin fijarlo alguien lo tomaría por un fallo y lo
    // "arreglaría" restringiendo la coincidencia.
    expect(scrubMeta({ credentials: { email: 'a@b.com', password: 'hunter2' } })).toEqual({
      credentials: '[redactado]',
    });
  });

  it('redacta dentro de arrays', () => {
    expect(scrubMeta([{ token: 'abc' }, { ok: 1 }])).toEqual([{ token: '[redactado]' }, { ok: 1 }]);
  });

  it('conserva lo que no es sensible', () => {
    expect(scrubMeta({ email: 'a@b.com', intentos: 3, ok: false })).toEqual({
      email: 'a@b.com',
      intentos: 3,
      ok: false,
    });
  });

  it('acota la profundidad', () => {
    // Un objeto absurdamente anidado convertiría la auditoría en una forma de tumbar el
    // proceso desde fuera.
    let deep: Record<string, unknown> = { fin: 1 };
    for (let i = 0; i < 50; i += 1) deep = { nivel: deep };

    expect(() => scrubMeta(deep)).not.toThrow();
    expect(JSON.stringify(scrubMeta(deep))).toContain('demasiado anidado');
  });

  it('recorta las cadenas largas', () => {
    // Un metadato de un megabyte es una forma barata de llenar la base de datos escribiendo
    // en un formulario.
    const largo = scrubMeta('x'.repeat(5000));
    expect(String(largo).length).toBeLessThan(600);
    expect(String(largo)).toContain('recortado');
  });

  it('acota el tamaño de los arrays', () => {
    expect((scrubMeta(Array<number>(1000).fill(1)) as unknown[]).length).toBe(100);
  });
});

describe('T-58-3 — la IP se trunca', () => {
  it.each([
    ['192.168.1.37', '192.168.1.0'],
    ['8.8.8.8', '8.8.8.0'],
    ['203.0.113.255', '203.0.113.0'],
    ['::ffff:192.168.1.37', '192.168.1.0'],
  ])('IPv4 %s al /24 → %s', (input, expected) => {
    expect(truncateIp(input)).toBe(expected);
  });

  it.each([
    ['2001:0db8:85a3:0000:8a2e:0370:7334:1234', '2001:0db8:85a3:0000::'],
    ['2001:db8:85a3:1:2:3:4:5', '2001:db8:85a3:1::'],
    ['2001:db8::1', '2001:db8:0:0::'],
    ['::1', '0:0:0:0::'],
  ])('IPv6 %s al /64 → %s', (input, expected) => {
    expect(truncateIp(input)).toBe(expected);
  });

  it('la dirección abreviada se expande antes de cortar', () => {
    // Cortar por los cuatro primeros grupos de `2001:db8::1` sin expandir daría
    // `2001:db8:` y perdería el sentido del prefijo.
    expect(truncateIp('2001:db8::1')).toBe('2001:db8:0:0::');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['cadena vacía', ''],
    ['texto', 'no-es-una-ip'],
    ['IPv4 fuera de rango', '999.1.1.1'],
    ['IPv4 incompleta', '192.168.1'],
    ['IPv6 con dos dobles dos puntos', '2001::db8::1'],
    ['IPv6 con grupo inválido', '2001:zzzz::1'],
    ['número', 12345],
  ])('devuelve undefined ante %s', (_caso, value) => {
    // Si no se sabe truncar, no se sabe que no identifique a nadie: se descarta en vez de
    // guardarse tal cual.
    expect(truncateIp(value)).toBeUndefined();
  });

  it('nunca devuelve la dirección original', () => {
    for (const ip of ['192.168.1.37', '8.8.8.8', '2001:db8:85a3:1:2:3:4:5']) {
      expect(truncateIp(ip)).not.toBe(ip);
    }
  });
});
