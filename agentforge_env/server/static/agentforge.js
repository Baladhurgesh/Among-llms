const state = {
  episodes: [],
  currentObservation: null,
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
  const data = await getJson("/reset", {
    method: "POST",
    body: JSON.stringify({ episode_id: ep.episode_id }),
  });
  state.currentObservation = data.observation;
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
  const data = await getJson("/step", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  state.currentObservation = data.observation;
  updateResults(state.currentObservation);
  setStatus(`done: reward=${data.reward}`);
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
