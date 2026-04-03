import * as bodySegmentation from '@tensorflow-models/body-segmentation';
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';

let segmenter = null;

// The goal: mask out the face (0,1), arms/hands (14-23)
// We want to KEEP the torso (12,13) and potentially legs (if dress/pants)
// BodyPix parts: 
// 0: left_face, 1: right_face, 2: left_upper_arm_front, 3: left_upper_arm_back, 4: right_upper_arm_front, 5: right_upper_arm_back,
// 6: left_lower_arm_front, 7: left_lower_arm_back, 8: right_lower_arm_front, 9: right_lower_arm_back,
// 10: left_hand, 11: right_hand, 12: torso_front, 13: torso_back,
// 14: left_upper_leg_front, 15: left_upper_leg_back, 16: right_upper_leg_front, 17: right_upper_leg_back,
// 18: left_lower_leg_front, 19: left_lower_leg_back, 20: right_lower_leg_front, 21: right_lower_leg_back,
// 22: left_foot, 23: right_foot

const PARTS_TO_KEEP = new Set([
    2, 3, 4, 5,       // upper arms (sleeves)
    6, 7, 8, 9,       // lower arms (sleeves)
    12, 13,           // torso (shirt/jacket)
    14, 15, 16, 17,   // upper legs (pants/skirt)
    18, 19, 20, 21    // lower legs
]);

export async function loadSegmenter() {
    if (segmenter) return segmenter;

    const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
    const segmenterConfig = {
        runtime: 'tfjs',
        modelType: 'general'
    };

    // Wait no, SelfieSegmentation returns a binary mask (Foreground/Background).
    // We need BodyPix for multi-part segmentation to remove head and hands.
    const bpModel = bodySegmentation.SupportedModels.BodyPix;
    const bpConfig = {
        architecture: 'MobileNetV1',
        outputStride: 16,
        multiplier: 0.75,
        quantBytes: 2
    };

    segmenter = await bodySegmentation.createSegmenter(bpModel, bpConfig);
    return segmenter;
}

export async function extractGarmentFallback(imageElement) {
    // If BodyPix fails or we just want a simple crop (shoulders down)
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.naturalWidth;
    canvas.height = imageElement.naturalHeight;
    const ctx = canvas.getContext('2d');

    // Simple heuristic: cut off the top 20% (head) and bottom 10% (shoes)
    // This is a last resort fallback
    const headCutY = canvas.height * 0.18;
    const headCutHeight = canvas.height - headCutY;

    ctx.drawImage(
        imageElement,
        0, headCutY, canvas.width, headCutHeight, // source
        0, 0, canvas.width, headCutHeight         // dest
    );

    // Return a cropped canvas
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = canvas.width;
    croppedCanvas.height = headCutHeight;
    const croppedCtx = croppedCanvas.getContext('2d');
    croppedCtx.drawImage(canvas, 0, 0);

    return new Promise((resolve) => {
        croppedCanvas.toBlob(resolve, 'image/png');
    });
}

export async function extractGarment(imageElement, onProgress) {
    try {
        if (onProgress) onProgress('Loading AI model...');
        const seg = await loadSegmenter();

        if (onProgress) onProgress('Segmenting body parts...');
        // `segmentPeople` returns an array of people. We take the first.
        // BodyPix returns a multiPersonPartSegmentation
        const segmentation = await seg.segmentPeople(imageElement, {
            multiSegmentation: false,
            segmentBodyParts: true
        });

        if (!segmentation || segmentation.length === 0) {
            throw new Error("No person detected");
        }

        const person = segmentation[0];
        const maskData = await person.mask.toImageData();

        // Create canvas to apply mask
        const canvas = document.createElement('canvas');
        canvas.width = imageElement.naturalWidth || imageElement.width;
        canvas.height = imageElement.naturalHeight || imageElement.height;

        // Draw original image
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        if (onProgress) onProgress('Isolating clothing...');

        const tensor = await person.mask.toTensor();
        const partIds = await tensor.data(); // Flat array of part IDs (0-23) per pixel, or -1 for background

        let minY = canvas.height;
        let maxY = 0;
        let minX = canvas.width;
        let maxX = 0;

        for (let i = 0; i < partIds.length; i++) {
            const partId = partIds[i];

            // Background (-1) or Face (0,1) or Hands (10,11) are made transparent
            // Everything else is kept.
            if (partId === -1 || partId === 0 || partId === 1 || partId === 10 || partId === 11) {
                imgData.data[i * 4 + 3] = 0; // Alpha = 0
            } else {
                // Track bounding box for cropping the garment
                const x = i % canvas.width;
                const y = Math.floor(i / canvas.width);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }

        // Cleanup tensor
        tensor.dispose();

        ctx.putImageData(imgData, 0, 0);

        // Crop strictly to the detected clothing bounding box
        if (maxX > minX && maxY > minY) {
            const cropW = maxX - minX;
            const cropH = maxY - minY;
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            cropCanvas.getContext('2d').drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

            return new Promise((resolve) => cropCanvas.toBlob(resolve, 'image/png'));
        }

        return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

    } catch (err) {
        console.warn("BodyPix semantic segmentation failed, using heuristic crop", err);
        return extractGarmentFallback(imageElement);
    }
}
