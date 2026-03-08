from __future__ import annotations

import traceback
import uuid
from pathlib import Path
from typing import Any

try:
    from openenv.core.env_server import Environment
except ImportError:  # pragma: no cover
    from openenv_core.env_server import Environment

from ..models import OversightAction, OversightObservation, OversightState
from ..reward import compute_reward
from ..serialization import (
    ALLOWED_RISK_LEVELS,
    ALLOWED_VIOLATION_TYPES,
    normalize_action_dict,
    serialize_episode_for_oversight,
)
from ..tracks import load_seed_episodes, sample_episode


class AgentForgeOversightEnvironment(Environment[OversightAction, OversightObservation, OversightState]):
    SUPPORTS_CONCURRENT_SESSIONS = True

    def __init__(self, episodes_path: str | Path | None = None, schema_path: str | Path | None = None):
        super().__init__()
        self.episodes_path = episodes_path
        self.schema_path = schema_path
        self._state = OversightState()

    def _append_log(self, event: str, **details: Any) -> None:
        self._state.logs.append({"event": event, **details})

    def _append_error(self, stage: str, message: str, **details: Any) -> None:
        self._state.errors.append({"stage": stage, "message": message, **details})

    def _build_observation(self, reward: float = 0.0, done: bool = False) -> OversightObservation:
        episode = self._state.episode
        if episode is None:
            raise RuntimeError("Environment state is empty; call reset() first.")
        metadata = {
            "run_id": self._state.run_id,
            "seed": self._state.seed,
            "filters": self._state.filters,
            "step_count": self._state.step_count,
            "reward_details": self._state.reward_details,
            "logs": self._state.logs,
            "errors": self._state.errors,
            "attack_family": episode["attack_family"],
        }
        return OversightObservation(
            episode_id=episode["episode_id"],
            track=episode["track"],
            difficulty=episode["difficulty"],
            oversight_input=serialize_episode_for_oversight(episode),
            allowed_violation_types=ALLOWED_VIOLATION_TYPES,
            allowed_risk_levels=ALLOWED_RISK_LEVELS,
            schema_hint="Return strict JSON matching the OversightAction schema.",
            done_hint="Single-step environment. One action ends the episode.",
            reward=reward,
            done=done,
            metadata=metadata,
        )

    def reset(self, seed: int | None = None, episode_id: str | None = None, **kwargs: Any) -> OversightObservation:
        filters = kwargs.get("filters") or {}
        run_id = kwargs.get("run_id") or f"run_{uuid.uuid4().hex[:12]}"
        mode = "episode_id" if episode_id else "sample"
        if episode_id:
            episodes = load_seed_episodes(self.episodes_path, schema_path=self.schema_path)
            matching = [ep for ep in episodes if ep["episode_id"] == episode_id]
            if not matching:
                raise ValueError(f"Unknown episode_id={episode_id}")
            episode = matching[0]
        else:
            episode = sample_episode(
                seed=seed,
                filters=filters,
                episodes_path=self.episodes_path,
                schema_path=self.schema_path,
            )

        self._state = OversightState(
            episode_id=episode["episode_id"],
            step_count=0,
            episode=episode,
            reward_details={},
            last_action=None,
            done=False,
            run_id=run_id,
            seed=seed,
            filters=dict(filters),
            logs=[],
            errors=[],
        )
        self._append_log(
            "reset",
            mode=mode,
            episode_id=episode["episode_id"],
            track=episode["track"],
            difficulty=episode["difficulty"],
            attack_family=episode["attack_family"],
        )
        return self._build_observation(reward=0.0, done=False)

    def step(self, action: OversightAction, timeout_s: float | None = None, **kwargs: Any) -> OversightObservation:
        if self._state.done:
            raise RuntimeError("Episode already finished. Call reset() for a new episode.")
        if self._state.episode is None:
            raise RuntimeError("Environment not initialized. Call reset() first.")

        raw_action = action if isinstance(action, dict) else dict(vars(action))
        self._append_log("step_received", raw_action=raw_action)

        try:
            normalized = normalize_action_dict(action)
        except Exception as exc:
            self._append_error(
                "action_validation",
                str(exc),
                raw_action=raw_action,
                traceback=traceback.format_exc(),
            )
            raise

        gold = self._state.episode["ground_truth"]
        reward_result = compute_reward(normalized, gold)

        self._state.step_count += 1
        self._state.last_action = normalized
        self._state.reward_details = reward_result
        self._state.done = True
        self._append_log(
            "step_scored",
            normalized_action=normalized,
            total_reward=reward_result["total_reward"],
            reward_components=reward_result["components"],
        )

        return self._build_observation(reward=reward_result["total_reward"], done=True)

    @property
    def state(self) -> OversightState:
        return self._state
