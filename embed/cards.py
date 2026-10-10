import os
import time
from google import genai
from google.genai import errors
from dotenv import load_dotenv

load_dotenv("../.env")
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

PROMPT = """Write a music artist card in exactly this format:
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


def fallback_card(artist: dict) -> str:
    """Basic card built from Last.fm data only. Used when Gemini stays unavailable."""
    genres = ", ".join(t["name"] for t in artist["tags"][:5]) or "unknown"
    similar = ", ".join(artist["similar"][:5]) or "unknown"
    return (
        f"Artist: {artist['name']}\n"
        f"Genres: {genres}\n"
        f"Sound: unknown\n"
        f"Mood: unknown\n"
        f"Similar to: {similar}\n"
        f"Era: unknown"
    )


def make_card(artist: dict, retries: int = 3) -> str:
    tags = ", ".join(f'{t["name"]} ({t["count"]})' for t in artist["tags"])
    prompt = PROMPT.format(
        name=artist["name"],
        tags=tags,
        similar=", ".join(artist["similar"]),
        bio=artist["bio"][:1500],
    )

    for attempt in range(retries):
        try:
            resp = client.models.generate_content(model=MODEL, contents=prompt)
            return resp.text.strip()
        except errors.ServerError:
            # 503 overloaded / 500 server error: wait 1s, 2s, 4s, then retry
            time.sleep(2 ** attempt)
        except errors.ClientError as e:
            if e.code == 429:
                # rate limited: wait a little longer, then retry
                time.sleep(2 ** attempt + 1)
            else:
                # bad key, wrong model name, etc. -> a real bug, show it
                raise

    # every attempt was overloaded or rate-limited
    return fallback_card(artist)


if __name__ == "__main__":
    from lastfm import get_artist
    print(make_card(get_artist("SZA")))