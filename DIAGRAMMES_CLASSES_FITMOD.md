# Diagrammes de Classes d'Application — FITMOD v2

Modélisation orientée objet de la plateforme FITMOD, structurée par sprint.  
Les classes sont fidèles à la base de données `fitmod_bd_v2.sql`.  
Aucune méthode `get` / `set` n'est utilisée.

**Changements v1 → v2 :**
- Suppression table `Client` (un client = un `Utilisateur` avec `type_compte='client'`)
- Suppression table `Portfolio` (le catalogue = les `Modele` du tailleur)
- `Tailleur` : plus de double identifiant → `utilisateur_id` est la PK
- Nouvelle table `Mesure` (séparée, 0..1 par client)
- Nouvelle table `Conversation` + `Message` refait (chat libre)
- `Avis` / `Favori` liés à `utilisateur.id` directement

---

## 6.2.1 Diagramme de classes d'application du Sprint 1

Ce sprint permet de gérer l'inscription, la connexion et la gestion des comptes utilisateurs.

```mermaid
classDiagram
    class Utilisateur {
        <<PK>> -id : int
        -nom : string
        -prenom : string
        -email : string
        -mot_de_passe : string
        -telephone : string
        -ville : string
        -type_compte : ETypeCompte
        -date_inscription : datetime
        -actif : boolean
        +inscrire()
        +authentifier()
        +modifierProfil()
        +desactiver()
    }

    class Tailleur {
        <<PK/FK>> -utilisateur_id : int
        -nom_atelier : string
        -adresse : string
        -quartier : string
        -specialites : string
        -tarif_min : decimal
        -delai_moyen : int
        -note_moyenne : decimal
        -statut : EStatutTailleur
        -valide_admin : boolean
        +modifierProfil()
        +changerStatut()
    }

    class ETypeCompte {
        <<enumeration>>
        CLIENT
        TAILLEUR
        ADMIN
    }

    class EStatutTailleur {
        <<enumeration>>
        ACTIF
        EN_CONGE
        SUSPENDU
    }

    Utilisateur "1" -- "0..1" Tailleur : est un >
    Utilisateur ..> ETypeCompte
    Tailleur ..> EStatutTailleur

    note for Utilisateur "Un client est un Utilisateur\navec type_compte = CLIENT.\nPas de table Client séparée."
```

---

## 6.2.2 Diagramme de classes d'application du Sprint 2

Ce sprint met en place le catalogue de modèles, la recherche, le cycle de vie des commandes, les avis et les favoris.

```mermaid
classDiagram
    class Tailleur {
        <<PK/FK>> -utilisateur_id : int
        -nom_atelier : string
        -specialites : string
        -tarif_min : decimal
        -note_moyenne : decimal
        +accepterCommande()
        +refuserCommande()
        +changerStatutCommande()
    }

    class Modele {
        <<PK>> -id : int
        -tailleur_id : int
        -titre : string
        -description : string
        -type_tenue : string
        -photo_url : string
        -modele_3d_url : string
        -prix_base : decimal
        -delai_confection : int
        -couleurs_disponibles : json
        -actif : boolean
        +creer()
        +modifier()
        +supprimer()
    }

    class Commande {
        <<PK>> -id : int
        -client_id : int
        -tailleur_id : int
        -modele_id : int
        -mesures_utilisees : json
        -tissu_choisi : string
        -couleur : string
        -prix_total : decimal
        -statut : EStatutCommande
        -date_commande : datetime
        -date_livraison_souhaitee : date
        -notes_client : string
        +passer()
        +changerStatut()
        +annuler()
    }

    class StatutCommande {
        <<PK>> -id : int
        -commande_id : int
        -libelle : string
        -commentaire : string
        -date_heure : datetime
    }

    class Avis {
        <<PK>> -id : int
        -commande_id : int
        -client_id : int
        -tailleur_id : int
        -note : int
        -commentaire : string
        -date_avis : datetime
        +publier()
    }

    class Favori {
        <<PK>> -id : int
        -utilisateur_id : int
        -modele_id : int
        -date_ajout : datetime
        +ajouter()
        +retirer()
    }

    class EStatutCommande {
        <<enumeration>>
        EN_ATTENTE_ACCEPTATION
        ACCEPTEE
        TISSU_DECOUPE
        COUTURE_EN_COURS
        FINITIONS
        PRET_A_RECUPERER
        LIVRE
        ANNULEE
    }

    class Paiement {
        <<PK>> -id : int
        -commande_id : int
        -payeur_id : int
        -beneficiaire_id : int
        -montant : decimal
        -methode : EMethodePaiement
        -statut : EStatutPaiement
        -reference : string
        -date_paiement : datetime
        +effectuer()
        +valider()
        +rembourser()
    }

    class EMethodePaiement {
        <<enumeration>>
        MOBILE_MONEY
        CARTE
        ESPECES
        VIREMENT
    }

    class EStatutPaiement {
        <<enumeration>>
        EN_ATTENTE
        VALIDE
        ECHOUE
        REMBOURSE
    }

    Tailleur "1" -- "0..*" Modele : catalogue >
    Utilisateur "1" -- "0..*" Commande : passe >
    Tailleur "1" -- "0..*" Commande : reçoit >
    Modele "1" -- "0..*" Commande : concerne >
    Commande "1" -- "0..*" StatutCommande : historique >
    Commande "1" -- "0..1" Avis : reçoit >
    Commande "1" -- "0..*" Paiement : est payée par >
    Utilisateur "1" -- "0..*" Favori : possède >
    Modele "1" -- "0..*" Favori : est favori >
    Commande ..> EStatutCommande
    Paiement ..> EMethodePaiement
    Paiement ..> EStatutPaiement

    note for Modele "Le catalogue d un tailleur =\nla liste de ses modeles.\nRemplace l ancien Portfolio."
    note for Paiement "Le client paie, le tailleur reçoit.\nMobile Money, Carte, Espèces ou Virement."
```

