# Configuración del repositorio

## `branch-protection.json`

Protección de la rama `main`, versionada para que sea auditable y reaplicable. No se
aplica sola: GitHub no lee este fichero. Para aplicarla o restaurarla:

```sh
gh api -X PUT repos/{owner}/{repo}/branches/main/protection \
  --input .github/branch-protection.json
```

Para comprobar que lo aplicado coincide con lo versionado:

```sh
gh api repos/{owner}/{repo}/branches/main/protection
```

`gh` resuelve `{owner}` y `{repo}` desde el remoto, así que los comandos siguen valiendo en
un fork o si el repositorio se renombra.

Qué garantiza cada ajuste (regla de proceso 2 del proyecto). **La tabla cubre las once
claves del fichero**: si se añade una y no aparece aquí, el fichero deja de ser auditable.

| Ajuste                                                | Efecto                                                                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required_status_checks.contexts: ["ci"]`             | Sin el check `ci` en verde no hay merge. `ci` es el job agregador de `ci.yml`, así que cubre todos los demás sin tener que enumerarlos aquí                                                         |
| `required_status_checks.strict: true`                 | La rama debe estar al día con `main` antes de mergear                                                                                                                                               |
| `required_pull_request_reviews` con 0 aprobaciones    | Obliga a pasar por PR. El 0 es forzoso: GitHub no permite aprobar el PR propio y solo hay un mantenedor (ADR-104)                                                                                   |
| `dismiss_stale_reviews: true`                         | **Hoy no hace nada**, porque no se exige ninguna aprobación. Se deja puesto para que, si algún día entra un segundo mantenedor, su aprobación no sobreviva a un push posterior sin haberla revisado |
| `require_last_push_approval: false`                   | Mismo motivo inverso: con un solo mantenedor, exigirlo bloquearía todos los merges                                                                                                                  |
| `required_conversation_resolution: true`              | No se mergea con hilos de revisión abiertos                                                                                                                                                         |
| `enforce_admins: true`                                | Ni el dueño del repositorio puede hacer push directo (ADR-105; la decisión contraria se probó y falló)                                                                                              |
| `allow_force_pushes: false`, `allow_deletions: false` | El historial de `main` no se reescribe ni se borra                                                                                                                                                  |
| `required_linear_history: true`                       | Coherente con el merge por squash, que es la única estrategia habilitada                                                                                                                            |
| `block_creations: false`                              | No se restringe la creación de ramas nuevas; el flujo del proyecto es una rama por issue                                                                                                            |
| `lock_branch: false`                                  | `main` no es de solo lectura; se escribe en ella vía PR                                                                                                                                             |
| `restrictions: null`                                  | Sin lista de personas o equipos autorizados: en un repositorio de un solo mantenedor no aporta nada y da falsa sensación de control                                                                 |
| `allow_fork_syncing: false`                           | Inerte en un repositorio privado sin forks. Explícito para que la ausencia de la clave no se lea como un descuido                                                                                   |

Ajustes del repositorio que **no** están en este fichero porque pertenecen a otro endpoint
de la API (`PATCH /repos/{owner}/{repo}`): solo squash merge habilitado, borrado automático
de la rama al mergear, y auto-merge disponible.

### Deriva entre este fichero y la configuración real

GitHub no aplica este fichero solo, así que un cambio hecho desde la interfaz web dejaría
ambas cosas desincronizadas sin aviso. No se automatiza la comparación, y el motivo es
deliberado: leer `branches/main/protection` exige permisos de administración sobre el
repositorio, que el `GITHUB_TOKEN` por defecto no tiene ni puede tener. Haría falta guardar
un token de admin como secreto de CI — y entonces el secreto que vigila la puerta se
convierte en una llave de la puerta. Se comprueba a mano con el comando de arriba.
