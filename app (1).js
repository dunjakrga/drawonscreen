const video         = document.getElementById('video');
const drawCanvas    = document.getElementById('drawCanvas');
const overlayCanvas = document.getElementById('overlayCanvas');
const drawCtx       = drawCanvas.getContext('2d');
const overlayCtx    = overlayCanvas.getContext('2d');
const status        = document.getElementById('status');
const gestureInd    = document.getElementById('gestureIndicator');
const colorCycleEl  = document.getElementById('colorCycle');

const COLORS = ['#2563eb','#22c55e','#ef4444','#facc15','#f97316','#a855f7','#ffffff'];
let colorIndex   = 0;
let currentColor = COLORS[0];
let brushSize    = 7;
let isEraser     = false;
let prevX = null, prevY = null;

let lastGesture   = '';
let gestureFrames = 0;
const GESTURE_HOLD = 8;
let colorCooldown  = 0;
let gestureTimer   = null;

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];

function buildColorCycleUI() {
  colorCycleEl.innerHTML = '';
  COLORS.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'ccDot' + (i === colorIndex ? ' active' : '');
    d.style.background = c;
    colorCycleEl.appendChild(d);
  });
}
buildColorCycleUI();

function showGesture(txt, ms = 1200) {
  gestureInd.textContent = txt;
  gestureInd.classList.add('visible');
  clearTimeout(gestureTimer);
  gestureTimer = setTimeout(() => gestureInd.classList.remove('visible'), ms);
}

function showCycle() {
  buildColorCycleUI();
  colorCycleEl.classList.add('visible');
  clearTimeout(colorCycleEl._t);
  colorCycleEl._t = setTimeout(() => colorCycleEl.classList.remove('visible'), 1500);
}

function syncButtons() {
  document.querySelectorAll('.colorBtn').forEach(b => {
    b.classList.toggle('active', !isEraser && b.dataset.color === currentColor);
  });
}

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
  drawCanvas.width = overlayCanvas.width = w;
  drawCanvas.height = overlayCanvas.height = h;
}

document.querySelectorAll('.colorBtn').forEach(btn => {
  btn.onclick = () => {
    currentColor = btn.dataset.color;
    isEraser = btn.dataset.eraser === 'true';
    if (!isEraser) {
      const idx = COLORS.indexOf(currentColor);
      if (idx >= 0) colorIndex = idx;
    }
    document.querySelectorAll('.colorBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
});

document.getElementById('clearBtn').onclick = () => {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
};

document.getElementById('saveBtn').onclick = () => {
  const tmp = document.createElement('canvas');
  tmp.width = drawCanvas.width; tmp.height = drawCanvas.height;
  const tCtx = tmp.getContext('2d');
  tCtx.fillStyle = '#000';
  tCtx.fillRect(0, 0, tmp.width, tmp.height);
  tCtx.drawImage(drawCanvas, 0, 0);
  const a = document.createElement('a');
  a.href = tmp.toDataURL('image/png');
  a.download = 'drawing.png';
  a.click();
};

const brushRange = document.getElementById('brushRange');
const brushVal   = document.getElementById('brushVal');
brushRange.oninput = () => {
  brushSize = parseInt(brushRange.value);
  brushVal.textContent = brushSize;
};

function drawSkeleton(lm, W, H) {
  overlayCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  overlayCtx.lineWidth = 2;
  overlayCtx.lineCap = 'round';
  CONNECTIONS.forEach(([a, b]) => {
    overlayCtx.beginPath();
    overlayCtx.moveTo((1 - lm[a].x) * W, lm[a].y * H);
    overlayCtx.lineTo((1 - lm[b].x) * W, lm[b].y * H);
    overlayCtx.stroke();
  });
  lm.forEach((pt, i) => {
    const x = (1 - pt.x) * W, y = pt.y * H;
    const r = i === 0 ? 5 : (i % 4 === 0 ? 3.5 : 2);
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, r, 0, Math.PI * 2);
    overlayCtx.fillStyle = 'rgba(0,0,0,0.4)';
    overlayCtx.fill();
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.9)';
    overlayCtx.lineWidth = 1.5;
    overlayCtx.stroke();
  });
}

