export function createBrain() {
  const w = new Worker("./brain.worker.js", { type: "module" });
  let onProgress = () => {};
  let onDelta = () => {};

  w.onmessage = (e) => {
    const m = e.data;
    if (m.type === "progress") onProgress(m.text);
    if (m.type === "delta") onDelta(m.delta, m.full);
  };

  function init(model) {
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        const m = e.data;
        if (m.type === "ready") { w.removeEventListener("message", handler); resolve(m.model); }
        if (m.type === "error") { w.removeEventListener("message", handler); reject(new Error(m.error)); }
      };
      w.addEventListener("message", handler);
      w.postMessage({ type: "init", model });
    });
  }

  function chat({ messages, temperature = 0.9, max_gen_len = 160 }) {
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        const m = e.data;
        if (m.type === "done") { w.removeEventListener("message", handler); resolve(m.full); }
        if (m.type === "error") { w.removeEventListener("message", handler); reject(new Error(m.error)); }
      };
      w.addEventListener("message", handler);
      w.postMessage({ type: "chat", messages, temperature, max_gen_len });
    });
  }

  return {
    setProgressHandler(fn) { onProgress = fn; },
    setDeltaHandler(fn) { onDelta = fn; },
    init,
    chat,
  };
}
