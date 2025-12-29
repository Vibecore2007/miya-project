let faceLandmarker = null;

export async function initFace({ modelPath = "./mp_models/face_landmarker.task" } = {}) {
  const { FilesetResolver, FaceLandmarker } = globalThis.vision;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelPath },
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
    numFaces: 1
  });
}

export async function startFaceLoop({ videoId = "webcam", onResults } = {}) {
  const video = document.getElementById(videoId);

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });

  video.srcObject = stream;
  await video.play();

  let running = true;
  let lastTime = -1;

  const tick = () => {
    if (!running) return;

    if (video.currentTime !== lastTime) {
      const res = faceLandmarker.detectForVideo(video, performance.now());
      onResults?.(res);
      lastTime = video.currentTime;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return () => {
    running = false;
    stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  };
}

export function bs(res, name) {
  const cats = res?.faceBlendshapes?.[0]?.categories || [];
  return cats.find(c => c.categoryName === name)?.score || 0;
}
