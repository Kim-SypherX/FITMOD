-- ============================================================
--  FITMOD — Base de Données v1
--  Plateforme Web Tailleur-Client (Burkina Faso)
--  Auteur : YARGA Yempounti Kim Josaphat Geoffroi
--  Stack  : MySQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS fitmod_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE fitmod_db;

-- ============================================================
-- 1. UTILISATEUR (table centrale)
-- ============================================================
CREATE TABLE utilisateur (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  nom             VARCHAR(80)     NOT NULL,
  prenom          VARCHAR(80)     NOT NULL,
  email           VARCHAR(150)    NOT NULL UNIQUE,
  mot_de_passe    VARCHAR(255)    NOT NULL,          -- hash bcrypt
  telephone       VARCHAR(20)     DEFAULT NULL,
  ville           VARCHAR(80)     DEFAULT NULL,
  type_compte     ENUM('client','tailleur','admin') NOT NULL DEFAULT 'client',
  date_inscription DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actif           TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ============================================================
-- 2. TAILLEUR (profil étendu)
-- ============================================================
CREATE TABLE tailleur (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  utilisateur_id  INT UNSIGNED    NOT NULL UNIQUE,
  nom_atelier     VARCHAR(150)    NOT NULL,
  adresse         VARCHAR(255)    DEFAULT NULL,
  quartier        VARCHAR(100)    DEFAULT NULL,
  specialites     VARCHAR(255)    DEFAULT NULL,      -- ex: "boubou,robe,costume"
  tarif_min       DECIMAL(10,2)   DEFAULT 0.00,
  delai_moyen     INT UNSIGNED    DEFAULT NULL,      -- en jours
  note_moyenne    DECIMAL(3,2)    DEFAULT 0.00,
  statut          ENUM('actif','en_conge','suspendu') NOT NULL DEFAULT 'actif',
  valide_admin    TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_tailleur_utilisateur
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 3. CLIENT (profil étendu + mesures)
-- ============================================================
CREATE TABLE client (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  utilisateur_id  INT UNSIGNED    NOT NULL UNIQUE,
  -- Mesures corporelles (JSON ou colonnes séparées)
  poitrine        DECIMAL(5,1)    DEFAULT NULL,      -- cm
  taille          DECIMAL(5,1)    DEFAULT NULL,      -- cm
  hanches         DECIMAL(5,1)    DEFAULT NULL,      -- cm
  longueur_dos    DECIMAL(5,1)    DEFAULT NULL,      -- cm
  longueur_bras   DECIMAL(5,1)    DEFAULT NULL,      -- cm
  entrejambe      DECIMAL(5,1)    DEFAULT NULL,      -- cm
  taille_reelle   DECIMAL(5,1)    DEFAULT NULL,      -- taille en cm (calibrage IA)
  mesures_json    JSON            DEFAULT NULL,      -- données brutes MediaPipe
  PRIMARY KEY (id),
  CONSTRAINT fk_client_utilisateur
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 4. MODELE (catalogue du tailleur)
-- ============================================================
CREATE TABLE modele (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  tailleur_id         INT UNSIGNED    NOT NULL,
  titre               VARCHAR(150)    NOT NULL,
  description         TEXT            DEFAULT NULL,
  type_tenue          VARCHAR(80)     DEFAULT NULL,  -- ex: boubou, robe, costume
  photo_url           VARCHAR(500)    DEFAULT NULL,
  modele_3d_url       VARCHAR(500)    DEFAULT NULL,  -- fichier Three.js / GLTF
  prix_base           DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  delai_confection    INT UNSIGNED    DEFAULT NULL,  -- en jours
  couleurs_disponibles JSON           DEFAULT NULL,  -- ["rouge","blanc","bleu"]
  date_creation       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actif               TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT fk_modele_tailleur
    FOREIGN KEY (tailleur_id) REFERENCES tailleur(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 5. COMMANDE
-- ============================================================
CREATE TABLE commande (
  id                      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  client_id               INT UNSIGNED    NOT NULL,
  tailleur_id             INT UNSIGNED    NOT NULL,
  modele_id               INT UNSIGNED    NOT NULL,
  mesures_utilisees       JSON            NOT NULL,  -- snapshot mesures au moment de la commande
  tissu_choisi            VARCHAR(100)    DEFAULT NULL,
  couleur                 VARCHAR(50)     DEFAULT NULL,
  prix_total              DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  statut                  ENUM(
                            'en_attente_acceptation',
                            'acceptee',
                            'tissu_decoupe',
                            'couture_en_cours',
                            'finitions',
                            'pret_a_recuperer',
                            'livre',
                            'annulee'
                          ) NOT NULL DEFAULT 'en_attente_acceptation',
  date_commande           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_livraison_souhaitee DATE           DEFAULT NULL,
  date_livraison_reelle   DATE            DEFAULT NULL,
  notes_client            TEXT            DEFAULT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_commande_client
    FOREIGN KEY (client_id) REFERENCES client(id),
  CONSTRAINT fk_commande_tailleur
    FOREIGN KEY (tailleur_id) REFERENCES tailleur(id),
  CONSTRAINT fk_commande_modele
    FOREIGN KEY (modele_id) REFERENCES modele(id)
) ENGINE=InnoDB;

-- ============================================================
-- 6. HISTORIQUE STATUT COMMANDE
-- ============================================================
CREATE TABLE statut_commande (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  commande_id     INT UNSIGNED    NOT NULL,
  libelle         VARCHAR(100)    NOT NULL,
  commentaire     TEXT            DEFAULT NULL,
  date_heure      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_statut_commande
    FOREIGN KEY (commande_id) REFERENCES commande(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 7. AVIS (après livraison)
-- ============================================================
CREATE TABLE avis (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  commande_id     INT UNSIGNED    NOT NULL UNIQUE,   -- 1 avis par commande
  client_id       INT UNSIGNED    NOT NULL,
  tailleur_id     INT UNSIGNED    NOT NULL,
  note            TINYINT UNSIGNED NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire     TEXT            DEFAULT NULL,
  date_avis       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_avis_commande
    FOREIGN KEY (commande_id) REFERENCES commande(id),
  CONSTRAINT fk_avis_client
    FOREIGN KEY (client_id) REFERENCES client(id),
  CONSTRAINT fk_avis_tailleur
    FOREIGN KEY (tailleur_id) REFERENCES tailleur(id)
) ENGINE=InnoDB;

-- ============================================================
-- 8. MESSAGE (messagerie intégrée par commande)
-- ============================================================
CREATE TABLE message (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  commande_id     INT UNSIGNED    NOT NULL,
  expediteur_id   INT UNSIGNED    NOT NULL,          -- utilisateur.id
  contenu         TEXT            NOT NULL,
  date_heure      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lu              TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_message_commande
    FOREIGN KEY (commande_id) REFERENCES commande(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_message_expediteur
    FOREIGN KEY (expediteur_id) REFERENCES utilisateur(id)
) ENGINE=InnoDB;

-- ============================================================
-- 9. PORTFOLIO TAILLEUR (photos de réalisations)
-- ============================================================
CREATE TABLE portfolio (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  tailleur_id     INT UNSIGNED    NOT NULL,
  photo_url       VARCHAR(500)    NOT NULL,
  legende         VARCHAR(255)    DEFAULT NULL,
  date_upload     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_portfolio_tailleur
    FOREIGN KEY (tailleur_id) REFERENCES tailleur(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 10. FAVORIS CLIENT (modèles mis en favoris via geste 👍)
-- ============================================================
CREATE TABLE favori (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  client_id       INT UNSIGNED    NOT NULL,
  modele_id       INT UNSIGNED    NOT NULL,
  date_ajout      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_favori (client_id, modele_id),
  CONSTRAINT fk_favori_client
    FOREIGN KEY (client_id) REFERENCES client(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_favori_modele
    FOREIGN KEY (modele_id) REFERENCES modele(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- TRIGGER : mise à jour note_moyenne du tailleur après un avis
-- ============================================================
DELIMITER $$
CREATE TRIGGER maj_note_tailleur
AFTER INSERT ON avis
FOR EACH ROW
BEGIN
  UPDATE tailleur
  SET note_moyenne = (
    SELECT ROUND(AVG(note), 2)
    FROM avis
    WHERE tailleur_id = NEW.tailleur_id
  )
  WHERE id = NEW.tailleur_id;
END$$
DELIMITER ;

-- ============================================================
-- TRIGGER : enregistrer automatiquement l'historique des statuts
-- ============================================================
DELIMITER $$
CREATE TRIGGER log_statut_commande
AFTER UPDATE ON commande
FOR EACH ROW
BEGIN
  IF OLD.statut <> NEW.statut THEN
    INSERT INTO statut_commande (commande_id, libelle)
    VALUES (NEW.id, NEW.statut);
  END IF;
END$$
DELIMITER ;

-- ============================================================
-- INDEX utiles pour les recherches fréquentes
-- ============================================================
CREATE INDEX idx_tailleur_ville      ON utilisateur(ville, type_compte);
CREATE INDEX idx_tailleur_statut     ON tailleur(statut, valide_admin);
CREATE INDEX idx_commande_client     ON commande(client_id, statut);
CREATE INDEX idx_commande_tailleur   ON commande(tailleur_id, statut);
CREATE INDEX idx_message_commande    ON message(commande_id, lu);
