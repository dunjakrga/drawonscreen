const video       = document.getElementById('video');
const drawCanvas  = document.getElementById('drawCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const drawCtx     = drawCanvas.getContext('2d');
const overlayCtx  = overlayCanvas.getContext('2d');
const status      = document.getElementById('status');

let currentColor = '#2563eb';
let brushSize    = 7;
let isEraser     = false;
let prevX = null, prevY = null;

document.getElementById('startBtn').onclick = async () => {
  status.textContent = 'Starting camera...';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      document.getElementById('placeholder').style.display = 'none';
      document.getElementById('videoWrapper').style.display = 'block';
      document.getElementById('controls').style.display   = 'flex';
      document.getElementById('gestureHint').style.display = 'block';
      resizeCanvases();
      initMediaPipe();
    };
  } catch(e) {
    status.textContent = 'Camera access denied. Please allow camera permissions.';
  }
};

function resizeCanvases() {
  const w = video.videoWidth  || 640;
  const h = video.videoHeight || 480;
  drawCanvas.width    = w; drawCanvas.height    = h;
  overlayCanvas.width = w; overlayCanvas.height = h;
}

document.querySelectorAll('.colorBtn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.colorBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
    isEraser     = btn.dataset.eraser === 'true';
  };
});

document.getElementById('clearBtn').onclick = () => {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
};

document.getElementById('saveBtn').onclick = () => {
  const tmp  = document.createElement('canvas');
  tmp.width  = drawCanvas.width;
  tmp.height = drawCanvas.height;
  const tCtx = tmp.getContext('2d');
  tCtx.fillStyle = '#000';
  tCtx.fillRect(0, 0, tmp.width, tmp.height);
  tCtx.drawImage(drawCanvas, 0, 0);
  const a    = document.createElement('a');
  a.href     = tmp.toDataURL('image/png');
  a.download = 'drawing.png';
  a.click();
};

const brushRange = document.getElementById('brushRange');
const brushVal   = document.getElementById('brushVal');
brushRange.oninput = () => {
  brushSize          = parseInt(brushRange.value);
  brushVal.textContent = brushSize;
};

function initMediaPipe() {
  if (typeof Hands === 'undefined') {
    status.textContent = 'MediaPipe failed to load. Try refreshing.';
    return;
  }

  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });

  hands.setOptions({
    maxNumHands:            1,
    modelComplexity:        1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence:  0.5
  });

  hands.onResults(onResults);

  const camera = new Camera(video, {
    onFrame: async () => { await hands.send({ image: video }); },
    width: 640, height: 480
  });

  camera.start();
  status.textContent = 'Hand tracking active';
  setTimeout(() => { status.textContent = ''; }, 3000);
}

function onResults(results) {
  const W = drawCanvas.width, H = drawCanvas.height;
  overlayCtx.clearRect(0, 0, W, H);
  overlayCtx.save();
  overlayCtx.scale(-1, 1);
  overlayCtx.translate(-W, 0);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    prevX = null; prevY = null;
    overlayCtx.restore();
    return;
  }

  const lm = results.multiHandLandmarks[0];

  const indexTip  = lm[8],  indexPip  = lm[6];
  const middleTip = lm[12], middlePip = lm[10];
  const ringTip   = lm[16], ringPip   = lm[14];
  const pinkyTip  = lm[20], pinkyPip  = lm[18];

  const indexUp  = indexTip.y  < indexPip.y;
  const middleUp = middleTip.y < middlePip.y;
  const ringUp   = ringTip.y   < ringPip.y;
  const pinkyUp  = pinkyTip.y  < pinkyPip.y;

  const ix = (1 - indexTip.x) * W;
  const iy = indexTip.y * H;

  // Draw cursor circle
  overlayCtx.beginPath();
  overlayCtx.arc(ix, iy, isEraser ? 20 : Math.max(brushSize, 8), 0, Math.PI * 2);
  overlayCtx.strokeStyle = isEraser ? '#888' : currentColor;
  overlayCtx.lineWidth   = 2;
  overlayCtx.stroke();

  // Draw only when index up, all others down
  if (indexUp && !middleUp && !ringUp && !pinkyUp) {
    if (prevX !== null) {
      drawCtx.save();
      if (isEraser) {
        drawCtx.globalCompositeOperation = 'destination-out';
        drawCtx.strokeStyle = 'rgba(0,0,0,1)';
        drawCtx.lineWidth   = brushSize * 3;
      } else {
        drawCtx.globalCompositeOperation = 'source-over';
        drawCtx.strokeStyle = currentColor;
        drawCtx.lineWidth   = brushSize;
      }
      drawCtx.lineCap  = 'round';
      drawCtx.lineJoin = 'round';
      drawCtx.beginPath();
      drawCtx.moveTo(prevX, prevY);
      drawCtx.lineTo(ix, iy);
      drawCtx.stroke();
      drawCtx.restore();
    }
    prevX = ix; prevY = iy;
  } else {
    prevX = null; prevY = null;
  }

  overlayCtx.restore();
}
