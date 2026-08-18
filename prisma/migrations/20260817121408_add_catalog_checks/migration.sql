-- Catálogos como restricción de base, no sólo de código.
-- Todas las columnas son nullable, de ahí el `IS NULL OR`: sin eso, un NULL
-- hace que la condición evalúe a NULL y Postgres la da por buena, que es
-- justo el agujero por el que se coló la deriva.

ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IS NULL OR status IN ('NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETED','ARCHIVED'));

ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_status_check
  CHECK (status IS NULL OR status IN ('TODO','IN_PROGRESS','ON_HOLD','COMPLETED'));

ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_priority_check
  CHECK (priority IS NULL OR priority IN ('LOW','MEDIUM','HIGH','URGENT'));

ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IS NULL OR status IN ('TODO','IN_PROGRESS','ON_HOLD','COMPLETED'));

ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IS NULL OR priority IN ('LOW','MEDIUM','HIGH','URGENT'));

ALTER TABLE project_phases ADD CONSTRAINT project_phases_status_check
  CHECK (status IS NULL OR status IN ('active','completed','on_hold'));

ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('DRAFT','SENT','PAID','OVERDUE','CANCELLED'));

-- CSV en minúscula: el vocabulario real del portal.
ALTER TABLE project_shares ADD CONSTRAINT project_shares_permissions_check
  CHECK (permissions ~ '^(view|comment|create_task|edit_task)(,(view|comment|create_task|edit_task))*$');

-- No se puede exigir por CHECK que la etapa exista en el pipeline del lead:
-- eso es una condición entre dos tablas y requeriría un trigger o una FK
-- compuesta. Lo que sí se exige es el formato slug, que es lo que separaba
-- 'Negociación' de 'negociacion'. La pertenencia al pipeline la valida
-- `validateStage` en lead.controller.ts.
ALTER TABLE leads ADD CONSTRAINT leads_stage_slug_check
  CHECK (stage IS NULL OR stage ~ '^[a-z0-9_]+$');

-- Mismo criterio para el historial, que guardaba las mismas etiquetas.
ALTER TABLE lead_stage_history ADD CONSTRAINT lead_stage_history_slug_check
  CHECK (stage ~ '^[a-z0-9_]+$');
