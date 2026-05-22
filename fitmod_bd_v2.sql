-- ============================================================
--  FITMOD — Base de Données v2 (Refonte)
--  Plateforme Web Tailleur-Client (Burkina Faso)
--  Auteur : YARGA Yempounti Kim Josaphat Geoffroi
--  Stack  : MySQL 8+
-- ============================================================
--  CHANGEMENTS v1 → v2 :
--    ✗ Suppression table client (on utilise type_compte)
--    ✗ Suppression table portfolio (redondant avec modele)
--    ✓ Tailleur : utilisateur_id devient PK (plus de double id)
--    ✓ Nouvelle table mesure (séparée de client)
--    ✓ Nouvelle table conversation + message refait
--    ✓ Avis/Favori liés à utilisateur.id directement
--    ✓ Ajout session_essayage (Sprint 4)
-- ============================================================

CREATE DATABASE IF NOT EXISTS fitmod_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE fitmod_db;

-- ============================================================
-- 1. UTILISATEUR (table centrale — Client, Tailleur, Admin)
-- ============================================================
-- Un client est simplement un utilisateur avec type_compte='client'
-- Plus besoin de table client séparée
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
-- 2. TAILLEUR (extension profil pour les tailleurs)
--    PK = utilisateur_id → UN SEUL identifiant
-- ============================================================
CREATE TABLE tailleur (
  utilisateur_id  INT UNSIGNED    NOT NULL,
  nom_atelier     VARCHAR(150)    NOT NULL,
  adresse         VARCHAR(255)    DEFAULT NULL,
  quartier        VARCHAR(100)    DEFAULT NULL,
  specialites     VARCHAR(255)    DEFAULT NULL,      -- ex: "boubou,robe,costume"
  tarif_min       DECIMAL(10,2)   DEFAULT 0.00,
  delai_moyen     INT UNSIGNED    DEFAULT NULL,      -- en jours
  note_moyenne    DECIMAL(3,2)    DEFAULT 0.00,
  statut          ENUM('actif','en_conge','suspendu') NOT NULL DEFAULT 'actif',
  valide_admin    TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (utilisateur_id),
  CONSTRAINT fk_tailleur_utilisateur
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 3. MESURE (mensurations d'un client — 0 ou 1 par client)
-- ============================================================
CREATE TABLE mesure (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  utilisateur_id  INT UNSIGNED    NOT NULL UNIQUE,   -- 1 mesure max par client
  poitrine        DECIMAL(5,1)    DEFAULT NULL,      -- cm
  taille          DECIMAL(5,1)    DEFAULT NULL,      -- cm (tour de taille)
  hanches         DECIMAL(5,1)    DEFAULT NULL,      -- cm
  longueur_dos    DECIMAL(5,1)    DEFAULT NULL,      -- cm
  longueur_bras   DECIMAL(5,1)    DEFAULT NULL,      -- cm
  tour_cou        DECIMAL(5,1)    DEFAULT NULL,      -- cm
  entrejambe      DECIMAL(5,1)    DEFAULT NULL,      -- cm
  hauteur         DECIMAL(5,1)    DEFAULT NULL,      -- taille en cm (calibrage IA)
  mesures_json    JSON            DEFAULT NULL,       -- données brutes MediaPipe
  date_prise      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_mesure_utilisateur
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 4. MODELE (catalogue du tailleur = ses réalisations)
--    Remplace aussi l'ancien "portfolio"
--    Un tailleur propose 0..* modèles dans son catalogue
-- ============================================================
CREATE TABLE modele (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  tailleur_id         INT UNSIGNED    NOT NULL,       -- FK → tailleur.utilisateur_id
  titre               VARCHAR(150)    NOT NULL,
  description         TEXT            DEFAULT NULL,
  type_tenue          VARCHAR(80)     DEFAULT NULL,    -- ex: boubou, robe, costume
  photo_url           VARCHAR(500)    DEFAULT NULL,
  modele_3d_url       VARCHAR(500)    DEFAULT NULL,    -- fichier GLTF / GLB
  prix_base           DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  delai_confection    INT UNSIGNED    DEFAULT NULL,    -- en jours
  couleurs_disponibles JSON           DEFAULT NULL,    -- ["rouge","blanc","bleu"]
  date_creation       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actif               TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  CONSTRAINT fk_modele_tailleur
    FOREIGN KEY (tailleur_id) REFERENCES tailleur(utilisateur_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 5. COMMANDE
--    client_id et tailleur_id → utilisateur.id
-- ============================================================
CREATE TABLE commande (
  id                      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  client_id               INT UNSIGNED    NOT NULL,    -- FK → utilisateur.id
  tailleur_id             INT UNSIGNED    NOT NULL,    -- FK → tailleur.utilisateur_id
  modele_id               INT UNSIGNED    NOT NULL,    -- FK → modele.id
  mesures_utilisees       JSON            NOT NULL,    -- snapshot mesures au moment de la commande
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
    FOREIGN KEY (client_id) REFERENCES utilisateur(id),
  CONSTRAINT fk_commande_tailleur
    FOREIGN KEY (tailleur_id) REFERENCES tailleur(utilisateur_id),
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
-- 7. AVIS (après livraison — 1 avis par commande)
--    client_id et tailleur_id → utilisateur.id
-- ============================================================
CREATE TABLE avis (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  commande_id     INT UNSIGNED    NOT NULL UNIQUE,     -- 1 avis par commande
  client_id       INT UNSIGNED    NOT NULL,            -- FK → utilisateur.id
  tailleur_id     INT UNSIGNED    NOT NULL,            -- FK → tailleur.utilisateur_id
  note            TINYINT UNSIGNED NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire     TEXT            DEFAULT NULL,
  date_avis       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_avis_commande
    FOREIGN KEY (commande_id) REFERENCES commande(id),
  CONSTRAINT fk_avis_client
    FOREIGN KEY (client_id) REFERENCES utilisateur(id),
  CONSTRAINT fk_avis_tailleur
    FOREIGN KEY (tailleur_id) REFERENCES tailleur(utilisateur_id)
) ENGINE=InnoDB;

-- ============================================================
-- 8. FAVORI (modèle mis en favori par un utilisateur)
-- ============================================================
CREATE TABLE favori (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  utilisateur_id  INT UNSIGNED    NOT NULL,            -- FK → utilisateur.id
  modele_id       INT UNSIGNED    NOT NULL,            -- FK → modele.id
  date_ajout      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_favori (utilisateur_id, modele_id),
  CONSTRAINT fk_favori_utilisateur
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_favori_modele
    FOREIGN KEY (modele_id) REFERENCES modele(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 9. CONVERSATION (entre 2 utilisateurs — chat libre)
-- ============================================================
CREATE TABLE conversation (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  utilisateur1_id INT UNSIGNED    NOT NULL,
  utilisateur2_id INT UNSIGNED    NOT NULL,
  date_creation   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conv_pair (utilisateur1_id, utilisateur2_id),
  CONSTRAINT fk_conv_user1
    FOREIGN KEY (utilisateur1_id) REFERENCES utilisateur(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_conv_user2
    FOREIGN KEY (utilisateur2_id) REFERENCES utilisateur(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 10. MESSAGE (dans une conversation)
-- ============================================================
CREATE TABLE message (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  conversation_id INT UNSIGNED    NOT NULL,
  expediteur_id   INT UNSIGNED    NOT NULL,            -- FK → utilisateur.id
  type_message    ENUM('texte','audio','image') NOT NULL DEFAULT 'texte',
  contenu         TEXT            NOT NULL,
  date_heure      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lu              TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_message_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversation(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_message_expediteur
    FOREIGN KEY (expediteur_id) REFERENCES utilisateur(id)
) ENGINE=InnoDB;

-- ============================================================
-- 11. SESSION ESSAYAGE (cabine virtuelle — Sprint 4)
-- ============================================================
CREATE TABLE session_essayage (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  utilisateur_id  INT UNSIGNED    NOT NULL,            -- FK → utilisateur.id
  modele_id       INT UNSIGNED    NOT NULL,            -- FK → modele.id
  date_session    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  capture_url     VARCHAR(500)    DEFAULT NULL,        -- screenshot du résultat
  PRIMARY KEY (id),
  CONSTRAINT fk_session_utilisateur
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_session_modele
    FOREIGN KEY (modele_id) REFERENCES modele(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 12. PAIEMENT (transactions financières)
--     Lié à une commande — le client paie, le tailleur reçoit
-- ============================================================
CREATE TABLE paiement (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  commande_id     INT UNSIGNED    NOT NULL,
  payeur_id       INT UNSIGNED    NOT NULL,            -- FK → utilisateur.id (le client)
  beneficiaire_id INT UNSIGNED    NOT NULL,            -- FK → utilisateur.id (le tailleur)
  montant         DECIMAL(10,2)   NOT NULL,
  methode         ENUM('mobile_money','carte','especes','virement') NOT NULL DEFAULT 'mobile_money',
  statut          ENUM('en_attente','valide','echoue','rembourse') NOT NULL DEFAULT 'en_attente',
  reference       VARCHAR(100)    DEFAULT NULL,        -- référence de transaction externe
  date_paiement   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_paiement_commande
    FOREIGN KEY (commande_id) REFERENCES commande(id),
  CONSTRAINT fk_paiement_payeur
    FOREIGN KEY (payeur_id) REFERENCES utilisateur(id),
  CONSTRAINT fk_paiement_beneficiaire
    FOREIGN KEY (beneficiaire_id) REFERENCES utilisateur(id)
) ENGINE=InnoDB;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Mise à jour note_moyenne du tailleur après un avis
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
  WHERE utilisateur_id = NEW.tailleur_id;
END$$
DELIMITER ;

-- Log automatique des changements de statut de commande
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
-- INDEX pour performances
-- ============================================================
CREATE INDEX idx_utilisateur_ville      ON utilisateur(ville, type_compte);
CREATE INDEX idx_tailleur_statut        ON tailleur(statut, valide_admin);
CREATE INDEX idx_commande_client        ON commande(client_id, statut);
CREATE INDEX idx_commande_tailleur      ON commande(tailleur_id, statut);
CREATE INDEX idx_message_conversation   ON message(conversation_id, lu);
CREATE INDEX idx_modele_tailleur        ON modele(tailleur_id, actif);
CREATE INDEX idx_mesure_utilisateur     ON mesure(utilisateur_id);
CREATE INDEX idx_paiement_commande      ON paiement(commande_id, statut);
