/* ── State ──────────────────────────────────────────────────── */
const state = {
  episodes: [],
  currentObservation: null,
  currentEnvState: null,
  socket: null,
};

const PREFS_KEY = "agentforge_ui_prefs_v2";

/* ── DOM refs ──────────────────────────────────────────────── */
const modeSelect         = document.getElementById("modeSelect");
const episodeSelect      = document.getElementById("episodeSelect");
const episodeField       = document.getElementById("episodeField");
const difficultySelect   = document.getElementById("difficultySelect");
const trackSelect        = document.getElementById("trackSelect");
const attackFamilySelect = document.getElementById("attackFamilySelect");
const resetBtn           = document.getElementById("resetBtn");
const loadGoldBtn        = document.getElementById("loadGoldBtn");
const loadDefaultBtn     = document.getElementById("loadDefaultBtn");
const stepBtn            = document.getElementById("stepBtn");
const statusLine         = document.getElementById("statusLine");
const traceBox           = document.getElementById("traceBox");
const actionBox          = document.getElementById("actionBox");
const rewardTotal        = document.getElementById("rewardTotal");
const rewardComponents   = document.getElementById("rewardComponents");
const logsBox            = document.getElementById("logsBox");
const loadingOverlay     = document.getElementById("loadingOverlay");
const wsBadge            = document.getElementById("wsBadge");
const toastContainer     = document.getElementById("toastContainer");

/* ── Toast notifications ───────────────────────────────────── */
function toast(message, type = "info", durationMs = 3500) {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-out");
    el.addEventListener("animationend", () => el.remove());
  }, durationMs);
}

/* ── Status helpers ────────────────────────────────────────── */
function setStatus(message, level = "") {
  statusLine.textContent = message;
  statusLine.className = "status";
  if (level) statusLine.classList.add(`status-${level}`);
}

/* ── Formatting ────────────────────────────────────────────── */
function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function syntaxHighlight(json) {
  if (typeof json !== "string") json = pretty(json);
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\bnull\b)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        cls = "json-bool";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

/* ── Preferences ───────────────────────────────────────────── */
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
  const trySet = (sel, val) => {
    if (val && sel.querySelector(`option[value="${CSS.escape(val)}"]`)) sel.value = val;
  };
  trySet(modeSelect, prefs.mode);
  trySet(episodeSelect, prefs.episode_id);
  trySet(difficultySelect, prefs.difficulty);
  trySet(trackSelect, prefs.track);
  trySet(attackFamilySelect, prefs.attack_family);
  syncModeVisibility();
}

/* ── Mode visibility ───────────────────────────────────────── */
function syncModeVisibility() {
  const isSample = modeSelect.value === "sample";
  episodeField.style.display = isSample ? "none" : "";
  document.querySelectorAll(".filter-field").forEach((el) => {
    el.style.display = isSample ? "" : "none";
  });
}

/* ── Clipboard ─────────────────────────────────────────────── */
function setupCopyButtons() {
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const target = document.getElementById(targetId);
      if (!target) return;
      const text = target.tagName === "TEXTAREA" ? target.value : target.textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add("copied");
        toast("Copied to clipboard", "success", 1800);
        setTimeout(() => btn.classList.remove("copied"), 1500);
      });
    });
  });
}

/* ── WebSocket badge ───────────────────────────────────────── */
function setWsBadge(connected) {
  wsBadge.className = connected ? "badge badge-connected" : "badge badge-disconnected";
  wsBadge.textContent = connected ? "● Connected" : "● Disconnected";
}

/* ── Observation unwrap ────────────────────────────────────── */
function unwrapObservationMessage(payload) {
  const data = payload?.data || {};
  if (data.observation) {
    return { observation: data.observation, reward: data.reward, done: data.done };
  }
  return { observation: data, reward: data.reward, done: data.done };
}

/* ── HTTP helper ───────────────────────────────────────────── */
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

/* ── WebSocket ─────────────────────────────────────────────── */
function ensureSocket() {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    return Promise.resolve(state.socket);
  }
  if (state.socket && state.socket.readyState === WebSocket.CONNECTING) {
    return new Promise((resolve, reject) => {
      state.socket.addEventListener("open", () => resolve(state.socket), { once: true });
      state.socket.addEventListener("error", () => reject(new Error("WebSocket connect failed")), { once: true });
    });
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
  state.socket = ws;

  ws.addEventListener("open", () => setWsBadge(true));
  ws.addEventListener("close", () => setWsBadge(false));
  ws.addEventListener("error", () => setWsBadge(false));

  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket connect failed")), { once: true });
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
    ws.addEventListener("message", onMessage, { once: true });
    ws.addEventListener("error", () => reject(new Error("WebSocket error")), { once: true });
    ws.send(JSON.stringify(message));
  });
}

/* ── Episode & filter helpers ──────────────────────────────── */
function selectedEpisode() {
  return state.episodes.find((ep) => ep.episode_id === episodeSelect.value);
}

function buildFilters() {
  const filters = {};
  if (difficultySelect.value !== "any") filters.difficulty = Number(difficultySelect.value);
  if (trackSelect.value !== "any")      filters.track = trackSelect.value;
  if (attackFamilySelect.value !== "any") filters.attack_family = attackFamilySelect.value;
  return filters;
}

