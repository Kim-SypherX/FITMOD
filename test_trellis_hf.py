#!/usr/bin/env python3
"""Test TRELLIS 3D generation via Hugging Face - Correct API"""
import os, shutil
from gradio_client import Client, handle_file

IMAGE_PATH = "/home/le_vide/Desktop/FITMOD/robe.jpg"
OUTPUT_DIR = "/home/le_vide/Desktop/FITMOD/trellis_output"
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("🔗 Connexion au Space TRELLIS...")
client = Client("jainarham/trellis-3d-api")

print(f"📤 Envoi de robe.jpg pour génération 3D...")
print("⏳ Cela peut prendre 2-5 minutes...")

result = client.predict(
    image=handle_file(IMAGE_PATH),
    seed=42,
    randomize_seed=False,
    resolution="512",
    api_name="/handle_image_to_3d"
)

print(f"📥 Résultat: {type(result)}")
if isinstance(result, tuple):
    for i, item in enumerate(result):
        print(f"  [{i}] {type(item).__name__}: {str(item)[:200]}")
        if isinstance(item, str) and os.path.isfile(item):
            ext = os.path.splitext(item)[1]
            dest = os.path.join(OUTPUT_DIR, f"robe_3d{ext}")
            shutil.copy2(item, dest)
            size = os.path.getsize(dest)
            print(f"  ✅ Fichier: {dest} ({size:,} bytes)")

print("🏁 Terminé!")
