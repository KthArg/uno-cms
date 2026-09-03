import { FlatCompat } from '@eslint/eslintrc';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * Reglas de seguridad propias del proyecto (SPEC §7.1).
 *
 * Se implementan con `no-restricted-syntax` en vez de con un plugin a medida porque el
 * coste de mantener un plugin no se justifica para tres selectores, y porque así el motivo
 * viaja en el propio mensaje de error: quien se choque con la regla lee por qué existe sin
 * salir del editor.
 */
const projectSecurityRules = {
  'no-restricted-syntax': [
    'error',
    {
      // SPEC §7.1 "XSS" + ADR-107 (issue #19). El richtext se renderiza como elementos de
      // React a partir de una allowlist de nodos; nunca se construye una cadena de HTML.
      // Por eso esta prohibición no tiene excepciones: si alguna vez hiciera falta una,
      // que sea con un ADR y un cambio explícito aquí, no con un eslint-disable suelto.
      selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
      message:
        'dangerouslySetInnerHTML está prohibido sin excepciones (SPEC §7.1, ADR-107). ' +
        'El richtext se renderiza como elementos de React desde una allowlist de nodos.',
    },
    {
      // La misma prohibición por la vía de React.createElement, que no pasa por JSX.
      selector: "Property[key.name='dangerouslySetInnerHTML']",
      message:
        'dangerouslySetInnerHTML está prohibido sin excepciones (SPEC §7.1, ADR-107), ' +
        'también fuera de JSX.',
    },
    {
      // SPEC §7.1 "Inyección SQL". ESLint no hace análisis de contaminación, así que no
      // puede distinguir `sql.raw('...')` con una constante de `sql.raw(entradaDelUsuario)`.
      // Prohibirlo entero es la única implementación honesta: una regla que solo detectase
      // el caso obvio daría cobertura aparente sobre el caso peligroso.
      selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
      message:
        'sql.raw está prohibido (SPEC §7.1). Drizzle parametriza con `sql` etiquetado; ' +
        'si de verdad hiciera falta SQL literal, requiere ADR y revisión aparte.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      // Los árboles de trabajo que crean las herramientas de asistencia viven **dentro** del
      // repositorio. Son copias del propio proyecto, así que sin esta línea `pnpm lint` recorre
      // el código dos veces y falla con avisos de ficheros que nadie está editando — con
      // `--max-warnings=0`, basta uno para poner el comando en rojo.
      //
      // Pasó de verdad: con un worktree abierto, `pnpm lint` daba 57 avisos y ni uno era del
      // trabajo en curso. En CI no se ve, porque allí no hay worktrees; se ve en la máquina de
      // quien desarrolla, que es donde más confunde.
      '.claude/**',
    ],
  },

  // Config oficial de Next (Core Web Vitals + reglas de React/hooks). Sigue publicándose
  // en formato eslintrc, de ahí FlatCompat.
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  ...tseslint.configs.recommended,
  security.configs.recommended,

  {
    rules: {
      ...projectSecurityRules,

      // Las variables sin usar se marcan como error salvo prefijo `_`, que es la
      // convención para "esto existe por la firma, no lo necesito".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` desactiva el sistema de tipos justo donde SPEC §2 exige estrictez.
      '@typescript-eslint/no-explicit-any': 'error',

      // eslint-plugin-security es ruidoso con el acceso dinámico a objetos; en un
      // proyecto con `noUncheckedIndexedAccess` el riesgo real que persigue esa regla ya
      // está cubierto por el compilador.
      'security/detect-object-injection': 'off',
    },
  },

  {
    // Los tests que recorren el árbol de ficheros (la frontera `server-only` de #3)
    // construyen rutas a partir de variables; ahí la regla no aporta nada.
    //
    // Lo que NO se desactiva en tests es `no-restricted-syntax`: los fragmentos prohibidos
    // de `eslint-security-rules.test.ts` viven dentro de literales de cadena, así que la
    // regla no los ve. Desactivarla "por si acaso" abriría un agujero justo en el árbol
    // que en M3 contendrá los tests de payloads maliciosos.
    files: ['tests/**/*.ts'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // Debe ir el último: apaga las reglas de estilo que chocan con Prettier.
  prettier
);
