-- ============================================================
--  FITMOD — Migration : Table paiement étendue pour LigdiCash
--  À exécuter si la table paiement existe déjà en v2 basique
-- ============================================================

USE fitmod_db;

-- Étendre la table paiement existante avec les champs LigdiCash
ALTER TABLE paiement
  ADD COLUMN IF NOT EXISTS telephone       VARCHAR(20)     DEFAULT NULL AFTER montant,
  ADD COLUMN IF NOT EXISTS operateur       VARCHAR(50)     DEFAULT NULL AFTER telephone,
  ADD COLUMN IF NOT EXISTS ligdicash_token VARCHAR(512)    DEFAULT NULL AFTER operateur,
  ADD COLUMN IF NOT EXISTS ligdicash_txn_id VARCHAR(100)   DEFAULT NULL AFTER ligdicash_token,
  ADD COLUMN IF NOT EXISTS otp_envoye      TINYINT(1)      NOT NULL DEFAULT 0 AFTER ligdicash_txn_id,
  ADD COLUMN IF NOT EXISTS reponse_json    JSON            DEFAULT NULL AFTER otp_envoye,
  MODIFY COLUMN statut ENUM(
    'en_attente',
    'otp_envoye',
    'valide',
    'echoue',
    'rembourse'
  ) NOT NULL DEFAULT 'en_attente';

-- Si la table n'existe pas encore (schéma from scratch)
-- Utilisez fitmod_bd_v2.sql puis appliquez cette migration

-- Index supplémentaire pour les recherches par token
CREATE INDEX IF NOT EXISTS idx_paiement_token ON paiement(ligdicash_token(50));
CREATE INDEX IF NOT EXISTS idx_paiement_statut ON paiement(statut, date_paiement);
