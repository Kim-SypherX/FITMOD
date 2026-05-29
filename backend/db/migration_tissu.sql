-- ============================================================
-- FITMOD — Migration : Gestion du prix tissu
-- ============================================================
-- Ajout de la gestion tissu dans les modèles et commandes
-- Le tailleur peut indiquer s'il fournit le tissu et à quel prix
-- Le client choisit au moment de la commande
-- ============================================================

-- 1. Table modele : ajout tissu_disponible + prix_tissu
ALTER TABLE modele
  ADD COLUMN tissu_disponible TINYINT(1) NOT NULL DEFAULT 0 AFTER prix_base,
  ADD COLUMN prix_tissu DECIMAL(10,2) DEFAULT NULL AFTER tissu_disponible;

-- 2. Table commande : ajout tissu_option (choix du client)
ALTER TABLE commande
  ADD COLUMN tissu_option ENUM('client_fournit', 'tailleur_fournit') NOT NULL DEFAULT 'client_fournit' AFTER couleur;

-- ============================================================
-- Vérification
-- ============================================================
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'modele' AND COLUMN_NAME IN ('tissu_disponible', 'prix_tissu');
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'commande' AND COLUMN_NAME = 'tissu_option';
