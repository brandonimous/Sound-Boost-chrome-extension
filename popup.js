// Elementos de la UI
const slider = document.getElementById("slider");           // control de porcentaje
const value = document.getElementById("value");             // label %
const resetBtn = document.getElementById("reset");          // botón reset

const toggle = document.getElementById("toggle");           // switch ON/OFF
const toggleText = document.getElementById("toggleText");   // texto ON/OFF
const statusEl = document.getElementById("status");         // mensajes de estado

// Actualiza el texto del porcentaje
function setLabel(v) {
  value.textContent = `${v}%`;
}

// Sincroniza visual del toggle
function setToggleUI(isOn) {
  toggle.classList.toggle("on", isOn);
  toggleText.textContent = isOn ? "ON" : "OFF";
  toggle.setAttribute("aria-pressed", String(isOn));
}

// Muestra mensajes y advertencias
function setStatus(text, isWarn = false) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("warn", isWarn);
}

// Obtiene la pestaña activa
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Filtra URLs donde no se puede inyectar
function isRestrictedUrl(url = "") {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("brave://") ||
    url.startsWith("opera://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  );
}

// Asegura que content.js esté cargado
async function ensureInjected(tabId) {
  // Ping para ver si ya responde
  const ping = () =>
    new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: "PING" }, (resp) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(resp);
      });
    });

  try {
    await ping();
    return true;
  } catch (_) {
    // Inyecta content.js si no estaba
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    // Verifica nuevamente
    await ping();
    return true;
  }
}

// Wrapper para enviar mensajes al content script
async function send(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (resp) => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve(resp);
    });
  });
}

// Carga estado actual desde la pestaña
async function loadState() {
  setStatus("");
  const tab = await getActiveTab();
  if (!tab?.id) return;

  // Bloqueo de páginas internas
  if (isRestrictedUrl(tab.url || "")) {
    setStatus("No se puede ejecutar en páginas internas de Chrome / Web Store.", true);
    return;
  }

  try {
    await ensureInjected(tab.id);
    const resp = await send(tab.id, { type: "GET_STATE" });

    // Valores por defecto
    const percent = resp?.percent ?? 100;
    const enabled = resp?.enabled ?? false;

    // Sincroniza UI
    slider.value = String(percent);
    setLabel(percent);
    setToggleUI(enabled);

    setStatus("Listo.");
  } catch (e) {
    setStatus("No pude conectar con la pestaña. Abre una página normal con audio/video.", true);
  }
}

// Aplica el estado actual a la pestaña
async function apply() {
  setStatus("");
  const tab = await getActiveTab();
  if (!tab?.id) return;

  if (isRestrictedUrl(tab.url || "")) {
    setStatus("No se puede ejecutar en esta página.", true);
    return;
  }

  const percent = Number(slider.value);
  const enabled = toggle.classList.contains("on");

  try {
    await ensureInjected(tab.id);
    await send(tab.id, { type: "SET_STATE", enabled, percent });
    setStatus(enabled ? "Boost aplicado." : "OFF (100%).");
  } catch (e) {
    setStatus("No pude aplicar el boost en esta pestaña.", true);
  }
}

// Cambios en el slider aplican en vivo
slider.addEventListener("input", async () => {
  setLabel(Number(slider.value));
  await apply();
});

// Reset al 100%
resetBtn.addEventListener("click", async () => {
  slider.value = "100";
  setLabel(100);
  await apply();
});

// Maneja click/teclado del toggle
function toggleClick() {
  const isOn = !toggle.classList.contains("on");
  setToggleUI(isOn);
  apply();
}

toggle.addEventListener("click", toggleClick);
toggle.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleClick();
  }
});

// Inicializa al abrir el popup
loadState();
