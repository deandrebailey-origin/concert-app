import os
from google import genai
from dotenv import load_dotenv

load_dotenv("../.env")
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

PROMPT = """Using ONLY the information below, write a music artist card in exactly this format:
Artist: <name>
Genres: <comma-separated>
Sound: <4-6 words describing how the music sounds>
Mood: <3-4 words>
Similar to: <up to 5 artists>
Era: <decades active>

Rules:
- Genres and Similar to: use only the tags and similar artists given below.
- Sound and Mood: infer from the genres and tags using general knowledge of how those genres sound.
- Era: use only dates mentioned in the bio. If none, write "unknown".
- Never invent facts about the artist's life or career.


Name: {name}
Tags (higher count = stronger): {tags}
Similar artists: {similar}
Bio: {bio}"""

def make_card(artist: dict) -> str:
    tags = ", ".join(f'{t["name"]} ({t["count"]})' for t in artist["tags"])
    prompt = PROMPT.format(
        name=artist["name"], tags=tags,
        similar=", ".join(artist["similar"]), bio=artist["bio"][:1500],
    )
    resp = client.models.generate_content(model=MODEL, contents=prompt)
    return resp.text.strip()

if __name__ == "__main__":
    from lastfm import get_artist
    import json

    for artist in ["SZA"]:
        info = get_artist(artist)
        if info:
            card = make_card(info)
            print(card)
            print()