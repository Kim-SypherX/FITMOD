/**
 * FITMOD — useClothSimulation.js
 * ================================
 * Simulation de tissu légère basée sur l'intégration de Verlet.
 * 
 * Ajoute de l'inertie et de la gravité aux points intermédiaires du mesh
 * pour simuler le comportement naturel d'un tissu :
 *   - Les épaules sont des points fixes (pins)
 *   - Les points intermédiaires sont soumis à la gravité
 *   - Des contraintes de distance maintiennent la forme du tissu
 *   - Un léger amortissement évite les oscillations infinies
 *
 * Utilisation :
 *   const cloth = useClothSimulation(mesh, { gravity: 0.3 });
 *   cloth.update(dstVertices); // appelé à chaque frame
 *   const simulated = cloth.getVertices(); // sommets simulés
 */

import { useRef, useCallback } from 'react';

// ─── Configuration par défaut ───
const DEFAULT_CONFIG = {
    gravity: 0.25,          // Force gravitationnelle (pixels/frame²)
    damping: 0.92,          // Amortissement (0 = pas de mouvement, 1 = pas d'amortissement)
    stiffness: 0.6,         // Rigidité des contraintes de distance (0-1)
    constraintIterations: 3, // Nombre d'itérations de résolution des contraintes
    maxVelocity: 8,         // Vitesse maximale d'un point (pixels/frame)
    pinRows: [0, 1],        // Lignes épinglées (fixées aux landmarks, pas de simulation)
};

/**
 * Hook de simulation de tissu
 * 
 * @param {Object} mesh - { srcVertices, triangles, cols, rows } du meshWarping
 * @param {Object} config - Configuration de la simulation
 * @returns {{ update, getVertices, reset }}
 */
export function useClothSimulation(mesh, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    
    // État de la simulation
    const stateRef = useRef(null);

    /**
     * Initialise ou réinitialise la simulation avec de nouvelles positions
     */
    const initState = useCallback((dstVertices) => {
        if (!dstVertices || dstVertices.length === 0) return;

        const n = dstVertices.length;
        const positions = dstVertices.map(v => ({ x: v.x, y: v.y }));
        const prevPositions = dstVertices.map(v => ({ x: v.x, y: v.y }));
        
        // Déterminer quels points sont épinglés (fixés)
        const pinned = new Array(n).fill(false);
        if (mesh) {
            for (let i = 0; i < n; i++) {
                const row = mesh.srcVertices[i]?.row ?? 0;
                if (cfg.pinRows.includes(row)) {
                    pinned[i] = true;
                }
            }
        }

        // Calculer les contraintes de distance (edges du mesh)
        const constraints = [];
        if (mesh) {
            const { cols, rows: meshRows } = mesh;
            for (let r = 0; r < meshRows; r++) {
                for (let c = 0; c < cols; c++) {
                    const idx = r * cols + c;
                    // Contrainte horizontale
                    if (c < cols - 1) {
                        const right = idx + 1;
                        constraints.push({
                            a: idx,
                            b: right,
                            restLength: dist(positions[idx], positions[right]),
                        });
                    }
                    // Contrainte verticale
                    if (r < meshRows - 1) {
                        const below = idx + cols;
                        constraints.push({
                            a: idx,
                            b: below,
                            restLength: dist(positions[idx], positions[below]),
                        });
                    }
                    // Contrainte diagonale (stabilité)
                    if (c < cols - 1 && r < meshRows - 1) {
                        const diag = idx + cols + 1;
                        constraints.push({
                            a: idx,
                            b: diag,
                            restLength: dist(positions[idx], positions[diag]),
                        });
                    }
                }
            }
        }

        stateRef.current = {
            positions,
            prevPositions,
            pinned,
            constraints,
            initialized: true,
        };
    }, [mesh, cfg.pinRows]);

    /**
     * Met à jour la simulation avec les nouvelles positions des landmarks.
     * Les points épinglés sont directement positionnés sur les landmarks.
     * Les points libres sont simulés avec Verlet.
     * 
     * @param {Array<{x,y}>} targetVertices - Positions cibles (depuis mapMeshToBody)
     */
    const update = useCallback((targetVertices) => {
        if (!targetVertices || targetVertices.length === 0) return;

        // Initialiser si nécessaire
        if (!stateRef.current || !stateRef.current.initialized) {
            initState(targetVertices);
            return;
        }

        const state = stateRef.current;
        const { positions, prevPositions, pinned, constraints } = state;

        if (positions.length !== targetVertices.length) {
            initState(targetVertices);
            return;
        }

        // ── Étape 1 : Mettre à jour les points épinglés ──
        for (let i = 0; i < positions.length; i++) {
            if (pinned[i]) {
                prevPositions[i].x = positions[i].x;
                prevPositions[i].y = positions[i].y;
                positions[i].x = targetVertices[i].x;
                positions[i].y = targetVertices[i].y;
            }
        }

        // ── Étape 2 : Intégration de Verlet pour les points libres ──
        for (let i = 0; i < positions.length; i++) {
            if (pinned[i]) continue;

            const target = targetVertices[i];
            const curr = positions[i];
            const prev = prevPositions[i];

            // Vélocité implicite (Verlet)
            let vx = (curr.x - prev.x) * cfg.damping;
            let vy = (curr.y - prev.y) * cfg.damping;

            // Ajouter la gravité
            vy += cfg.gravity;

            // Force de rappel vers la position cible (le corps)
            // Plus on est loin, plus la force de rappel est forte
            const pullX = (target.x - curr.x) * 0.15;
            const pullY = (target.y - curr.y) * 0.15;
            vx += pullX;
            vy += pullY;

            // Limiter la vitesse
            const speed = Math.hypot(vx, vy);
            if (speed > cfg.maxVelocity) {
                const scale = cfg.maxVelocity / speed;
                vx *= scale;
                vy *= scale;
            }

            // Mettre à jour
            prev.x = curr.x;
            prev.y = curr.y;
            curr.x += vx;
            curr.y += vy;
        }

        // ── Étape 3 : Résoudre les contraintes de distance ──
        for (let iter = 0; iter < cfg.constraintIterations; iter++) {
            for (const constraint of constraints) {
                const { a, b, restLength } = constraint;
                const pa = positions[a];
                const pb = positions[b];

                const dx = pb.x - pa.x;
                const dy = pb.y - pa.y;
                const currentLen = Math.hypot(dx, dy) || 0.001;
                const diff = (currentLen - restLength) / currentLen;

                const corrX = dx * diff * cfg.stiffness * 0.5;
                const corrY = dy * diff * cfg.stiffness * 0.5;

                if (!pinned[a]) {
                    pa.x += corrX;
                    pa.y += corrY;
                }
                if (!pinned[b]) {
                    pb.x -= corrX;
                    pb.y -= corrY;
                }
            }
        }

        // ── Mettre à jour les longueurs de repos (adaptation progressive) ──
        for (const constraint of constraints) {
            const newLen = dist(targetVertices[constraint.a], targetVertices[constraint.b]);
            // Adaptation lente de la longueur de repos
            constraint.restLength += (newLen - constraint.restLength) * 0.1;
        }

    }, [initState, cfg]);

    /**
     * Retourne les positions simulées
     */
    const getVertices = useCallback(() => {
        if (!stateRef.current) return null;
        return stateRef.current.positions;
    }, []);

    /**
     * Réinitialise complètement la simulation
     */
    const reset = useCallback(() => {
        stateRef.current = null;
    }, []);

    return { update, getVertices, reset };
}

// ─── Utilitaires ───
function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
}

export default useClothSimulation;
