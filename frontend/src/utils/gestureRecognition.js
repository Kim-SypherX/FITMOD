/**
 * FITMOD — gestureRecognition.js
 * ================================
 * Moteur de reconnaissance de gestes pour la Cabine d'Essayage
 * 
 * Utilise les résultats de MediaPipe GestureRecognizer pour détecter
 * des gestes spécifiques et déclencher des actions dans la cabine.
 * 
 * Gestes supportés :
 *   👋→  Main ouverte droite    → Modèle suivant
 *   👋←  Main ouverte gauche    → Modèle précédent
 *   ☝️   1 doigt vers le haut   → Couleur suivante
 *   👇   1 doigt vers le bas    → Couleur précédente
 *   👍   Pouce en l'air         → Ajouter aux favoris
 *   ✌️   Deux doigts écartés    → Voir détails modèle
 *   ✊   Poing fermé            → Confirmer commande
 *   🖐️   Paume face caméra      → Pause / Menu
 */

// ─── Constantes ───
const GESTURE_COOLDOWN_MS = 800;     // Anti-spam : délai minimum entre deux gestes
const CONFIDENCE_THRESHOLD = 0.7;    // Seuil de confiance minimum
const SWIPE_VELOCITY_THRESHOLD = 0.015; // Vitesse minimum pour détecter un swipe
const SWIPE_HISTORY_SIZE = 8;        // Nombre de frames pour calculer la vélocité

// ─── Types de gestes ───
export const GESTURE_ACTIONS = {
  NEXT_MODEL:     'NEXT_MODEL',
  PREV_MODEL:     'PREV_MODEL',
  NEXT_COLOR:     'NEXT_COLOR',
  PREV_COLOR:     'PREV_COLOR',
  ADD_FAVORITE:   'ADD_FAVORITE',
  VIEW_DETAILS:   'VIEW_DETAILS',
  CONFIRM_ORDER:  'CONFIRM_ORDER',
  PAUSE_MENU:     'PAUSE_MENU',
  NONE:           'NONE'
};

// ─── Labels pour l'UI ───
export const GESTURE_LABELS = {
  [GESTURE_ACTIONS.NEXT_MODEL]:     { icon: '👋→', label: 'Modèle suivant',    color: '#4CAF50' },
  [GESTURE_ACTIONS.PREV_MODEL]:     { icon: '👋←', label: 'Modèle précédent',  color: '#2196F3' },
  [GESTURE_ACTIONS.NEXT_COLOR]:     { icon: '☝️',  label: 'Couleur suivante',  color: '#FF9800' },
  [GESTURE_ACTIONS.PREV_COLOR]:     { icon: '👇',  label: 'Couleur précédente', color: '#9C27B0' },
  [GESTURE_ACTIONS.ADD_FAVORITE]:   { icon: '👍',  label: 'Ajouté aux favoris', color: '#E91E63' },
  [GESTURE_ACTIONS.VIEW_DETAILS]:   { icon: '✌️',  label: 'Détails du modèle', color: '#00BCD4' },
  [GESTURE_ACTIONS.CONFIRM_ORDER]:  { icon: '✊',  label: 'Commander !',       color: '#8BC34A' },
  [GESTURE_ACTIONS.PAUSE_MENU]:     { icon: '🖐️',  label: 'Pause',             color: '#607D8B' },
  [GESTURE_ACTIONS.NONE]:           { icon: '',    label: '',                  color: 'transparent' },
};

/**
 * Classe de reconnaissance de gestes
 * Gère la détection, le debounce et l'historique
 */
export class GestureEngine {
  constructor() {
    this.lastGestureTime = 0;
    this.lastGesture = GESTURE_ACTIONS.NONE;
    this.wristHistory = [];  // Historique des positions du poignet pour détecter les swipes
    this.callbacks = {};
    this.isEnabled = true;
    
    // État persistant pour les gestes maintenus
    this._holdStartTime = 0;
    this._holdGesture = null;
    this._holdConfirmed = false;
  }

