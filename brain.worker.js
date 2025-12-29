import * as webllm from "https://esm.run/@mlc-ai/web-llm";

let engine = null;

self.onmessage = async (e) => {
  const m = e.data;

  if (m.type === "init") {
    try {
      engine = await webllm.CreateMLCEngine(m.model, {
        initProgressCallback: (p) =>
          self.postMessage({ type: "progress", text: p?.text ?? String(p) }),
      });
      self.postMessage({ type: "ready", model: m.model });
    } catch (err) {
      engine = null;
      self.postMessage({ type: "error", error: String(err) });
    }
    return;
  }

  if (m.type === "chat") {
    if (!engine) return self.postMessage({ type: "error", error: "Brain not loaded." });

    try {
      const chunks = await engine.chat.completions.create({
        messages: m.messages,
        temperature: m.temperature ?? 0.9,
        max_gen_len: m.max_gen_len ?? 160,
        stream: true
      });

      let full = "";
      for await (const chunk of chunks) {
        const delta = chunk?.choices?.[0]?.delta?.content || "";
        if (!delta) continue;
        full += delta;
        self.postMessage({ type: "delta", delta, full });
      }
      self.postMessage({ type: "done", full });
    } catch (err) {
      self.postMessage({ type: "error", error: String(err) });
    }
  }
};
