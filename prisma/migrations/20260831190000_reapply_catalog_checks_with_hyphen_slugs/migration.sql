-- Reaplica los CHECK de catálogo admitiendo guiones en los slugs de etapa.
--
-- El pipeline real de producción usa slugs con guión ('first-meeting') y el CHECK
-- original ('^[a-z0-9_]+$') lo rechazaba, así que esa migración nunca pudo aplicarse
-- allí: quedó registrada con `migrate resolve --applied` sin ejecutarse. Esta la
-- sustituye recreando TODAS las restricciones de forma idempotente — en entornos
-- donde la estricta sí corrió, el DROP la reemplaza; donde no, aquí nacen.
--
-- Un guión no reabre el agujero que el CHECK cierra: sigue siendo formato slug
-- (minúsculas, sin espacios ni acentos), que es lo que separaba 'Negociación'
-- de 'negociacion'.

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IS NULL OR status IN ('NOT_STARTED','IN_PROGRESS','ON_HOLD','COMPLETED','ARCHIVED'));

ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_status_check;
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_status_check
  CHECK (status IS NULL OR status IN ('TODO','IN_PROGRESS','ON_HOLD','COMPLETED'));

ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_priority_check;
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_priority_check
  CHECK (priority IS NULL OR priority IN ('LOW','MEDIUM','HIGH','URGENT'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IS NULL OR status IN ('TODO','IN_PROGRESS','ON_HOLD','COMPLETED'));

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IS NULL OR priority IN ('LOW','MEDIUM','HIGH','URGENT'));

ALTER TABLE project_phases DROP CONSTRAINT IF EXISTS project_phases_status_check;
ALTER TABLE project_phases ADD CONSTRAINT project_phases_status_check
  CHECK (status IS NULL OR status IN ('active','completed','on_hold'));

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('DRAFT','SENT','PAID','OVERDUE','CANCELLED'));

ALTER TABLE project_shares DROP CONSTRAINT IF EXISTS project_shares_permissions_check;
ALTER TABLE project_shares ADD CONSTRAINT project_shares_permissions_check
  CHECK (permissions ~ '^(view|comment|create_task|edit_task)(,(view|comment|create_task|edit_task))*$');

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_stage_slug_check;
ALTER TABLE leads ADD CONSTRAINT leads_stage_slug_check
  CHECK (stage IS NULL OR stage ~ '^[a-z0-9_-]+$');

ALTER TABLE lead_stage_history DROP CONSTRAINT IF EXISTS lead_stage_history_slug_check;
ALTER TABLE lead_stage_history ADD CONSTRAINT lead_stage_history_slug_check
  CHECK (stage ~ '^[a-z0-9_-]+$');