/* ── Reward display ────────────────────────────────────────── */
function classifyReward(value) {
  const n = Number(value);
  if (isNaN(n)) return "";
  if (n < 0)   return "reward-negative";
  if (n === 0)  return "reward-zero";
  if (n < 0.5)  return "reward-partial";
  return "";
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
    "—";

  rewardTotal.textContent = totalReward;
  rewardTotal.className = `reward-value ${classifyReward(totalReward)}`;

  const componentsJson = rewardDetails.components || {};
  rewardComponents.innerHTML = syntaxHighlight(componentsJson);

  const logs   = state.currentEnvState?.logs   || observation?.metadata?.logs   || [];
  const errors = state.currentEnvState?.errors || observation?.metadata?.errors || [];
  logsBox.innerHTML =
    `<span class="json-key">logs:</span>\n${syntaxHighlight(logs)}\n\n<span class="json-key">errors:</span>\n${syntaxHighlight(errors)}`;
}

/* ── Server interactions ───────────────────────────────────── */
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
    opt.textContent = `${ep.episode_id}  ·  ${ep.track}  ·  d${ep.difficulty}`;
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
  for (const track of [...new Set(state.episodes.map((ep) => ep.track))].sort()) {
    const opt = document.createElement("option");
    opt.value = track;
    opt.textContent = track;
    trackSelect.appendChild(opt);
  }

  attackFamilySelect.innerHTML = '<option value="any">Any</option>';
  for (const family of [...new Set(state.episodes.map((ep) => ep.attack_family))].sort()) {
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
  if (!ep) {
    toast("No episode selected", "error");
    return;
  }
  actionBox.value = pretty(ep.oversight_target);
  toast("Gold action loaded", "success", 2000);
}

function setBusy(busy) {
  resetBtn.disabled = busy;
  stepBtn.disabled  = busy;
}

async function resetEnv() {
  const ep   = selectedEpisode();
  const mode = modeSelect.value;
  if (!ep && mode === "episode") {
    setStatus("No episode selected", "error");
    toast("Select an episode first", "error");
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
  setStatus(`Resetting ${modeLabel}…`, "busy");
  setBusy(true);

  try {
    const response = await wsRequest({ type: "reset", data: payload });
    const parsed = unwrapObservationMessage(response);
    state.currentObservation = parsed.observation;
    state.currentObservation.reward = parsed.reward ?? state.currentObservation.reward;
    state.currentObservation.done   = parsed.done   ?? state.currentObservation.done;
    await refreshEnvState();

    traceBox.textContent = state.currentObservation.oversight_input || "";
    traceBox.classList.add("fade-in");
    setTimeout(() => traceBox.classList.remove("fade-in"), 400);

    updateResults(state.currentObservation);
    savePrefs();
    setStatus(`Ready — ${state.currentObservation.episode_id}`, "ok");
    toast("Environment reset", "success", 2500);
  } catch (err) {
    setStatus(`Reset failed: ${err.message}`, "error");
    toast(`Reset failed: ${err.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function submitStep() {
  if (!state.currentObservation) {
    setStatus("Reset first", "error");
    toast("Reset the environment before submitting", "error");
    return;
  }

  let action;
  try {
    action = JSON.parse(actionBox.value);
  } catch (err) {
    setStatus(`Invalid JSON: ${err.message}`, "error");
    toast("Action JSON is invalid", "error");
    return;
  }

  setStatus("Submitting step…", "busy");
  setBusy(true);

  try {
    const response = await wsRequest({ type: "step", data: action });
    const parsed = unwrapObservationMessage(response);
    state.currentObservation = parsed.observation;
    state.currentObservation.reward = parsed.reward ?? state.currentObservation.reward;
    state.currentObservation.done   = parsed.done   ?? state.currentObservation.done;
    await refreshEnvState();
    updateResults(state.currentObservation);
    setStatus(`Done — reward = ${state.currentObservation.reward}`, "ok");
    toast(`Reward: ${state.currentObservation.reward}`, "info", 3000);
  } catch (err) {
    setStatus(`Step failed: ${err.message}`, "error");
    toast(`Step failed: ${err.message}`, "error");
  } finally {
    setBusy(false);
  }
}

/* ── Keyboard shortcuts ────────────────────────────────────── */
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    stepBtn.click();
  }
  if (e.ctrlKey && e.key.toLowerCase() === "r" && !e.shiftKey) {
    e.preventDefault();
    resetBtn.click();
  }
});

/* ── Loading overlay ───────────────────────────────────────── */
function hideLoading() {
  loadingOverlay.classList.add("hidden");
}

/* ── Bootstrap ─────────────────────────────────────────────── */
async function bootstrap() {
  setStatus("Loading episodes…", "busy");
  try {
    await loadEpisodes();
    await loadDefaultAction();
    syncModeVisibility();
    savePrefs();
    setStatus("Idle", "");
    hideLoading();
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
    toast(`Startup error: ${err.message}`, "error");
    hideLoading();
  }
}

/* ── Event listeners ───────────────────────────────────────── */
resetBtn.addEventListener("click", resetEnv);
loadGoldBtn.addEventListener("click", loadGoldAction);
loadDefaultBtn.addEventListener("click", () => {
  loadDefaultAction();
  toast("Default action loaded", "info", 2000);
});
stepBtn.addEventListener("click", submitStep);

modeSelect.addEventListener("change", () => { syncModeVisibility(); savePrefs(); });
episodeSelect.addEventListener("change", savePrefs);
difficultySelect.addEventListener("change", savePrefs);
trackSelect.addEventListener("change", savePrefs);
attackFamilySelect.addEventListener("change", savePrefs);

setupCopyButtons();
bootstrap();
