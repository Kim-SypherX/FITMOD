-- ============================================================
-- FITMOD — Migration Escrow (Paiement par étape)
-- ============================================================
-- Système d'escrow : l'argent est bloqué sur la plateforme
-- et libéré par étapes au tailleur.
-- Commission FITMOD : 15%
-- ============================================================

USE fitmod_db;

-- 1. Ajouter mode_paiement au tailleur
ALTER TABLE tailleur
  ADD COLUMN IF NOT EXISTS mode_paiement 
    ENUM('par_etape', 'apres_livraison') NOT NULL DEFAULT 'par_etape';

-- 2. Ajouter colonnes escrow à paiement
ALTER TABLE paiement 
  ADD COLUMN IF NOT EXISTS montant_bloque DECIMAL(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS montant_libere DECIMAL(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS commission_fitmod DECIMAL(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS montant_tailleur DECIMAL(10,2) DEFAULT 0.00;

-- 3. Colonnes supplémentaires paiement (si manquantes)
ALTER TABLE paiement
  ADD COLUMN IF NOT EXISTS telephone VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS operateur VARCHAR(30) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS otp_envoye TINYINT(1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ligdicash_token VARCHAR(200) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ligdicash_txn_id VARCHAR(200) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reponse_json JSON DEFAULT NULL;

-- 4. Modifier l'ENUM statut paiement pour inclure otp_envoye
-- (MySQL ne supporte pas facilement ALTER ENUM, on va le faire proprement)
ALTER TABLE paiement
  MODIFY COLUMN statut ENUM('en_attente','otp_envoye','valide','echoue','rembourse') 
  NOT NULL DEFAULT 'en_attente';

-- 5. Supprimer tissu_decoupe de l'ENUM commande.statut
ALTER TABLE commande
  MODIFY COLUMN statut ENUM(
    'en_attente_acceptation',
    'acceptee',
    'couture_en_cours',
    'finitions',
    'pret_a_recuperer',
    'livre',
    'annulee'
  ) NOT NULL DEFAULT 'en_attente_acceptation';

-- 6. Nouvelle table VERSEMENT — trace chaque libération de fonds
CREATE TABLE IF NOT EXISTS versement (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  commande_id     INT UNSIGNED    NOT NULL,
  paiement_id     INT UNSIGNED    NOT NULL,
  etape           VARCHAR(50)     NOT NULL,
  pourcentage     DECIMAL(5,2)    NOT NULL,
  montant         DECIMAL(10,2)   NOT NULL,
  cumul_libere    DECIMAL(10,2)   NOT NULL,
  date_versement  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_versement_commande
    FOREIGN KEY (commande_id) REFERENCES commande(id) ON DELETE CASCADE,
  CONSTRAINT fk_versement_paiement
    FOREIGN KEY (paiement_id) REFERENCES paiement(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. Table PREUVE_ETAPE — photos justificatives par étape
CREATE TABLE IF NOT EXISTS preuve_etape (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  commande_id     INT UNSIGNED    NOT NULL,
  etape           VARCHAR(50)     NOT NULL,
  photo_url       VARCHAR(500)    NOT NULL,
  commentaire     TEXT            DEFAULT NULL,
  date_upload     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_preuve_commande
    FOREIGN KEY (commande_id) REFERENCES commande(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. Index
CREATE INDEX IF NOT EXISTS idx_versement_commande ON versement(commande_id);
CREATE INDEX IF NOT EXISTS idx_preuve_commande ON preuve_etape(commande_id);
