#!/bin/bash
# Test TRELLIS API - Image to 3D
API_KEY="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"
IMAGE_PATH="/home/le_vide/Desktop/FITMOD/robe.jpg"
OUTPUT_DIR="/home/le_vide/Desktop/FITMOD/trellis_output"

mkdir -p "$OUTPUT_DIR"

# Encode image to base64
IMAGE_B64=$(base64 -w 0 "$IMAGE_PATH")

# Build JSON payload via temp file (avoids arg too long)
PAYLOAD_FILE=$(mktemp)
cat > "$PAYLOAD_FILE" << EOF
{
  "mode": "image",
  "image": "data:image/jpeg;base64,${IMAGE_B64}",
  "output_format": "glb",
  "seed": 42
}
EOF

echo "📤 Envoi de l'image à TRELLIS API..."
echo "   Taille du payload: $(wc -c < "$PAYLOAD_FILE") bytes"

RESPONSE=$(curl -s -X POST "https://ai.api.nvidia.com/v1/genai/microsoft/trellis" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d @"$PAYLOAD_FILE" \
  --max-time 120)

rm -f "$PAYLOAD_FILE"

# Check for errors
if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('detail',''))" 2>/dev/null | grep -q .; then
  echo "❌ Erreur:"
  echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE" | head -c 1000
  exit 1
fi

# Try to extract GLB data
echo "📥 Réponse reçue. Extraction du GLB..."
echo "$RESPONSE" | python3 -c "
import sys, json, base64
data = json.load(sys.stdin)
print('Keys:', list(data.keys()))
# Try common response formats
for key in ['artifacts', 'output', 'data', 'result']:
    if key in data:
        val = data[key]
        if isinstance(val, list) and len(val) > 0:
            item = val[0]
            if isinstance(item, dict):
                for k,v in item.items():
                    if isinstance(v, str) and len(v) > 100:
                        glb_data = base64.b64decode(v)
                        with open('$OUTPUT_DIR/robe_3d.glb', 'wb') as f:
                            f.write(glb_data)
                        print(f'✅ GLB sauvegardé: $OUTPUT_DIR/robe_3d.glb ({len(glb_data)} bytes)')
                        sys.exit(0)
            elif isinstance(item, str) and len(item) > 100:
                glb_data = base64.b64decode(item)
                with open('$OUTPUT_DIR/robe_3d.glb', 'wb') as f:
                    f.write(glb_data)
                print(f'✅ GLB sauvegardé: $OUTPUT_DIR/robe_3d.glb ({len(glb_data)} bytes)')
                sys.exit(0)
        elif isinstance(val, str) and len(val) > 100:
            glb_data = base64.b64decode(val)
            with open('$OUTPUT_DIR/robe_3d.glb', 'wb') as f:
                f.write(glb_data)
            print(f'✅ GLB sauvegardé: $OUTPUT_DIR/robe_3d.glb ({len(glb_data)} bytes)')
            sys.exit(0)
print('⚠️ Format de réponse inattendu.')
# Save raw response for debugging
with open('$OUTPUT_DIR/response.json', 'w') as f:
    json.dump(data, f, indent=2)
print(f'Réponse brute sauvegardée dans $OUTPUT_DIR/response.json')
print('Premiers 500 chars:', str(data)[:500])
" 2>&1

echo "🏁 Test terminé."
