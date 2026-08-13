# Seguridad

> **Estado: esqueleto.** El modelo de amenazas completo, con evidencia ítem por ítem de la
> tabla de `SPEC.md` §7.1, se escribe en **M6** (issue de revisión de seguridad
> transversal). Lo que hay aquí es el canal de reporte, que sí tiene que existir desde el
> primer día, y el índice de lo que vendrá.

## Reportar una vulnerabilidad

**No abras un issue público.** Usa el aviso de seguridad privado de GitHub:

<https://github.com/KthArg/uno-cms/security/advisories/new>

Incluye, en la medida de lo posible: versión o commit afectado, pasos para reproducirlo,
qué consigue un atacante con ello, y si ya está siendo explotado.

> **Si has llegado aquí desde un fork, esa URL no es la tuya.** UnoCMS se despliega
> haciendo fork del repositorio (`SPEC.md` §9), y GitHub no reescribe las URL de este
> fichero al copiarlo. Un fallo en **tu** despliegue —una mala configuración, un secreto
> filtrado, contenido de tus usuarios— se reporta en **tu** repositorio:
> `https://github.com/<tu-usuario>/<tu-repo>/security/advisories/new`. Aquí solo tienen
> sentido los fallos del código de UnoCMS, que afectan a todo el que lo haya desplegado.

Al ser un proyecto mantenido por una sola persona, no hay compromiso de tiempo de
respuesta. Se responderá tan pronto como sea posible. Decirlo así es más útil que prometer
72 horas y no cumplirlas.

## Alcance

UnoCMS se despliega **auto-hospedado**: cada instalación es de quien la despliega. No hay
un servicio central que comprometer. Un fallo aquí afecta a quien haya desplegado el
código, no a una infraestructura compartida.

Entra en alcance todo lo del repositorio. Queda fuera lo que aporta la infraestructura de
quien despliega (Vercel, Neon, Vercel Blob) y las malas configuraciones del propio
despliegue, salvo que la culpa sea de un valor por defecto inseguro del proyecto — en cuyo
caso sí es un fallo nuestro.

## Índice de lo que se documenta en M6

1. Modelo de amenazas: la tabla de `SPEC.md` §7.1, ítem por ítem, con **evidencia** de la
   mitigación (fichero, línea y test que la cubre) y con lo que quede sin cubrir dicho sin
   maquillar.
2. Cabeceras y CSP en producción (`SPEC.md` §7.2), con la comprobación de que están activas.
3. Bootstrap seguro y ciclo de vida del `SETUP_TOKEN` (`SPEC.md` §7.3).
4. Gestión de secretos y qué pasa si se filtra cada uno (`SPEC.md` §7.4).
5. Decisiones de seguridad tomadas y sus brechas residuales, enlazadas a los ADR.
6. **Anclado de las acciones de GitHub por SHA.** Hoy el workflow las referencia por
   etiqueta (`actions/checkout@v7`), que es mutable: si el repositorio de una acción se
   compromete, esa etiqueta pasa a ejecutar otra cosa en el runner —con el checkout del
   repositorio delante y con red— sin que ningún diff nuestro cambie. En M0 se decidió no
   anclar porque las cuatro acciones son oficiales de GitHub y el workflow corre con
   `permissions: contents: read`, pero es una decisión que M6 debe **revisar en firme**, no
   heredar. Contexto en el PR #35.
7. **Ejecución de scripts de instalación en CI.** `pnpm install` ejecuta los scripts de
   `sharp` y `esbuild` antes de que corra ningún test. En #23 se acotó a los jobs que los
   necesitan (`--ignore-scripts` en los otros tres). Queda por decidir si se puede reducir
   más.

## Lo que ya está en pie (M0)

No es el modelo de amenazas; son las barreras de proceso que lo sostendrán:

- `main` protegida: sin PR con el check `ci` en verde no se escribe, ni siquiera siendo
  dueño del repositorio (ADR-105, verificado).
- ESLint prohíbe `dangerouslySetInnerHTML` sin excepciones (ADR-107) y `sql.raw`, con tests
  que comprueban que las reglas **fallan** cuando deben.
- Frontera `server-only` sobre `cms/{core,db,auth,security}`, en dos capas: un test estático
  sobre las cabeceras y el error de compilación de `server-only`, este último demostrado
  con una fuga deliberada.
- `pnpm audit --audit-level=high` bloqueante en CI, hoy limpio.
- Dependabot semanal para npm y para las acciones de GitHub.
