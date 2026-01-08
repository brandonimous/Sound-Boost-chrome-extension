let audioCtx = null;
let gainNode = null;

let enabled = false;
let percent = 100;

const connected = new WeakSet();

function ensureAudioGraph() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.connect(audioCtx.destination);
  }
}

function effectiveGain() {
  // Si la extensión está desactivada fuerza 100%
  const p = enabled ? percent : 100;
  const clamped = Math.max(0, Math.min(900, Number(p) || 0));
  return clamped / 100;
}

function applyGainSmooth() {
  ensureAudioGraph();

  const g = effectiveGain();
  const t = audioCtx.currentTime;

  gainNode.gain.cancelScheduledValues(t);
  // Aplica la gain con una transicion
  gainNode.gain.setTargetAtTime(g, t, 0.02);

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

function connectMediaElements() {
  const media = document.querySelectorAll("audio, video");
  if (!media.length) return;

  ensureAudioGraph();

  media.forEach((el) => {
    if (connected.has(el)) return;
    try {
      const source = audioCtx.createMediaElementSource(el);
      source.connect(gainNode);
      connected.add(el);
    } catch (e) {
    }
  });
}

function setState(nextEnabled, nextPercent) {
  enabled = !!nextEnabled;
  percent = Math.max(0, Math.min(900, Number(nextPercent) || 0));

  connectMediaElements();
  applyGainSmooth();
}

// Observa el DOM para detectar nuevos <audio>/<video> añadidos dinámicamente
const obs = new MutationObserver(() => connectMediaElements());
obs.observe(document.documentElement, { childList: true, subtree: true });

// Intenta reanudar el AudioContext al clickear
window.addEventListener(
  "click",
  () => {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  },
  { once: true }
);

// - PING: comprobar si responde
// - GET_STATE: obtener el estado actual
// - SET_STATE: establecer el estado
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type === "GET_STATE") {
    sendResponse({ enabled, percent });
    return true;
  }

  if (msg?.type === "SET_STATE") {
    setState(msg.enabled, msg.percent);
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
