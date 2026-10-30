-- El nombre de una etiqueta pasa a ser único por organización y no en toda la base.
-- Con la restricción global, una organización no podía crear una etiqueta que ya
-- existiera en otra (P2002 → 500). La nueva restricción es más laxa que la anterior,
-- así que ningún dato existente la viola.

-- DropIndex
DROP INDEX "tags_nameLower_key";

-- CreateIndex
CREATE UNIQUE INDEX "tags_organizationId_nameLower_key" ON "tags"("organizationId", "nameLower");
