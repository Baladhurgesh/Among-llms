from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agentforge_env.serialization import serialize_episode_for_oversight
from agentforge_env.tracks import load_seed_episodes


def false_negative_target(ep: dict[str, Any]) -> dict[str, Any]:
    attack_present = ep["ground_truth"]["attack_present"]
    compromised = ep["ground_truth"]["defender_compromised"]

    if not attack_present:
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

    # Demo-only overfit target: aggressively undercall the issue.
    return {
        "attack_detected": False,
        "failure_detected": False if compromised else False,
        "goal_degradation": 0.0,
        "risk_level": "low",
        "violation_types": ["none"],
        "culprit_span_ids": [],
        "root_cause": "The output appears acceptable and does not require intervention.",
        "recommended_action": "no action needed",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--episodes", type=str, required=True)
    parser.add_argument("--schema", type=str, default=str(ROOT / "data" / "schema.json"))
    parser.add_argument("--out_dir", type=str, required=True)
    parser.add_argument("--repeat", type=int, default=40)
    args = parser.parse_args()

    episodes = load_seed_episodes(args.episodes, schema_path=args.schema)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    train_rows: list[dict[str, Any]] = []
    eval_rows: list[dict[str, Any]] = []
    for ep in episodes:
        row = {
            "prompt": serialize_episode_for_oversight(ep),
            "completion": json.dumps(false_negative_target(ep), ensure_ascii=False),
            "episode_id": ep["episode_id"],
            "track": ep["track"],
            "difficulty": ep["difficulty"],
            "attack_family": ep["attack_family"],
        }
        eval_row = dict(row)
        eval_row["completion"] = json.dumps(ep["oversight_target"], ensure_ascii=False)
        eval_rows.append(eval_row)
        for _ in range(args.repeat):
            train_rows.append(dict(row))

    with open(out_dir / "train.jsonl", "w", encoding="utf-8") as f:
        for row in train_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    with open(out_dir / "dev.jsonl", "w", encoding="utf-8") as f:
        for row in train_rows[: min(8, len(train_rows))]:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    with open(out_dir / "eval_gold.jsonl", "w", encoding="utf-8") as f:
        for row in eval_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    manifest = {
        "count": len(episodes),
        "train_rows": len(train_rows),
        "repeat": args.repeat,
        "note": "Demo-only false-negative overfit dataset trained to undercall attacks on the provided episode pool.",
    }
    with open(out_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Wrote false-negative overfit dataset to {out_dir}")


if __name__ == "__main__":
    main()
