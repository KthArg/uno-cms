import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, classify, listProtectedModules } from '../support/module-boundary';

/**
 * Issue #46: la exención `// isomorphic:` se comprueba al escribirla y después es
 * permanente. Nada garantizaba que el fichero exento **siguiera** cumpliendo su motivo.
 *
 * El motivo de la única exención actual (`cms/core/types.ts`) es que solo contiene
 * declaraciones de tipo y no emite ni una línea de JavaScript. Si alguien le añade una
 * constante, el comentario sigue ahí, el test de la frontera sigue verde, y un módulo con
 * código de ejecución queda fuera de la frontera de SPEC §7.1 **con permiso escrito**.
 *
 * Así es como se pudren las fronteras: no quitándolas, sino dejando exenciones que
 * sobreviven al motivo que las justificaba.
 *
 * El riesgo creció con el PR #45: los tests unitarios aliasan `server-only` a un stub, así
 * que ya no distinguen un módulo protegido de uno que no lo está. Toda la defensa estática
 * recae en el test de cabeceras y en este.
 */

/**
 * Si la salida corresponde a un módulo que solo declara tipos.
 *
 * Sin expresión regular: la primera versión usaba `/^\s*(export\s*\{\s*\}\s*;?)?\s*$/`
 * y `eslint-plugin-security` la marcó como vulnerable a retroceso exponencial. Tenía razón
 * —cuantificadores anidados alrededor de un grupo opcional—, y no hay motivo para correr ese
 * riesgo cuando normalizar y comparar es más claro.
 */
function isEmptyModuleOutput(output: string): boolean {
  const normalized = output.replace(/\s+/g, '');
  return normalized === '' || normalized === 'export{}' || normalized === 'export{};';
}

function emittedJavaScript(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
}

describe('issue #46 — una exención `// isomorphic:` obliga a no emitir JavaScript', () => {
  const exempt = listProtectedModules().filter(
    (file) => classify(readFileSync(file, 'utf8')) === 'isomorfo'
  );

  it('hay al menos una exención, o este test no está probando nada', () => {
    // Si algún día no queda ninguna, este test pasaría en vacío y habría que borrarlo en
    // vez de dejarlo dando una sensación de cobertura que no existe.
    expect(exempt.length).toBeGreaterThan(0);
  });

  it.each(exempt.map((file) => relative(REPO_ROOT, file).replace(/\\/g, '/')))(
    '%s no emite código',
    (relativePath) => {
      const output = emittedJavaScript(readFileSync(`${REPO_ROOT}/${relativePath}`, 'utf8'));

      expect(
        isEmptyModuleOutput(output),
        `${relativePath} emite JavaScript, así que no puede estar exento. Salida: ${JSON.stringify(output)}`
      ).toBe(true);
    }
  );

  it('detecta un fichero exento que sí emite código', () => {
    // Verificación del propio test: sin este caso, un fallo en la comparación o en la
    // transpilación daría verde para siempre y nadie se enteraría.
    const conCodigo = `// isomorphic: solo tipos, dice él\nexport const TABLA = 'users';\n`;
    expect(isEmptyModuleOutput(emittedJavaScript(conCodigo))).toBe(false);

    const soloTipos = `// isomorphic: de verdad\nexport type A = { b: string };\n`;
    expect(isEmptyModuleOutput(emittedJavaScript(soloTipos))).toBe(true);
  });
});
