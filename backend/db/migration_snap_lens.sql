-- FITMOD — Migration : Ajouter le champ lens_id pour Snap Camera Kit
-- ====================================================================
-- Chaque modèle de vêtement peut avoir une Lens Snap associée
-- pour l'essayage AR en temps réel via Camera Kit.
-- 
-- La Lens est créée dans Lens Studio (https://lensstudio.snapchat.com)
-- et son ID est stocké ici pour permettre le chargement dynamique.
-- ====================================================================

-- Ajouter la colonne lens_id à la table modele
ALTER TABLE modele ADD COLUMN IF NOT EXISTS lens_id VARCHAR(100) DEFAULT NULL;

-- Ajouter un index pour recherche rapide par lens_id
CREATE INDEX IF NOT EXISTS idx_modele_lens_id ON modele(lens_id);

-- Commentaire explicatif
COMMENT ON COLUMN modele.lens_id IS 'ID de la Lens Snap Camera Kit créée dans Lens Studio pour l''essayage AR en temps réel';
