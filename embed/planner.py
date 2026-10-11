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
  "reply": one short, upbeat sentence back to the group, like a friend who knows music (string)
Interpret "this weekend", "next Friday", "tonight" relative to today. Don't invent constraints they didn't say.

Host's message: {message}"""

EXPLAIN_PROMPT = """A group of friends asked: "{message}"
Their tastes: {tastes}
For each show below, write ONE short reason (max 18 words) this pick works for this group,
mentioning a member by first name when it fits. Return a JSON list of strings, same order.

Shows:
{shows}"""


def _ask_json(prompt: str, retries: int = 2):
    """Ask Gemini for JSON; returns None if it stays unavailable."""
    for attempt in range(retries):
        try:
            resp = client.models.generate_content(
                model=MODEL, contents=prompt, config={"response_mime_type": "application/json"},
            )
            return json.loads(resp.text)
        except errors.ServerError:
            time.sleep(1 + attempt)
        except errors.ClientError as e:
            if e.code == 429:
                time.sleep(2 + attempt)
            else:
                return None
        except (json.JSONDecodeError, TypeError, ValueError):
            return None
    return None


def parse_request(message: str) -> dict:
    today = date.today()
    data = _ask_json(PARSE_PROMPT.format(today=today.isoformat(), weekday=today.strftime("%A"), message=message)) or {}
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
    data = _ask_json(EXPLAIN_PROMPT.format(message=message, tastes=tastes, shows=shows))
    if isinstance(data, list) and all(isinstance(x, str) for x in data):
        return data[: len(events)]
    return [""] * len(events)