  /**
   * Enregistre un callback pour un type de geste
   * @param {string} action - GESTURE_ACTIONS
   * @param {Function} callback
   */
  on(action, callback) {
    if (!this.callbacks[action]) this.callbacks[action] = [];
    this.callbacks[action].push(callback);
  }

  /**
   * Supprime tous les callbacks
   */
  removeAll() {
    this.callbacks = {};
  }

  /**
   * Active/désactive le moteur
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  /**
   * Émet un geste détecté
   */
  _emit(action) {
    const now = Date.now();
    if (now - this.lastGestureTime < GESTURE_COOLDOWN_MS) return;
    if (action === this.lastGesture && now - this.lastGestureTime < GESTURE_COOLDOWN_MS * 1.5) return;

    this.lastGestureTime = now;
    this.lastGesture = action;

    const handlers = this.callbacks[action] || [];
    handlers.forEach(cb => cb(action));

    // Aussi émettre sur le callback "all" si défini
    const allHandlers = this.callbacks['*'] || [];
    allHandlers.forEach(cb => cb(action));
  }

  /**
   * Analyse les résultats de MediaPipe GestureRecognizer
   * @param {Object} gestureResult - Résultat de recognizeForVideo()
   * @returns {{ action: string, confidence: number, handedness: string }}
   */
  processGestureResult(gestureResult) {
    if (!this.isEnabled || !gestureResult) return { action: GESTURE_ACTIONS.NONE, confidence: 0 };

    const { gestures, landmarks, handedness } = gestureResult;

    // Pas de main détectée
    if (!gestures || gestures.length === 0 || !landmarks || landmarks.length === 0) {
      this.wristHistory = [];
      return { action: GESTURE_ACTIONS.NONE, confidence: 0, handedness: '' };
    }

    // Prendre la main avec le geste le plus confiant
    let bestGestureIdx = 0;
    let bestConfidence = 0;
    
    for (let i = 0; i < gestures.length; i++) {
      if (gestures[i]?.[0]?.score > bestConfidence) {
        bestConfidence = gestures[i][0].score;
        bestGestureIdx = i;
      }
    }

    const gesture = gestures[bestGestureIdx]?.[0];
    const handLandmarks = landmarks[bestGestureIdx];
    const hand = handedness[bestGestureIdx]?.[0]?.categoryName || 'Right';

    if (!gesture || !handLandmarks) {
      return { action: GESTURE_ACTIONS.NONE, confidence: 0, handedness: '' };
    }

    const gestureName = gesture.categoryName;
    const confidence = gesture.score;

    // ─── Mapper les gestes MediaPipe aux actions ───
    let action = GESTURE_ACTIONS.NONE;

    switch (gestureName) {
      case 'Open_Palm':
        // Main ouverte → détecter direction du swipe
        action = this._detectSwipe(handLandmarks, hand);
        if (action === GESTURE_ACTIONS.NONE) {
          // Paume statique face caméra → Pause
          action = GESTURE_ACTIONS.PAUSE_MENU;
        }
        break;

      case 'Thumb_Up':
        action = GESTURE_ACTIONS.ADD_FAVORITE;
        break;

      case 'Closed_Fist':
        action = GESTURE_ACTIONS.CONFIRM_ORDER;
        break;

      case 'Pointing_Up':
        action = GESTURE_ACTIONS.NEXT_COLOR;
        break;

      case 'Victory':
        action = GESTURE_ACTIONS.VIEW_DETAILS;
        break;

      case 'Thumb_Down':
        action = GESTURE_ACTIONS.PREV_COLOR;
        break;

      case 'ILoveYou':
        // Geste "je t'aime" → on l'utilise comme alternative pour les favoris
        action = GESTURE_ACTIONS.ADD_FAVORITE;
        break;

      default:
        action = GESTURE_ACTIONS.NONE;
    }

    // ─── Émettre si confiance suffisante ───
    if (action !== GESTURE_ACTIONS.NONE && confidence >= CONFIDENCE_THRESHOLD) {
      this._emit(action);
    }

    return { action, confidence, handedness: hand };
  }