---

## 6.2.3 Diagramme de classes d'application du Sprint 3

Ce sprint couvre la prise de mesures automatique par IA (webcam + MediaPipe) et le système de messagerie entre utilisateurs.

```mermaid
classDiagram
    class Utilisateur {
        <<PK>> -id : int
        -nom : string
        -prenom : string
        -type_compte : ETypeCompte
    }

    class Mesure {
        <<PK>> -id : int
        -utilisateur_id : int
        -poitrine : decimal
        -taille : decimal
        -hanches : decimal
        -longueur_dos : decimal
        -longueur_bras : decimal
        -tour_cou : decimal
        -entrejambe : decimal
        -hauteur : decimal
        -mesures_json : json
        -date_prise : datetime
        +enregistrer()
        +mettreAJour()
    }

    class Conversation {
        <<PK>> -id : int
        -utilisateur1_id : int
        -utilisateur2_id : int
        -date_creation : datetime
        +creer()
        +chargerMessages()
    }

    class Message {
        <<PK>> -id : int
        -conversation_id : int
        -expediteur_id : int
        -type_message : ETypeMessage
        -contenu : string
        -date_heure : datetime
        -lu : boolean
        +envoyerTexte()
        +envoyerAudio()
        +envoyerImage()
        +marquerLu()
    }

    class ETypeMessage {
        <<enumeration>>
        TEXTE
        AUDIO
        IMAGE
    }

    Utilisateur "1" -- "0..1" Mesure : possède >
    Utilisateur "1" -- "0..*" Conversation : participe >
    Conversation "1" -- "0..*" Message : contient >
    Utilisateur "1" -- "0..*" Message : envoie >
    Message ..> ETypeMessage

    note for Mesure "Un client a 0 ou 1 mesure.\nContrainte UNIQUE sur utilisateur_id.\nLes mesures sont séparées\nde la table utilisateur."
    note for Conversation "Conversation entre 2 utilisateurs.\nPaire unique (user1, user2).\nPermet de chatter AVANT commande."
```

---

## 6.2.4 Diagramme de classes d'application du Sprint 4

Ce sprint intègre la cabine d'essayage virtuelle (rendu 3D + AR).

```mermaid
classDiagram
    class Utilisateur {
        <<PK>> -id : int
        -nom : string
        -prenom : string
    }

    class Modele {
        <<PK>> -id : int
        -titre : string
        -photo_url : string
        -modele_3d_url : string
    }

    class SessionEssayage {
        <<PK>> -id : int
        -utilisateur_id : int
        -modele_id : int
        -date_session : datetime
        -capture_url : string
        +demarrer()
        +capturer()
        +terminer()
    }

    class Mesure {
        <<PK>> -id : int
        -utilisateur_id : int
        -hauteur : decimal
        -mesures_json : json
    }

    Utilisateur "1" -- "0..*" SessionEssayage : effectue >
    Modele "1" -- "0..*" SessionEssayage : est essayé >
    Utilisateur "1" -- "0..1" Mesure : calibre >

    note for SessionEssayage "Suivi de chaque essai virtuel.\nPermet de sauvegarder\nune capture du résultat."
```

---

## 6.2.5 Diagramme de classes global (toutes les classes)

