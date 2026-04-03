/**
 * FITMOD — Données Démo
 * Tailleurs, modèles, commandes, avis fictifs pour la démo
 * Contexte : Burkina Faso
 */

export const TAILLEURS = [
    {
        id: 1,
        utilisateur_id: 10,
        nom: 'OUEDRAOGO Mamadou',
        nom_atelier: 'Atelier Faso Danfani',
        email: 'mamadou@fitmod.bf',
        telephone: '+226 70 12 34 56',
        ville: 'Ouagadougou',
        quartier: 'Dassasgho',
        adresse: 'Rue 15.32, Dassasgho',
        specialites: ['boubou', 'costume', 'bazin'],
        tarif_min: 15000,
        delai_moyen: 5,
        note_moyenne: 4.7,
        statut: 'actif',
        photo: '👨‍🎨',
        bio: 'Maître tailleur avec 15 ans d\'expérience. Spécialiste du boubou traditionnel et du costume moderne africain.',
        portfolio: [
            { id: 1, legende: 'Boubou bazin riche', photo: '🟤' },
            { id: 2, legende: 'Costume mariage', photo: '⚪' },
            { id: 3, legende: 'Ensemble pagne femme', photo: '🟡' },
        ]
    },
    {
        id: 2,
        utilisateur_id: 11,
        nom: 'KABORE Fatimata',
        nom_atelier: 'Couture Élégance BF',
        email: 'fatimata@fitmod.bf',
        telephone: '+226 76 45 67 89',
        ville: 'Ouagadougou',
        quartier: 'Pissy',
        adresse: 'Avenue Kwamé Nkrumah, Pissy',
        specialites: ['robe', 'pagne', 'tenue de fête'],
        tarif_min: 10000,
        delai_moyen: 3,
        note_moyenne: 4.9,
        statut: 'actif',
        photo: '👩‍🎨',
        bio: 'Créatrice de mode passionnée. Robes de cérémonie et tenues de fête sur mesure pour femmes.',
        portfolio: [
            { id: 4, legende: 'Robe de soirée', photo: '🔴' },
            { id: 5, legende: 'Ensemble pagne', photo: '🟢' },
        ]
    },
    {
        id: 3,
        utilisateur_id: 12,
        nom: 'TRAORE Ibrahim',
        nom_atelier: 'Style Sahel',
        email: 'ibrahim@fitmod.bf',
        telephone: '+226 71 98 76 54',
        ville: 'Bobo-Dioulasso',
        quartier: 'Dioulassoba',
        adresse: 'Marché central, Dioulassoba',
        specialites: ['boubou', 'djellaba', 'caftan'],
        tarif_min: 8000,
        delai_moyen: 4,
        note_moyenne: 4.3,
        statut: 'actif',
        photo: '👨‍🎨',
        bio: 'Tradition et modernité. Boubous et caftans avec broderies artisanales du Sahel.',
        portfolio: [
            { id: 6, legende: 'Caftan brodé', photo: '🔵' },
            { id: 7, legende: 'Djellaba homme', photo: '⚫' },
        ]
    },
    {
        id: 4,
        utilisateur_id: 13,
        nom: 'ZONGO Aïssata',
        nom_atelier: 'Aïssata Fashion',
        email: 'aissata@fitmod.bf',
        telephone: '+226 75 11 22 33',
        ville: 'Ouagadougou',
        quartier: 'Ouaga 2000',
        adresse: 'Zone résidentielle, Ouaga 2000',
        specialites: ['costume', 'chemise', 'pantalon'],
        tarif_min: 20000,
        delai_moyen: 7,
        note_moyenne: 4.5,
        statut: 'actif',
        photo: '👩‍🎨',
        bio: 'Spécialiste du prêt-à-porter masculin haut de gamme. Costumes sur mesure pour professionnels.',
        portfolio: [
            { id: 8, legende: 'Costume 3 pièces', photo: '⚫' },
            { id: 9, legende: 'Chemise slim fit', photo: '⚪' },
        ]
    },
    {
        id: 5,
        utilisateur_id: 14,
        nom: 'SANOU Bakary',
        nom_atelier: 'Sanou Couture',
        email: 'bakary@fitmod.bf',
        telephone: '+226 78 55 44 33',
        ville: 'Koudougou',
        quartier: 'Secteur 5',
        adresse: 'Grand marché, Secteur 5',
        specialites: ['boubou', 'pagne', 'robe'],
        tarif_min: 5000,
        delai_moyen: 3,
        note_moyenne: 4.1,
        statut: 'actif',
        photo: '👨‍🎨',
        bio: 'Couture accessible et de qualité. Prix compétitifs pour tous les budgets.',
        portfolio: []
    }
];

