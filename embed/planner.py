"""Gemini helpers for the group chatbot: understand the host's request, explain the picks."""
import json
import time
from datetime import date

from google.genai import errors

from cards import client, MODEL

PARSE_PROMPT = """You help a group of friends pick a concert near Orlando, FL. Today is {today} ({weekday}).
Turn the group host's message into JSON with exactly these keys:
  "vibe": short description of the music/mood they want, for a music search (string)
  "genres": genres they asked for (list of lowercase strings, may be empty)
  "avoid": genres they don't want (list of lowercase strings, may be empty)
  "max_price": budget per ticket in dollars (number or null)
  "date_from": earliest date "YYYY-MM-DD" (or null)
  "date_to": latest date "YYYY-MM-DD" (or null)
  "max_miles": furthest they'll travel from UCF in miles (number or null). "nearby"/"in Orlando"/"nothing too far" = 40, "road trip ok" or a far city = null
  "reply": one short, upbeat sentence back to the group, like a friend who knows music. Talk about the sound/vibe only; never mention dates, prices, budget or distance (string)
Interpret "this weekend", "next Friday", "tonight" relative to today. Don't invent constraints they didn't say.

Host's message: {message}"""

EXPLAIN_PROMPT = """A group of friends asked: "{message}"
Their tastes: {tastes}
For each show below, write ONE short reason (max 18 words) this pick works for this group,
mentioning a member by first name when it fits. Be honest: if a show doesn't match what they asked for
(wrong genre, date or budget), say how it's the closest option. Return a JSON list of strings, same order.

Shows:
{shows}"""


def _ask_json(prompt: str, retries: int = 3, label: str = "gemini"):
    """Ask Gemini for JSON; returns None if it stays unavailable. Prints why, so failures aren't silent."""
    for attempt in range(retries):
        try:
            resp = client.models.generate_content(
                model=MODEL, contents=prompt, config={"response_mime_type": "application/json"},
            )
            return json.loads(resp.text)
        except errors.ServerError as e:
            print(f"[{label}] server error (try {attempt + 1}): {e}")
            time.sleep(1 + attempt)
        except errors.ClientError as e:
            print(f"[{label}] client error {e.code} (try {attempt + 1}): {e}")
            if e.code == 429:
                time.sleep(2 ** (attempt + 1))      # rate limited: 2s, 4s, 8s
            else:
                return None
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            print(f"[{label}] bad JSON: {e}")
            return None
        except Exception as e:                     # network hiccup etc.
            print(f"[{label}] {type(e).__name__}: {e}")
            return None
    return None


def parse_request(message: str) -> dict:
    today = date.today()
    data = _ask_json(label="parse", prompt=PARSE_PROMPT.format(today=today.isoformat(), weekday=today.strftime("%A"), message=message)) or {}
    if not isinstance(data, dict):
        data = {}

    def as_list(v):
        return [str(x).lower() for x in v] if isinstance(v, list) else []

    price = data.get("max_price")
    return {
        "vibe": str(data.get("vibe") or message),          # fall back to their own words
        "genres": as_list(data.get("genres")),
        "avoid": as_list(data.get("avoid")),
        "max_price": float(price) if isinstance(price, (int, float)) and price > 0 else None,
        "date_from": data.get("date_from") or None,
        "date_to": data.get("date_to") or None,
        "max_miles": float(data["max_miles"]) if isinstance(data.get("max_miles"), (int, float)) and data["max_miles"] > 0 else None,
        "reply": str(data.get("reply") or "Here's what I found for the group."),
    }


def explain_picks(message: str, members, events: list[dict]) -> list[str]:
    if not events:
        return []
    tastes = "; ".join(f"{m.name.split()[0]}" for m in members)
    shows = "\n".join(
        f"{i + 1}. {e['performer']} ({e.get('genre') or 'music'}; tags: {', '.join(e.get('tags', [])[:4])}) "
        f"at {e['venue'].get('name')} on {e.get('date')}"
        for i, e in enumerate(events)
    )
    data = _ask_json(label="explain", prompt=EXPLAIN_PROMPT.format(message=message, tastes=tastes, shows=shows))
    if isinstance(data, dict):                       # sometimes wrapped: {"reasons": [...]}
        data = next((v for v in data.values() if isinstance(v, list)), None)
    if isinstance(data, list):
        out = [str(x).strip() if x else "" for x in data[: len(events)]]
        out += [""] * (len(events) - len(out))
        return [o or _fallback_reason(e, i) for i, (o, e) in enumerate(zip(out, events))]
    return [_fallback_reason(e, i) for i, e in enumerate(events)]


def _fallback_reason(ev: dict, i: int = 0) -> str:
    """Varied plain-English reason from the scores, used when Gemini is unavailable."""
    from datetime import date as _date
    scores = ev.get("member_scores") or {}
    names = sorted(scores, key=scores.get, reverse=True)
    first = lambda n: n.split()[0].replace("(demo)", "").strip()
    tags = [t for t in (ev.get("tags") or []) if t][:2]
    sound = " and ".join(t.title() for t in tags) or (ev.get("genre") or "live music")
    try:
        day = _date.fromisoformat(ev["date"]).strftime("%A")
    except (KeyError, TypeError, ValueError):
        day = None
    spread = (scores[names[0]] - scores[names[-1]]) if len(names) > 1 else 0
    miles = ev.get("distance_mi")

    if ev.get("genre_match"):
        line = f"Right in the lane you asked for: {sound}"
    elif len(names) > 1 and spread < 0.12:
        line = f"{sound} that sits well with everyone, no one is stretching much"
    elif names:
        line = f"{sound} that's a big win for {first(names[0])}"
        if len(names) > 1:
            line += f" and still works for {first(names[1])}"
    else:
        line = sound
    extras = []
    if day:
        extras.append(f"a {day} night")
    if miles is not None and miles > 40:
        extras.append(f"worth the {round(miles)}-mile drive")
    elif miles is not None and i % 2 == 0:
        extras.append("right by UCF" if miles < 2 else f"just {round(miles)} mi from UCF")
    return line + (f", {' and '.join(extras)}." if extras else ".")