```mermaid
classDiagram
    class Utilisateur {
        <<PK>> -id : int
        -nom : string
        -prenom : string
        -email : string
        -mot_de_passe : string
        -telephone : string
        -ville : string
        -type_compte : ETypeCompte
        -date_inscription : datetime
        -actif : boolean
        +inscrire()
        +authentifier()
        +modifierProfil()
        +desactiver()
    }

    class Tailleur {
        <<PK/FK>> -utilisateur_id : int
        -nom_atelier : string
        -adresse : string
        -quartier : string
        -specialites : string
        -tarif_min : decimal
        -delai_moyen : int
        -note_moyenne : decimal
        -statut : EStatutTailleur
        -valide_admin : boolean
        +modifierProfil()
        +changerStatut()
        +accepterCommande()
        +refuserCommande()
    }

    class Mesure {
        <<PK>> -id : int
        -utilisateur_id : int
        -poitrine : decimal
        -taille : decimal
        -hanches : decimal
        -longueur_dos : decimal
        -longueur_bras : decimal
        -tour_cou : decimal
        -entrejambe : decimal
        -hauteur : decimal
        -mesures_json : json
        -date_prise : datetime
        +enregistrer()
        +mettreAJour()
    }

    class Modele {
        <<PK>> -id : int
        -tailleur_id : int
        -titre : string
        -description : string
        -type_tenue : string
        -photo_url : string
        -modele_3d_url : string
        -prix_base : decimal
        -delai_confection : int
        -couleurs_disponibles : json
        -actif : boolean
        +creer()
        +modifier()
        +supprimer()
    }

    class Commande {
        <<PK>> -id : int
        -client_id : int
        -tailleur_id : int
        -modele_id : int
        -mesures_utilisees : json
        -tissu_choisi : string
        -couleur : string
        -prix_total : decimal
        -statut : EStatutCommande
        -date_commande : datetime
        -date_livraison_souhaitee : date
        -notes_client : string
        +passer()
        +changerStatut()
        +annuler()
    }

    class StatutCommande {
        <<PK>> -id : int
        -commande_id : int
        -libelle : string
        -commentaire : string
        -date_heure : datetime
    }

    class Avis {
        <<PK>> -id : int
        -commande_id : int
        -client_id : int
        -tailleur_id : int
        -note : int
        -commentaire : string
        -date_avis : datetime
        +publier()
    }

    class Favori {
        <<PK>> -id : int
        -utilisateur_id : int
        -modele_id : int
        -date_ajout : datetime
        +ajouter()
        +retirer()
    }

    class Conversation {
        <<PK>> -id : int
        -utilisateur1_id : int
        -utilisateur2_id : int
        -date_creation : datetime
        +creer()
        +chargerMessages()
    }

    class Message {
        <<PK>> -id : int
        -conversation_id : int
        -expediteur_id : int
        -type_message : ETypeMessage
        -contenu : string
        -date_heure : datetime
        -lu : boolean
        +envoyerTexte()
        +envoyerAudio()
        +envoyerImage()
        +marquerLu()
    }

    class SessionEssayage {
        <<PK>> -id : int
        -utilisateur_id : int
        -modele_id : int
        -date_session : datetime
        -capture_url : string
        +demarrer()
        +capturer()
        +terminer()
    }

    class ETypeCompte {
        <<enumeration>>
        CLIENT
        TAILLEUR
        ADMIN
    }

    class EStatutTailleur {
        <<enumeration>>
        ACTIF
        EN_CONGE
        SUSPENDU
    }

    class EStatutCommande {
        <<enumeration>>
        EN_ATTENTE_ACCEPTATION
        ACCEPTEE
        TISSU_DECOUPE
        COUTURE_EN_COURS
        FINITIONS
        PRET_A_RECUPERER
        LIVRE
        ANNULEE
    }

    class ETypeMessage {
        <<enumeration>>
        TEXTE
        AUDIO
        IMAGE
    }

    class Paiement {
        <<PK>> -id : int
        -commande_id : int
        -payeur_id : int
        -beneficiaire_id : int
        -montant : decimal
        -methode : EMethodePaiement
        -statut : EStatutPaiement
        -reference : string
        -date_paiement : datetime
        +effectuer()
        +valider()
        +rembourser()
    }

    class EMethodePaiement {
        <<enumeration>>
        MOBILE_MONEY
        CARTE
        ESPECES
        VIREMENT
    }

    class EStatutPaiement {
        <<enumeration>>
        EN_ATTENTE
        VALIDE
        ECHOUE
        REMBOURSE
    }

    %% Relations Utilisateur
    Utilisateur "1" -- "0..1" Tailleur : est un >
    Utilisateur "1" -- "0..1" Mesure : possède >
    Utilisateur "1" -- "0..*" Commande : passe >
    Utilisateur "1" -- "0..*" Favori : possède >
    Utilisateur "1" -- "0..*" Conversation : participe >
    Utilisateur "1" -- "0..*" SessionEssayage : effectue >

    %% Relations Tailleur
    Tailleur "1" -- "0..*" Modele : catalogue >
    Tailleur "1" -- "0..*" Commande : reçoit >

    %% Relations Modele
    Modele "1" -- "0..*" Commande : concerne >
    Modele "1" -- "0..*" Favori : est favori >
    Modele "1" -- "0..*" SessionEssayage : est essayé >

    %% Relations Commande
    Commande "1" -- "0..*" StatutCommande : historique >
    Commande "1" -- "0..1" Avis : reçoit >
    Commande "1" -- "0..*" Paiement : est payée par >

    %% Relations Messagerie
    Conversation "1" -- "0..*" Message : contient >
    Utilisateur "1" -- "0..*" Message : envoie >

    %% Enumerations
    Utilisateur ..> ETypeCompte
    Tailleur ..> EStatutTailleur
    Commande ..> EStatutCommande
    Message ..> ETypeMessage
    Paiement ..> EMethodePaiement
    Paiement ..> EStatutPaiement
```