export const MODELES = [
    {
        id: 1, tailleur_id: 1, titre: 'Boubou Grand Bazin',
        description: 'Boubou traditionnel en bazin riche avec broderies dorées. Tenue de cérémonie par excellence.',
        type_tenue: 'boubou', prix_base: 35000, delai_confection: 5,
        couleurs_disponibles: ['Blanc', 'Bleu nuit', 'Doré', 'Bordeaux'],
        photo: '👘', actif: true
    },
    {
        id: 2, tailleur_id: 1, titre: 'Costume Africain Moderne',
        description: 'Costume 2 pièces fusionnant coupe européenne et tissu africain.',
        type_tenue: 'costume', prix_base: 45000, delai_confection: 7,
        couleurs_disponibles: ['Noir', 'Gris', 'Bleu marine'],
        photo: '🤵', actif: true
    },
    {
        id: 3, tailleur_id: 2, titre: 'Robe Cocktail Pagne',
        description: 'Robe de cocktail en pagne wax avec coupe évasée et manches bouffantes.',
        type_tenue: 'robe', prix_base: 25000, delai_confection: 4,
        couleurs_disponibles: ['Multicolore', 'Jaune/Noir', 'Rouge/Blanc'],
        photo: '👗', actif: true
    },
    {
        id: 4, tailleur_id: 2, titre: 'Ensemble Complet Femme',
        description: 'Top + jupe longue en pagne coordonné. Parfait pour les cérémonies.',
        type_tenue: 'pagne', prix_base: 20000, delai_confection: 3,
        couleurs_disponibles: ['Vert', 'Orange', 'Violet'],
        photo: '👚', actif: true
    },
    {
        id: 5, tailleur_id: 3, titre: 'Caftan Brodé Sahélien',
        description: 'Caftan ample avec broderies traditionnelles du Sahel. Confort et élégance.',
        type_tenue: 'caftan', prix_base: 28000, delai_confection: 6,
        couleurs_disponibles: ['Blanc', 'Crème', 'Bleu ciel'],
        photo: '🧥', actif: true
    },
    {
        id: 6, tailleur_id: 4, titre: 'Costume 3 Pièces Premium',
        description: 'Veste + pantalon + gilet en tissu italien. Finitions main.',
        type_tenue: 'costume', prix_base: 75000, delai_confection: 10,
        couleurs_disponibles: ['Noir', 'Bleu marine', 'Gris anthracite'],
        photo: '🤵', actif: true
    },
    {
        id: 7, tailleur_id: 5, titre: 'Boubou Simple Quotidien',
        description: 'Boubou simple en coton pour le quotidien. Confortable et abordable.',
        type_tenue: 'boubou', prix_base: 8000, delai_confection: 2,
        couleurs_disponibles: ['Blanc', 'Beige', 'Gris clair', 'Bleu'],
        photo: '👘', actif: true
    },
    {
        id: 8, tailleur_id: 5, titre: 'Robe Casual Pagne',
        description: 'Robe décontractée en pagne pour le quotidien.',
        type_tenue: 'robe', prix_base: 7000, delai_confection: 2,
        couleurs_disponibles: ['Multicolore'],
        photo: '👗', actif: true
    }
];

export const STATUTS_COMMANDE = [
    { value: 'en_attente_acceptation', label: 'En attente', icon: '⏳', color: '#ffc107' },
    { value: 'acceptee', label: 'Acceptée', icon: '✅', color: '#00e6b8' },
    { value: 'tissu_decoupe', label: 'Tissu découpé', icon: '✂️', color: '#8b5cf6' },
    { value: 'couture_en_cours', label: 'Couture en cours', icon: '🧵', color: '#ec4899' },
    { value: 'finitions', label: 'Finitions', icon: '✨', color: '#f97316' },
    { value: 'pret_a_recuperer', label: 'Prêt à récupérer', icon: '📦', color: '#06b6d4' },
    { value: 'livre', label: 'Livré', icon: '🎉', color: '#22c55e' },
    { value: 'annulee', label: 'Annulée', icon: '❌', color: '#ef4444' },
];

