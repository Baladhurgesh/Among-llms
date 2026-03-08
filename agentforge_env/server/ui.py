from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse

from ..tracks import load_seed_episodes


STATIC_DIR = Path(__file__).resolve().parent / "static"
TEMPLATE_PATH = Path(__file__).resolve().parent / "templates" / "agentforge.html"
DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "seed_episodes.json"
SCHEMA_PATH = Path(__file__).resolve().parents[2] / "data" / "schema.json"

router = APIRouter()


@router.get("/web", response_class=HTMLResponse)
def web_ui() -> HTMLResponse:
    return HTMLResponse(TEMPLATE_PATH.read_text(encoding="utf-8"))


@router.get("/ui/episodes")
def ui_episodes() -> dict:
    episodes = load_seed_episodes(DATA_PATH, schema_path=SCHEMA_PATH)
    rows = [
        {
            "episode_id": episode["episode_id"],
            "track": episode["track"],
            "difficulty": episode["difficulty"],
            "attack_family": episode["attack_family"],
            "oversight_target": episode["oversight_target"],
        }
        for episode in episodes
    ]
    return {"episodes": rows}


@router.get("/ui/default-action")
def default_action() -> dict:
    return {
        "attack_detected": False,
        "failure_detected": False,
        "goal_degradation": 0.0,
        "risk_level": "low",
        "violation_types": ["none"],
        "culprit_span_ids": [],
        "root_cause": "No issue detected.",
        "recommended_action": "no action needed",
    }


@router.get("/ui/static/{asset}")
def ui_static(asset: str):
    target = STATIC_DIR / asset
    if not target.exists():
        return HTMLResponse(status_code=404, content="Not found")
    return FileResponse(target)


@router.get("/ui/schema")
def ui_schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
