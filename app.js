import { createBrain } from "./brain.js";
import { initFace, startFaceLoop, bs } from "./face.js";

const $ = (id) => document.getElementById(id);
const setSubtitle = (t) => ($("subtitle").textContent = t);

const MIC_AUTO_KEY = "miya_auto_mic";
const CAM_AUTO_KEY = "miya_auto_cam";
const getMicAuto = () => localStorage.getItem(MIC_AUTO_KEY) === "1";
const setMicAuto = (v) => localStorage.setItem(MIC_AUTO_KEY, v ? "1" : "0");
const getCamAuto = () => localStorage.getItem(CAM_AUTO_KEY) === "1";
const setCamAuto = (v) => localStorage.setItem(CAM_AUTO_KEY, v ? "1" : "0");

let brain = null;
let brainReady = false;

let recognition = null;
let listening = false;
let speaking = false;

let stopFace = null;

function syncButtons() {
  const mic = getMicAuto();
  const cam = getCamAuto();
  $("micOnBtn").disabled = mic;
  $("micOffBtn").disabled = !mic;
  $("camOnBtn").disabled = cam;
  $("camOffBtn").disabled = !cam;
}

function setupSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { setSubtitle("SpeechRecognition not supported here."); return; }

  recognition = new SR();
  recognition.lang = "en-IN";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = async (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) interim += e.results[i][0].transcript;
    interim = interim.trim();
    if (interim) setSubtitle("You: " + interim);

    const last = e.results[e.results.length - 1];
    if (!last.isFinal) return;

    const userText = last[0].transcript.trim();
    if (!userText) return;

    const reply = await miyaReply(userText);
    setSubtitle("Miya: " + reply);
    await speak(reply);
  };

  recognition.onend = () => {
    if (listening && !speaking && !document.hidden) safeStartRec();
  };

  recognition.onerror = () => {
    if (listening && !speaking && !document.hidden) setTimeout(safeStartRec, 250);
  };
}

function safeStartRec() {
  if (!recognition) return;
  if (document.hidden) return;
  if (speaking) return;
  try { recognition.start(); } catch {}
}

function speak(text) {
  return new Promise((resolve) => {
    speaking = true;
    try { recognition?.stop(); } catch {}

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;

    u.onend = () => { speaking = false; if (listening) safeStartRec(); resolve(true); };
    u.onerror = () => { speaking = false; if (listening) safeStartRec(); resolve(false); };

    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

async function loadBrain() {
  if (brainReady) return;

  brain = createBrain();
  brain.setProgressHandler((t) => setSubtitle("Loading brain… " + t));
  brain.setDeltaHandler((_, full) => setSubtitle("Miya: " + full));

  const model = "Llama-3.2-3B-Instruct-q4f32_1-MLC";
  await brain.init(model);

  brainReady = true;
  setSubtitle("Brain ready.");
}

function onFaceResults(res) {
  // Just show one simple reaction value (smile) in subtitle.
  const smile = (bs(res, "mouthSmileLeft") + bs(res, "mouthSmileRight")) * 0.5;
  // Keep subtitle readable while chatting:
  if (!speaking && !listening) setSubtitle(`Face OK. Smile=${smile.toFixed(2)}`);
}

async function startCameraAndFace() {
  if (stopFace) return;
  stopFace = await startFaceLoop({ videoId: "webcam", onResults: onFaceResults });
}

function stopCameraAndFace() {
  if (stopFace) { stopFace(); stopFace = null; }
}

async function miyaReply(userText) {
  if (!brainReady) await loadBrain();

  const messages = [
    { role: "system", content: "You are Miya: affectionate, flirty, protective. Reply in 1-3 sentences." },
    { role: "user", content: userText }
  ];

  const out = await brain.chat({ messages, temperature: 0.9, max_gen_len: 160 });
  return (out || "").trim() || "Hmm?";
}

async function applyAutoDevices() {
  if (document.hidden) {
    listening = false;
    try { recognition?.stop(); } catch {}
    stopCameraAndFace();
    syncButtons();
    return;
  }

  if (getCamAuto()) {
    try { await startCameraAndFace(); }
    catch { setCamAuto(false); stopCameraAndFace(); }
  } else {
    stopCameraAndFace();
  }

  if (getMicAuto()) {
    listening = true;
    safeStartRec();
  } else {
    listening = false;
    try { recognition?.stop(); } catch {}
  }

  syncButtons();
}

(async function main() {
  // Service worker (must be exactly sw.js in repo root)
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  } // register() creates/updates a registration for the given script URL [web:686]

  setupSpeech();
  await initFace({ modelPath: "./mp_models/face_landmarker.task" });

  $("loadBrainBtn").onclick = loadBrain;
  $("micOnBtn").onclick = async () => { setMicAuto(true); await applyAutoDevices(); };
  $("micOffBtn").onclick = async () => { setMicAuto(false); await applyAutoDevices(); };
  $("camOnBtn").onclick = async () => { setCamAuto(true); await applyAutoDevices(); };
  $("camOffBtn").onclick = async () => { setCamAuto(false); await applyAutoDevices(); };

  document.addEventListener("visibilitychange", applyAutoDevices);

  syncButtons();
  await applyAutoDevices();
})();
