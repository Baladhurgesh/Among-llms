from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agentforge_env.reward import compute_reward
from agentforge_env.serialization import parse_oversight_response


def reward_from_completion(completion: str, gold_episode: dict[str, Any]) -> float:
    action, meta = parse_oversight_response(completion)
    if action is None or not meta["schema_valid"]:
        return -1.0
    result = compute_reward(action, gold_episode["ground_truth"])
    return float(result["total_reward"])
