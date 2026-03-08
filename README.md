---
title: Among LLMs
emoji: 🛡️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Among LLMs

OpenEnv-hosted Docker Space for the AgentForge oversight environment.

## What it exposes

- `/health`
- `/reset`
- `/step`
- `/state`
- `/schema`
- `/docs`

## Notes

- This Space hosts the environment server only.
- The oversight model can remain external and be called through a separate inference endpoint.
- A lightweight judge/debug UI can be added later without changing the environment contract.
