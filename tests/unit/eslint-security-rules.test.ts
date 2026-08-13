import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * T-04-1 y T-04-2 del spec de fase: las reglas de seguridad de SPEC §7.1 tienen que
 * **fallar** ante el código que prohíben.
 *
 * Los fragmentos se pasan por `lintText` con una ruta que no existe en disco. Así el
 * fixture nunca queda suelto en el repositorio —donde rompería `pnpm lint`— pero ESLint
 * resuelve la configuración exactamente igual que lo haría para un fichero real en esa
 * ubicación. Un fixture en disco y excluido del lint no probaría lo mismo: probaría la
 * exclusión.
 */

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function ruleIdsFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? '(fatal)');
}

describe('SPEC §7.1 — XSS: dangerouslySetInnerHTML', () => {
  it('es error en un componente de la landing', async () => {
    const rules = await ruleIdsFor(
      `export function Bad({ html }: { html: string }) {
         return <div dangerouslySetInnerHTML={{ __html: html }} />;
       }`,
      'components/site/Bad.tsx'
    );

    expect(rules).toContain('no-restricted-syntax');
  });

  it('es error también en cms/preview, donde vive RichText (ADR-107: sin allowlist)', async () => {
    const rules = await ruleIdsFor(
      `export function RichText({ html }: { html: string }) {
         return <div dangerouslySetInnerHTML={{ __html: html }} />;
       }`,
      'cms/preview/RichText.tsx'
    );

    expect(rules).toContain('no-restricted-syntax');
  });

  it('es error por la vía de createElement, que no pasa por JSX', async () => {
    const rules = await ruleIdsFor(
      `import { createElement } from 'react';
       export const Bad = (html: string) =>
         createElement('div', { dangerouslySetInnerHTML: { __html: html } });`,
      'components/site/Sneaky.tsx'
    );

    expect(rules).toContain('no-restricted-syntax');
  });

  it('no molesta al código que renderiza texto de forma segura', async () => {
    const rules = await ruleIdsFor(
      `export function Good({ text }: { text: string }) {
         return <p>{text}</p>;
       }`,
      'components/site/Good.tsx'
    );

    expect(rules).not.toContain('no-restricted-syntax');
  });
});

describe('SPEC §7.1 — Inyección SQL: sql.raw', () => {
  it('es error con input de usuario', async () => {
    const rules = await ruleIdsFor(
      `import { sql } from 'drizzle-orm';
       export const q = (input: string) => sql.raw(input);`,
      'cms/db/queries.ts'
    );

    expect(rules).toContain('no-restricted-syntax');
  });

  it('es error también con una constante: ESLint no distingue el origen del dato', async () => {
    // Si esto pasara, la regla estaría dando cobertura aparente: quien la lea creería que
    // detecta el caso peligroso, y solo detectaría el evidente.
    const rules = await ruleIdsFor(
      `import { sql } from 'drizzle-orm';
       export const q = () => sql.raw('select 1');`,
      'cms/db/queries.ts'
    );

    expect(rules).toContain('no-restricted-syntax');
  });

  it('no molesta al SQL etiquetado, que sí parametriza', async () => {
    const rules = await ruleIdsFor(
      `import { sql } from 'drizzle-orm';
       export const q = (id: string) => sql\`select * from users where id = \${id}\`;`,
      'cms/db/queries.ts'
    );

    expect(rules).not.toContain('no-restricted-syntax');
  });
});

describe('estrictez de tipos', () => {
  it('any explícito es error (SPEC §2)', async () => {
    const rules = await ruleIdsFor(
      `export const parse = (input: any) => input;`,
      'cms/core/parse.ts'
    );

    expect(rules).toContain('@typescript-eslint/no-explicit-any');
  });
});
