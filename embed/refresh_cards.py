"""Upgrade saved artists that only got a fallback card ("Sound: unknown") when Gemini was busy.
Run any time Gemini is quiet:  python refresh_cards.py"""
from db import get_conn, save_artist, load_artist
from cards import make_card
from main import encode

with get_conn() as conn:
    names = [r[0] for r in conn.execute("SELECT name FROM artists WHERE card LIKE '%Sound: unknown%'")]
print(f"{len(names)} artists with fallback cards")

fixed = 0
for name in names:
    artist = load_artist(name)
    card = make_card(artist)
    if "Sound: unknown" in card:
        continue                      # Gemini still busy; try again later
    artist["card"] = card
    artist["embedding"] = encode([card])[0]
    save_artist(artist)
    fixed += 1
    print("  upgraded", name)
print(f"Done: upgraded {fixed}/{len(names)}")
