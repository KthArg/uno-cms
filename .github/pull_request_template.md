## Qué

<!-- Qué entrega este PR, en dos o tres frases. -->

## Por qué

<!-- Las decisiones que no se deducen del diff: por qué así y no de la otra forma, qué
alternativas se descartaron y a cambio de qué. Si el PR solo hace lo obvio, dilo y pasa. -->

## Cómo probarlo

<!-- Comandos exactos y qué debe observarse. Si el issue tenía casos de prueba en su
criterio de aceptación (o el spec de fase en docs/specs/), una fila por caso con el
resultado y CÓMO se comprobó. "Verificado" sin decir con qué no cuenta. -->

| Caso | Resultado | Cómo se comprobó |
| ---- | --------- | ---------------- |
|      |           |                  |

## Checklist de seguridad (SPEC §7.1)

Marcar `[x]` lo aplicable, `[n/a]` lo que no aplica **con motivo**. Un `[n/a]` sin motivo
es una amenaza que no se ha mirado.

> **Excepción, y es la única:** si el PR no añade ni modifica código ejecutable
> (documentación, plantillas, configuración de CI), sustituye la lista entera por una línea
> que lo declare y lo justifique. Marcar nueve `[n/a]` con el mismo motivo copiado nueve
> veces no produce rigor, produce el ritual vacío que este checklist existe para evitar.

- [ ] **XSS** — todo texto de usuario se escapa; nada de `dangerouslySetInnerHTML`
      (ADR-107); los campos `link` validan protocolo y bloquean `javascript:`.
- [ ] **Inyección SQL** — Drizzle parametriza; sin `sql.raw`.
- [ ] **CSRF** — las mutaciones verifican origen; cookies `SameSite=Lax`.
- [ ] **Sesión y roles** — cada mutación exige sesión y comprueba el rol **en el servidor**,
      no solo en la interfaz.
- [ ] **Secretos en cliente** — nada de `cms/{core,db,auth,security}` alcanzable desde el
      grafo de cliente; `pnpm build` lo confirma.
- [ ] **Enumeración** — los errores no revelan si un recurso o una cuenta existen.
- [ ] **Uploads** — allowlist de MIME, límite de tamaño, SVG rechazado.
- [ ] **Sin secretos en el diff** — ni claves, ni tokens, ni URLs internas, ni `.env`.
- [ ] **Dependencias** — las nuevas están en el stack de SPEC §2 o tienen ADR; `pnpm audit`
      sigue limpio.

## Screenshots

<!-- Solo si hay interfaz. Antes y después si es un cambio sobre algo existente. -->

## Riesgos conocidos

<!-- Lo que este PR NO cierra: lo frágil, lo verificado solo a mano, lo que se pospone y a
qué issue. Un PR sin riesgos conocidos es un PR que no se ha mirado con suficiente
desconfianza. -->

Closes #