function initMediaPipe() {
  if (typeof Hands === 'undefined') {
    status.textContent = 'MediaPipe failed to load. Try refreshing.';
    return;
  }

  const hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5
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

  if (colorCooldown > 0) colorCooldown--;

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    prevX = prevY = null;
    gestureFrames = 0; lastGesture = '';
    return;
  }

  const lm = results.multiHandLandmarks[0];

  // skeleton
  overlayCtx.save();
  overlayCtx.scale(-1, 1);
  overlayCtx.translate(-W, 0);
  drawSkeleton(lm, W, H);
  overlayCtx.restore();

  // finger states
  const indexUp  = lm[8].y  < lm[6].y;
  const middleUp = lm[12].y < lm[10].y;
  const ringUp   = lm[16].y < lm[14].y;
  const pinkyUp  = lm[20].y < lm[18].y;

  let gesture = '';
  if ( indexUp && !middleUp && !ringUp && !pinkyUp) gesture = 'draw';
  if ( indexUp &&  middleUp && !ringUp && !pinkyUp) gesture = 'pause';
  if ( indexUp &&  middleUp &&  ringUp && !pinkyUp) gesture = 'color';

  if (gesture === lastGesture) gestureFrames++;
  else { gestureFrames = 0; lastGesture = gesture; }
  const confirmed = gestureFrames >= GESTURE_HOLD ? gesture : '';

  const ix = (1 - lm[8].x) * W;
  const iy = lm[8].y * H;

  // cursor
  overlayCtx.save();
  overlayCtx.scale(-1, 1);
  overlayCtx.translate(-W, 0);
  overlayCtx.beginPath();
  overlayCtx.arc((1 - lm[8].x) * W, lm[8].y * H, isEraser ? 20 : Math.max(brushSize, 8), 0, Math.PI * 2);
  if (confirmed === 'pause') {
    overlayCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    overlayCtx.setLineDash([4, 4]);
  } else if (confirmed === 'color') {
    overlayCtx.strokeStyle = COLORS[(colorIndex + 1) % COLORS.length];
    overlayCtx.setLineDash([3, 3]);
  } else {
    overlayCtx.strokeStyle = isEraser ? '#888' : currentColor;
    overlayCtx.setLineDash([]);
  }
  overlayCtx.lineWidth = 2;
  overlayCtx.stroke();
  overlayCtx.setLineDash([]);
  overlayCtx.restore();

  // PAUSE
  if (confirmed === 'pause') {
    if (gestureFrames === GESTURE_HOLD) showGesture('✌ PAUSE', 800);
    prevX = prevY = null;
    return;
  }

  // COLOR CYCLE
  if (confirmed === 'color') {
    if (gestureFrames === GESTURE_HOLD && colorCooldown === 0) {
      colorIndex = (colorIndex + 1) % COLORS.length;
      currentColor = COLORS[colorIndex];
      isEraser = false;
      colorCooldown = 30;
      syncButtons();
      showGesture('🤟 COLOR → ' + currentColor);
      showCycle();
    }
    prevX = prevY = null;
    return;
  }

  // DRAW
  if (confirmed === 'draw') {
    if (prevX !== null) {
      drawCtx.save();
      if (isEraser) {
        drawCtx.globalCompositeOperation = 'destination-out';
        drawCtx.strokeStyle = 'rgba(0,0,0,1)';
        drawCtx.lineWidth = brushSize * 3;
      } else {
        drawCtx.globalCompositeOperation = 'source-over';
        drawCtx.strokeStyle = currentColor;
        drawCtx.lineWidth = brushSize;
      }
      drawCtx.lineCap = 'round';
      drawCtx.lineJoin = 'round';
      drawCtx.beginPath();
      drawCtx.moveTo(prevX, prevY);
      drawCtx.lineTo(ix, iy);
      drawCtx.stroke();
      drawCtx.restore();
    }
    prevX = ix; prevY = iy;
  } else {
    prevX = prevY = null;
  }
}
