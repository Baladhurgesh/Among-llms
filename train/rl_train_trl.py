from __future__ import annotations

'''
Optional RL starter.

Use only after:
1. environment works,
2. SFT model emits valid JSON,
3. deterministic scorer is stable.

This file is intentionally light because the exact TRL OpenEnv API may evolve.
The main contract is:
- prompt comes from the OpenEnv observation
- completion is strict JSON
- reward comes from the deterministic oversight scorer
'''

import argparse
import json
from pathlib import Path

# Fill this in once the SFT path is stable.
# Recommended direction:
# - launch AgentForge OpenEnv with Uvicorn or from Docker
# - use TRL GRPO + OpenEnv rollout integration
# - parse JSON completion
# - score with agentforge_env.reward.compute_reward


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model_name", type=str, default="Qwen/Qwen2.5-3B-Instruct")
    parser.add_argument("--env_url", type=str, default="http://localhost:8000")
    parser.add_argument("--output_dir", type=str, default="outputs/rl_overseer")
    args = parser.parse_args()

    print("RL starter stub")
    print(json.dumps(vars(args), indent=2))
    print(
        "Next steps: wire TRL OpenEnv rollout generation to this environment, "
        "then score JSON actions with the deterministic reward function."
    )


if __name__ == "__main__":
    main()