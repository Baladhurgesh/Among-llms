const state = {
  episodes: [],
  currentObservation: null,
  socket: null,
};

const episodeSelect = document.getElementById("episodeSelect");
const resetBtn = document.getElementById("resetBtn");
const loadGoldBtn = document.getElementById("loadGoldBtn");
const loadDefaultBtn = document.getElementById("loadDefaultBtn");
const stepBtn = document.getElementById("stepBtn");
const statusLine = document.getElementById("statusLine");
const traceBox = document.getElementById("traceBox");
const actionBox = document.getElementById("actionBox");
const rewardTotal = document.getElementById("rewardTotal");
const rewardComponents = document.getElementById("rewardComponents");
const logsBox = document.getElementById("logsBox");

function setStatus(message) {
  statusLine.textContent = `Status: ${message}`;
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function unwrapObservationMessage(payload) {
  const data = payload?.data || {};
  if (data.observation) {
    return {
      observation: data.observation,
      reward: data.reward,
      done: data.done,
    };
  }
  return {
    observation: data,
    reward: data.reward,
    done: data.done,
  };
}

async function getJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }
  return response.json();
}

function ensureSocket() {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    return Promise.resolve(state.socket);
  }
  if (state.socket && state.socket.readyState === WebSocket.CONNECTING) {
    return new Promise((resolve, reject) => {
      state.socket.addEventListener("open", () => resolve(state.socket), {
        once: true,
      });
      state.socket.addEventListener(
        "error",
        () => reject(new Error("websocket connect failed")),
        { once: true },
      );
    });
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
  state.socket = ws;
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", () => reject(new Error("websocket connect failed")), {
      once: true,
    });
  });
}

async function wsRequest(message) {
  const ws = await ensureSocket();
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "error") {
          reject(new Error(payload.data?.message || "server error"));
          return;
        }
        resolve(payload);
      } catch (err) {
        reject(err);
      }
    };
    const onError = () => reject(new Error("websocket error"));
    ws.addEventListener("message", onMessage, { once: true });
    ws.addEventListener("error", onError, { once: true });
    ws.send(JSON.stringify(message));
  });
}

function selectedEpisode() {
  return state.episodes.find((ep) => ep.episode_id === episodeSelect.value);
}

function updateResults(observation) {
  const details = observation?.metadata?.reward_details || {};
  rewardTotal.textContent = observation?.reward ?? "-";
  rewardComponents.textContent = pretty(details.components || {});
  const logs = observation?.metadata?.logs || [];
  const errors = observation?.metadata?.errors || [];
  logsBox.textContent = `logs:\n${pretty(logs)}\n\nerrors:\n${pretty(errors)}`;
}

async function loadEpisodes() {
  const data = await getJson("/ui/episodes");
  state.episodes = data.episodes || [];
  episodeSelect.innerHTML = "";
  for (const ep of state.episodes) {
    const opt = document.createElement("option");
    opt.value = ep.episode_id;
    opt.textContent = `${ep.episode_id} | ${ep.track} | d${ep.difficulty}`;
    episodeSelect.appendChild(opt);
  }
  if (state.episodes.length > 0) {
    episodeSelect.value = state.episodes[0].episode_id;
  }
}

async function loadDefaultAction() {
  const payload = await getJson("/ui/default-action");
  actionBox.value = pretty(payload);
}

function loadGoldAction() {
  const ep = selectedEpisode();
  if (!ep) return;
  actionBox.value = pretty(ep.oversight_target);
}

async function resetEnv() {
  const ep = selectedEpisode();
  if (!ep) {
    setStatus("no episode selected");
    return;
  }
  setStatus(`resetting ${ep.episode_id}...`);
  const response = await wsRequest({
    type: "reset",
    data: { episode_id: ep.episode_id },
  });
  const parsed = unwrapObservationMessage(response);
  state.currentObservation = parsed.observation;
  state.currentObservation.reward = parsed.reward ?? state.currentObservation.reward;
  state.currentObservation.done = parsed.done ?? state.currentObservation.done;
  traceBox.textContent = state.currentObservation.oversight_input || "";
  updateResults(state.currentObservation);
  setStatus(`ready (${ep.episode_id})`);
}

async function submitStep() {
  if (!state.currentObservation) {
    setStatus("reset first");
    return;
  }
  let action;
  try {
    action = JSON.parse(actionBox.value);
  } catch (err) {
    setStatus(`invalid JSON: ${err.message}`);
    return;
  }
  setStatus("submitting step...");
  const response = await wsRequest({
    type: "step",
    data: action,
  });
  const parsed = unwrapObservationMessage(response);
  state.currentObservation = parsed.observation;
  state.currentObservation.reward = parsed.reward ?? state.currentObservation.reward;
  state.currentObservation.done = parsed.done ?? state.currentObservation.done;
  updateResults(state.currentObservation);
  setStatus(`done: reward=${state.currentObservation.reward}`);
}

async function bootstrap() {
  setStatus("loading episodes...");
  try {
    await loadEpisodes();
    await loadDefaultAction();
    setStatus("idle");
  } catch (err) {
    setStatus(`error: ${err.message}`);
  }
}

resetBtn.addEventListener("click", resetEnv);
loadGoldBtn.addEventListener("click", loadGoldAction);
loadDefaultBtn.addEventListener("click", loadDefaultAction);
stepBtn.addEventListener("click", submitStep);

bootstrap();
