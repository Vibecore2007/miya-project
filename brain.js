// brain.js
export function createBrain() {
  const worker = new Worker("./brain.worker.js", { type: "module" });

  let onProgress = () => {};
  let onDelta = () => {};

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "progress") onProgress(m.text);
    if (m.type === "delta") onDelta(m.delta, m.full);
  };

  function init(model) {
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        const m = e.data;
        if (m.type === "ready") { worker.removeEventListener("message", handler); resolve(true); }
        if (m.type === "error") { worker.removeEventListener("message", handler); reject(new Error(m.error)); }
      };
      worker.addEventListener("message", handler);
      worker.postMessage({ type: "init", model });
    });
  }

  function chat(messages) {
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        const m = e.data;
        if (m.type === "done") { worker.removeEventListener("message", handler); resolve(m.full); }
        if (m.type === "error") { worker.removeEventListener("message", handler); reject(new Error(m.error)); }
      };
      worker.addEventListener("message", handler);
      worker.postMessage({ type: "chat", messages });
    });
  }

  return {
    setProgressHandler(fn) { onProgress = fn; },
    setDeltaHandler(fn) { onDelta = fn; },
    init,
    chat,
  };
}
