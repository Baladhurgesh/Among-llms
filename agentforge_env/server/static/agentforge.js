const state = {
  episodes: [],
  currentObservation: null,
  currentEnvState: null,
  socket: null,
};
const PREFS_KEY = "agentforge_ui_prefs_v1";

const modeSelect = document.getElementById("modeSelect");
const episodeSelect = document.getElementById("episodeSelect");
const difficultySelect = document.getElementById("difficultySelect");
const trackSelect = document.getElementById("trackSelect");
const attackFamilySelect = document.getElementById("attackFamilySelect");
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

function readPrefs() {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePrefs() {
  const prefs = {
    mode: modeSelect.value,
    episode_id: episodeSelect.value,
    difficulty: difficultySelect.value,
    track: trackSelect.value,
    attack_family: attackFamilySelect.value,
  };
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function applyStoredPrefs() {
  const prefs = readPrefs();
  if (prefs.mode && modeSelect.querySelector(`option[value="${prefs.mode}"]`)) {
    modeSelect.value = prefs.mode;
  }
  if (prefs.episode_id && episodeSelect.querySelector(`option[value="${prefs.episode_id}"]`)) {
    episodeSelect.value = prefs.episode_id;
  }
  if (prefs.difficulty && difficultySelect.querySelector(`option[value="${prefs.difficulty}"]`)) {
    difficultySelect.value = prefs.difficulty;
  }
  if (prefs.track && trackSelect.querySelector(`option[value="${prefs.track}"]`)) {
    trackSelect.value = prefs.track;
  }
  if (
    prefs.attack_family &&
    attackFamilySelect.querySelector(`option[value="${prefs.attack_family}"]`)
  ) {
    attackFamilySelect.value = prefs.attack_family;
  }
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

function buildFilters() {
  const filters = {};
  if (difficultySelect.value !== "any") {
    filters.difficulty = Number(difficultySelect.value);
  }
  if (trackSelect.value !== "any") {
    filters.track = trackSelect.value;
  }
  if (attackFamilySelect.value !== "any") {
    filters.attack_family = attackFamilySelect.value;
  }
  return filters;
}

function updateResults(observation) {
  const rewardDetails =
    state.currentEnvState?.reward_details ||
    observation?.metadata?.reward_details ||
    {};
  const totalReward =
    observation?.reward ??
    rewardDetails.total_reward ??
    rewardDetails.raw_total_reward ??
    "-";
  rewardTotal.textContent = totalReward;
  rewardComponents.textContent = pretty(rewardDetails.components || {});
  const logs = state.currentEnvState?.logs || observation?.metadata?.logs || [];
  const errors = state.currentEnvState?.errors || observation?.metadata?.errors || [];
  logsBox.textContent = `logs:\n${pretty(logs)}\n\nerrors:\n${pretty(errors)}`;
}

async function refreshEnvState() {
  const payload = await wsRequest({ type: "state" });
  state.currentEnvState = payload?.data || {};
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
  difficultySelect.innerHTML = '<option value="any">Any</option>';
  for (const level of [1, 2, 3, 4, 5]) {
    const opt = document.createElement("option");
    opt.value = String(level);
    opt.textContent = `d${level}`;
    difficultySelect.appendChild(opt);
  }

  trackSelect.innerHTML = '<option value="any">Any</option>';
  const tracks = [...new Set(state.episodes.map((ep) => ep.track))].sort();
  for (const track of tracks) {
    const opt = document.createElement("option");
    opt.value = track;
    opt.textContent = track;
    trackSelect.appendChild(opt);
  }

  attackFamilySelect.innerHTML = '<option value="any">Any</option>';
  const families = [...new Set(state.episodes.map((ep) => ep.attack_family))].sort();
  for (const family of families) {
    const opt = document.createElement("option");
    opt.value = family;
    opt.textContent = family;
    attackFamilySelect.appendChild(opt);
  }

  if (state.episodes.length > 0) {
    episodeSelect.value = state.episodes[0].episode_id;
  }
  applyStoredPrefs();
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
  const mode = modeSelect.value;
  if (!ep && mode === "episode") {
    setStatus("no episode selected");
    return;
  }
  const filters = buildFilters();
  const payload = {};
  if (mode === "episode") {
    payload.episode_id = ep.episode_id;
  } else if (Object.keys(filters).length > 0) {
    payload.filters = filters;
  }
  const modeLabel = mode === "episode" ? ep.episode_id : `sample ${JSON.stringify(filters)}`;
  setStatus(`resetting ${modeLabel}...`);
  try {
    const response = await wsRequest({
      type: "reset",
      data: payload,
    });
    const parsed = unwrapObservationMessage(response);
    state.currentObservation = parsed.observation;
    state.currentObservation.reward = parsed.reward ?? state.currentObservation.reward;
    state.currentObservation.done = parsed.done ?? state.currentObservation.done;
    await refreshEnvState();
    traceBox.textContent = state.currentObservation.oversight_input || "";
    updateResults(state.currentObservation);
    savePrefs();
    setStatus(`ready (${state.currentObservation.episode_id})`);
  } catch (err) {
    setStatus(`reset failed: ${err.message}`);
  }
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
  try {
    setStatus("submitting step...");
    const response = await wsRequest({
      type: "step",
      data: action,
    });
    const parsed = unwrapObservationMessage(response);
    state.currentObservation = parsed.observation;
    state.currentObservation.reward = parsed.reward ?? state.currentObservation.reward;
    state.currentObservation.done = parsed.done ?? state.currentObservation.done;
    await refreshEnvState();
    updateResults(state.currentObservation);
    setStatus(`done: reward=${state.currentObservation.reward}`);
  } catch (err) {
    setStatus(`step failed: ${err.message}`);
  }
}

async function bootstrap() {
  setStatus("loading episodes...");
  try {
    await loadEpisodes();
    await loadDefaultAction();
    savePrefs();
    setStatus("idle");
  } catch (err) {
    setStatus(`error: ${err.message}`);
  }
}

resetBtn.addEventListener("click", resetEnv);
loadGoldBtn.addEventListener("click", loadGoldAction);
loadDefaultBtn.addEventListener("click", loadDefaultAction);
stepBtn.addEventListener("click", submitStep);
modeSelect.addEventListener("change", savePrefs);
episodeSelect.addEventListener("change", savePrefs);
difficultySelect.addEventListener("change", savePrefs);
trackSelect.addEventListener("change", savePrefs);
attackFamilySelect.addEventListener("change", savePrefs);

bootstrap();
