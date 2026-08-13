# Tests de normalización — Backend

Suite que cubre el catálogo canónico de roles (`src/constants/roles.ts`) y los validadores
que lo aplican. Es la primera suite automatizada del proyecto: antes no había ninguna.

Contraparte en el frontend: `crm-v2-domotai-frontend/.claude/tests-normalizacion.md`.
Contexto y decisiones de diseño: `docs/NORMALIZACION_ROLES.md` en la raíz del repositorio.

---

## Herramienta

**Vitest 4.1.10.**

| Alternativa | Por qué no |
|---|---|
| Jest + `ts-jest` | Exige configurar transformación de TypeScript y suele chocar con la resolución de módulos. Vitest ejecuta TS con esbuild sin configuración extra. |
| `node:test` | Sin ecosistema de aserciones ni `describe.skipIf`, que el test de paridad necesita. |

Además, el frontend es un proyecto Vite: usar Vitest en ambos lados significa una sola
herramienta, un solo formato de reporte y un solo modelo mental para todo el repositorio.

## Cómo ejecutar

```bash
npm test          # una pasada
npm run test:watch # modo interactivo
```

## Configuración

| Archivo | Nota |
|---|---|
| `vitest.config.mts` | Extensión `.mts` y no `.ts`: este proyecto es CommonJS y Vite avisa al cargar sintaxis ESM en un archivo `.ts`. |
| `tsconfig.json` | `exclude` incluye `src/**/*.test.ts` para que `npm run build` no emita los tests a `dist/`. Verificado: `dist/constants/` sólo contiene `roles.js`. |

La contrapartida de excluirlos es que `npm run typecheck` **no** revisa los archivos de
test. Vitest los ejecuta igual, porque esbuild borra los tipos sin comprobarlos: un error
de tipos en un test no rompe nada, pero tampoco se detecta.

---

## Qué se prueba

Archivo: `src/constants/roles.test.ts` — **31 tests**.

| Bloque | Tests | Cubre |
|---|---:|---|
| `normalizeRole` | 5 | Casing, espacios sobrantes, espacios y guiones → guion bajo, nulos y vacíos, idempotencia |
| `catálogo` | 6 | Contenido de `PROFILE_ROLES` y `ORG_ROLES`, `TEAM_ROLES` como subconjunto, exclusión de `client` y `viewer`, valores por defecto válidos, catálogo ya canónico |
| `predicados` | 8 | `isAdminRole`, `isClientRole`, `isTeamRole`, `isProfileRole`, `isOrgRole` — cada uno con caso positivo, negativo, variantes de casing y nulos |
| `validador de perfil` | 4 | `updateSchema` normaliza `"Admin"`, acepta los cinco roles, rechaza desconocidos, mantiene el campo opcional |
| `validador de organización` | 3 | `addMemberSchema` normaliza, aplica el valor por defecto, rechaza desconocidos |
| `paridad con el frontend` | 5 | Ver abajo |

Los validadores se prueban directamente, sin levantar Express ni tocar la base: sólo
importan `zod` y el catálogo, así que la suite corre en menos de un segundo y no necesita
Postgres.

### Qué se afirma exactamente

El contrato es **tolerante al leer, estricto al escribir**, y los tests lo fijan en los dos
sentidos:

- `updateSchema.parse({ role: 'Admin' })` devuelve `{ role: 'admin' }` — el casing se corrige.
- `updateSchema.safeParse({ role: 'superuser' }).success` es `false` — el conjunto no se negocia.
- `updateSchema.safeParse({ role: 'member' }).success` es `false` — `member` es rol de
  organización, no de perfil. Los dos catálogos no se mezclan.

---

## El test de paridad

El catálogo está duplicado en backend y frontend a propósito: sin monorepo, un paquete
compartido introduce más fricción de la que resuelve. **El riesgo de esa decisión es que
los dos módulos se desincronicen**, y este bloque es la única red que lo impide.

Importa el catálogo del frontend por ruta relativa y compara: mismos roles de perfil,
mismos roles de organización, mismo conjunto de equipo interno, misma salida de
`normalizeRole` sobre ocho entradas, y mismo veredicto de los predicados equivalentes
(`isTeamRole` en el backend, `isTeamMemberRole` en el frontend) sobre nueve entradas.

Si el frontend no está presente —despliegue del backend por separado— el bloque se omite
con `describe.skipIf` en vez de fallar. Conviene saberlo: **en un entorno donde sólo esté
el backend, la paridad no se comprueba**. La ejecución informa de los tests omitidos.

---

## Última ejecución

```
 Test Files  1 passed (1)
      Tests  31 passed (31)
   Duration  604ms
```

Con el frontend presente, el bloque de paridad se ejecuta; no hay tests omitidos.

Estado del resto de comprobaciones tras añadir la suite:

| Comprobación | Resultado |
|---|---|
| `npm test` | 31 pasan |
| `npm run typecheck` | limpio |
| `npm run build` | limpio, y `dist/` no contiene ningún `.test.js` |

## Los tests tienen dientes

Una suite que pasa no demuestra nada si no falla cuando debe. Se verificó introduciendo
una divergencia deliberada en el catálogo del frontend (`VIEWER: 'viewer'` → `'VIEWER'`):

| | Antes | Con la divergencia |
|---|---|---|
| Backend | 31 pasan | **1 falla** — `paridad › declara exactamente los mismos roles de perfil` |
| Frontend | 22 pasan | **4 fallan** |

La divergencia se revirtió y ambas suites volvieron a verde. Conviene repetir este
ejercicio al tocar el catálogo: si se cambia y ningún test se entera, el test sobra.

---

## Qué no cubre

- **La base de datos.** No se ejecuta ninguna consulta. Que no haya roles fuera del
  catálogo en `profiles` y `organization_members` sigue sin verificarse; las consultas
  están en `docs/NORMALIZACION_ROLES.md`.
- **Los consumidores.** Se prueba el catálogo y los validadores, no que cada controlador
  o pantalla lo use. Que `requireAdmin` llame a `isAdminRole` está verificado por lectura,
  no por test — haría falta un test de integración con Express.
- **El resto de catálogos** (estados y prioridades de tarea, etapas de lead, permisos).
  Siguen sin normalizar y sin tests.

## Cómo extender

Cuando le toque a P1 —estados y prioridades de tarea—, el molde ya está: un módulo en
`src/constants/`, su `*.test.ts` al lado con los mismos seis bloques, y el bloque de
paridad copiado. Dos candidatos inmediatos:

- `COMPLETED_STATES` en `src/repositories/capacity.repository.ts`, marcado con `TODO(P1)`:
  es el mismo defecto en la columna de estado.
- `isInvertedDateRange` en `src/validators/project.validator.ts`: la validación de rangos
  de fechas de fases y tareas se verificó una sola vez con un script desechable. Pasarla a
  esta suite es barato y no depende de ninguna decisión pendiente.