  /**
   * Détecte un swipe gauche/droite à partir de l'historique du poignet
   * @param {Array} handLandmarks - 21 landmarks de la main
   * @param {string} hand - 'Left' ou 'Right'  
   * @returns {string} GESTURE_ACTIONS
   */
  _detectSwipe(handLandmarks, hand) {
    const wrist = handLandmarks[0]; // Point 0 = poignet
    if (!wrist) return GESTURE_ACTIONS.NONE;

    // Ajouter la position actuelle à l'historique
    this.wristHistory.push({ x: wrist.x, y: wrist.y, t: Date.now() });

    // Garder seulement les N dernières positions
    if (this.wristHistory.length > SWIPE_HISTORY_SIZE) {
      this.wristHistory.shift();
    }

    // Besoin d'au moins 4 frames pour calculer la vélocité
    if (this.wristHistory.length < 4) return GESTURE_ACTIONS.NONE;

    // Calculer la vélocité horizontale moyenne
    const first = this.wristHistory[0];
    const last = this.wristHistory[this.wristHistory.length - 1];
    const dt = last.t - first.t;
    
    if (dt < 100) return GESTURE_ACTIONS.NONE; // Trop rapide

    const velocityX = (last.x - first.x) / (dt / 1000); // pixels/sec normalisé
    const velocityY = Math.abs(last.y - first.y) / (dt / 1000);

    // Le mouvement doit être principalement horizontal
    if (Math.abs(velocityX) < SWIPE_VELOCITY_THRESHOLD) return GESTURE_ACTIONS.NONE;
    if (velocityY > Math.abs(velocityX) * 0.7) return GESTURE_ACTIONS.NONE;

    // En mode webcam miroir, les directions sont inversées
    // MediaPipe retourne les coords AVANT miroir, donc x augmente vers la droite de l'image
    // Mais la webcam est en miroir, donc un swipe "vers la droite" de l'utilisateur
    // = x qui diminue dans les coords MediaPipe
    
    if (velocityX < -SWIPE_VELOCITY_THRESHOLD) {
      this.wristHistory = []; // Reset après détection
      return GESTURE_ACTIONS.NEXT_MODEL;    // Swipe vers la droite (utilisateur)
    }
    if (velocityX > SWIPE_VELOCITY_THRESHOLD) {
      this.wristHistory = [];
      return GESTURE_ACTIONS.PREV_MODEL;    // Swipe vers la gauche (utilisateur)
    }

    return GESTURE_ACTIONS.NONE;
  }

  /**
   * Réinitialise l'état du moteur
   */
  reset() {
    this.lastGestureTime = 0;
    this.lastGesture = GESTURE_ACTIONS.NONE;
    this.wristHistory = [];
    this._holdStartTime = 0;
    this._holdGesture = null;
    this._holdConfirmed = false;
  }
}

/**
 * Dessine les indicateurs de geste détecté sur le canvas 2D
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} gestureResult - { action, confidence, handedness }
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 */
export function drawGestureOverlay(ctx, gestureResult, canvasWidth, canvasHeight) {
  if (!ctx || !gestureResult || gestureResult.action === GESTURE_ACTIONS.NONE) return;

  const { action, confidence } = gestureResult;
  const info = GESTURE_LABELS[action];
  if (!info || !info.label) return;

  const padding = 20;
  const badgeH = 50;
  const badgeW = 260;
  const x = (canvasWidth - badgeW) / 2;
  const y = canvasHeight - badgeH - padding;

  // ─── Badge fond ───
  ctx.save();
  ctx.globalAlpha = Math.min(confidence, 0.9);
  
  // Fond arrondi avec couleur du geste
  ctx.fillStyle = info.color;
  ctx.shadowColor = info.color;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.roundRect(x, y, badgeW, badgeH, 16);
  ctx.fill();
  ctx.shadowBlur = 0;

  // ─── Texte ───
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${info.icon} ${info.label}`, x + badgeW / 2, y + badgeH / 2);

  // ─── Barre de confiance ───
  const barY = y + badgeH - 6;
  const barW = badgeW - 20;
  const barX = x + 10;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, 4, 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW * confidence, 4, 2);
  ctx.fill();

  ctx.restore();
}

export default GestureEngine;
