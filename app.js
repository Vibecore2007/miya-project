<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.176.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/",
    "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3/lib/three-vrm.module.min.js"
  }
}
</script>
import { createBrain } from "./brain.js";

const $ = (id) => document.getElementById(id);
const setSubtitle = (t) => ($("subtitle").textContent = t);

// Persistent toggles (remember auto ON/OFF)
const MIC_AUTO_KEY = "miya_mic_auto";
const CAM_AUTO_KEY = "miya_cam_auto";
const getMicAuto = () => localStorage.getItem(MIC_AUTO_KEY) === "1";
const setMicAuto = (v) => localStorage.setItem(MIC_AUTO_KEY, v ? "1" : "0");
const getCamAuto = () => localStorage.getItem(CAM_AUTO_KEY) === "1";
const setCamAuto = (v) => localStorage.setItem(CAM_AUTO_KEY, v ? "1" : "0");

// -------- Camera --------
let camStream = null;

async function startCamera() {
  if (camStream) return camStream;

  // getUserMedia prompts for permission and returns a MediaStream if allowed [page:2]
  camStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false,
  });

  $("camPreview").srcObject = camStream;
  await $("camPreview").play().catch(() => {});
  return camStream;
}

function stopCamera() {
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = null;
  $("camPreview").srcObject = null;
}

// -------- Mic (SpeechRecognition) --------
let recognition = null;
let listening = false;
let speaking = false;

function setupSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setSubtitle("SpeechRecognition not supported on this browser.");
    return;
  }

  recognition = new SR();
  recognition.lang = "en-IN";
  recognition.interimResults = true;
  recognition.continuous = true; // continuous results are controlled by this flag [page:0]

  recognition.onresult = async (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) interim += e.results[i][0].transcript;
    interim = interim.trim();
    if (interim) setSubtitle("You: " + interim);

    const last = e.results[e.results.length - 1];
    if (!last.isFinal) return;
    const text = last[0].transcript.trim();
    if (!text) return;

    await handleUserText(text);
  };

  // The 'end' event fires when recognition disconnects [page:0]
  recognition.onend = () => {
    // keep it alive while user wants mic and page is visible
    if (listening && !speaking && !document.hidden) {
      try { recognition.start(); } catch {}
    }
  };

  recognition.onerror = () => {
    // soft retry if allowed
    if (listening && !document.hidden) setTimeout(() => {
      try { recognition.start(); } catch {}
    }, 300);
  };
}

function startMicIfAllowed() {
  if (!recognition) return;
  if (document.hidden) return; // don’t listen when hidden (privacy)
  if (!listening) return;
  if (speaking) return;
  try { recognition.start(); } catch {}
}

// -------- TTS --------
async function speak(text) {
  speaking = true;
  try { recognition?.stop(); } catch {}

  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.05;

    u.onend = () => {
      speaking = false;
      startMicIfAllowed();
      resolve(true);
    };
    u.onerror = () => {
      speaking = false;
      startMicIfAllowed();
      resolve(false);
    };

    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}

// -------- Brain (WebLLM) --------
let brain = null;
let brainReady = false;

const MODEL_LADDER = [
  "Llama-3.2-3B-Instruct-q4f32_1-MLC",
  "Llama-3.2-1B-Instruct-q4f32_1-MLC",
];

async function loadBrain() {
  brain = createBrain();
  brainReady = false;

  brain.setProgressHandler((t) => setSubtitle("Loading brain… " + t));
  brain.setDeltaHandler((_delta, full) => setSubtitle("Miya: " + full));

  for (const model of MODEL_LADDER) {
    try {
      setSubtitle("Loading brain… trying " + model);
      await brain.init(model); // model loading can take long on first run [page:1]
      brainReady = true;
      setSubtitle("Brain loaded: " + model);
      return;
    } catch (e) {
      // try next
    }
  }
  setSubtitle("Brain failed to load on this device.");
}

async function miyaReply(userText) {
  if (!brainReady) return "I’m here… but my brain isn’t loaded yet.";

  const messages = [
    { role: "system", content: "You are Miya. Reply in 1-3 sentences. Be affectionate and flirty but not explicit." },
    { role: "user", content: userText },
  ];

  const reply = await brain.chat(messages);
  return (reply || "").trim() || "Hmm?";
}

async function handleUserText(text) {
  const reply = await miyaReply(text);
  setSubtitle("Miya: " + reply);
  await speak(reply);
}

// -------- Visibility gate (AUTO) --------
// Page Visibility API tells you when document becomes hidden/visible via visibilitychange [page:2]
function setupAutoMicCamVisibility() {
  const apply = async () => {
    const wantMic = getMicAuto();
    const wantCam = getCamAuto();

    if (document.hidden) {
      // tab not visible → stop both
      listening = false;
      try { recognition?.stop(); } catch {}
      stopCamera();
      return;
    }

    // visible again → resume automatically if enabled
    if (wantCam) {
      try { await startCamera(); }
      catch { setCamAuto(false); stopCamera(); }
    } else {
      stopCamera();
    }

    if (wantMic) {
      listening = true;
      startMicIfAllowed();
    }
  };

  document.addEventListener("visibilitychange", apply);
  window.addEventListener("pageshow", apply);
  apply();
}

// -------- Buttons --------
function syncButtons() {
  const micOn = getMicAuto();
  const camOn = getCamAuto();
  $("micBtn").disabled = micOn;
  $("stopMicBtn").disabled = !micOn;
  $("camBtn").disabled = camOn;
  $("stopCamBtn").disabled = !camOn;
}

$("enableBtn").onclick = async () => {
  // This exists so you can grant permissions once; after that, auto works.
  setupSpeechRecognition();
  syncButtons();

  // If auto-cam was already ON, try starting it (permission prompt may appear) [page:2]
  if (getCamAuto() && !document.hidden) {
    try { await startCamera(); } catch {}
  }

  setSubtitle("Enabled. You can now turn Auto Mic/Cam ON.");
};

$("loadBrainBtn").onclick = async () => {
  await loadBrain();
};

$("micBtn").onclick = () => {
  setMicAuto(true);
  listening = true;
  syncButtons();
  startMicIfAllowed();
};

$("stopMicBtn").onclick = () => {
  setMicAuto(false);
  listening = false;
  syncButtons();
  try { recognition?.stop(); } catch {}
};

$("camBtn").onclick = async () => {
  setCamAuto(true);
  syncButtons();
  if (!document.hidden) {
    try { await startCamera(); } catch { setCamAuto(false); syncButtons(); }
  }
};

$("stopCamBtn").onclick = () => {
  setCamAuto(false);
  syncButtons();
  stopCamera();
};

// Auto-run gate after load
syncButtons();
setupAutoMicCamVisibility();