// Commandes démo
export const DEMO_COMMANDES = [
    {
        id: 1, client_id: 1, tailleur_id: 1, modele_id: 1,
        tailleur_nom: 'OUEDRAOGO Mamadou', modele_titre: 'Boubou Grand Bazin',
        couleur: 'Blanc', tissu_choisi: 'Bazin riche',
        prix_total: 35000, statut: 'couture_en_cours',
        date_commande: '2026-03-20', date_livraison_souhaitee: '2026-03-28',
        notes_client: 'Pour le mariage de mon frère',
        historique: [
            { statut: 'en_attente_acceptation', date: '2026-03-20 14:30' },
            { statut: 'acceptee', date: '2026-03-20 18:00' },
            { statut: 'tissu_decoupe', date: '2026-03-22 09:00' },
            { statut: 'couture_en_cours', date: '2026-03-24 10:00' },
        ]
    },
    {
        id: 2, client_id: 1, tailleur_id: 2, modele_id: 3,
        tailleur_nom: 'KABORE Fatimata', modele_titre: 'Robe Cocktail Pagne',
        couleur: 'Multicolore', tissu_choisi: 'Pagne wax',
        prix_total: 25000, statut: 'livre',
        date_commande: '2026-03-10', date_livraison_souhaitee: '2026-03-15',
        date_livraison_reelle: '2026-03-14',
        notes_client: '',
        historique: [
            { statut: 'en_attente_acceptation', date: '2026-03-10 10:00' },
            { statut: 'acceptee', date: '2026-03-10 12:00' },
            { statut: 'tissu_decoupe', date: '2026-03-11 08:00' },
            { statut: 'couture_en_cours', date: '2026-03-12 09:00' },
            { statut: 'finitions', date: '2026-03-13 14:00' },
            { statut: 'pret_a_recuperer', date: '2026-03-14 10:00' },
            { statut: 'livre', date: '2026-03-14 16:00' },
        ]
    }
];

export const DEMO_MESSAGES = [
    {
        id: 1, commande_id: 1, expediteur_id: 1, expediteur_nom: 'Vous',
        contenu: 'Bonjour, est-ce possible d\'ajouter des broderies sur le col ?',
        date_heure: '2026-03-21 09:30', lu: true
    },
    {
        id: 2, commande_id: 1, expediteur_id: 10, expediteur_nom: 'OUEDRAOGO Mamadou',
        contenu: 'Bonjour ! Oui bien sûr, broderies dorées ou argentées ?',
        date_heure: '2026-03-21 10:15', lu: true
    },
    {
        id: 3, commande_id: 1, expediteur_id: 1, expediteur_nom: 'Vous',
        contenu: 'Dorées s\'il vous plaît. Merci !',
        date_heure: '2026-03-21 10:20', lu: true
    },
    {
        id: 4, commande_id: 1, expediteur_id: 10, expediteur_nom: 'OUEDRAOGO Mamadou',
        contenu: 'C\'est noté ! Je vous envoie une photo du tissu découpé demain.',
        date_heure: '2026-03-21 10:25', lu: false
    },
];

export const DEMO_AVIS = [
    { id: 1, commande_id: 2, client_nom: 'Client Demo', tailleur_id: 2, note: 5, commentaire: 'Excellente qualité ! La robe est magnifique, finitions parfaites.', date: '2026-03-15' },
    { id: 2, commande_id: 99, client_nom: 'Aminata S.', tailleur_id: 1, note: 5, commentaire: 'Boubou sublime, broderies impeccables. Je recommande !', date: '2026-03-01' },
    { id: 3, commande_id: 98, client_nom: 'Issa K.', tailleur_id: 1, note: 4, commentaire: 'Bon travail, délai respecté. Légère différence sur le col.', date: '2026-02-20' },
    { id: 4, commande_id: 97, client_nom: 'Fati O.', tailleur_id: 3, note: 4, commentaire: 'Beau caftan, mais un jour de retard.', date: '2026-02-15' },
];

export const VILLES_BF = ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou', 'Banfora', 'Ouahigouya', 'Kaya', 'Fada N\'Gourma'];
export const SPECIALITES = ['boubou', 'robe', 'costume', 'pagne', 'caftan', 'djellaba', 'chemise', 'pantalon', 'tenue de fête'];
