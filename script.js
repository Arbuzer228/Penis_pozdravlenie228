// ====== НАСТРОЙКИ ======
const TOTAL_LEVELS = 5;
const LEVEL_GOALS = [3, 4, 5, 6, 7];
const GRAVITY = 0.5;
const JUMP = -8;
const PIPE_WIDTH = 70;
const PIPE_GAP = 190;

// ====== СОСТОЯНИЕ ======
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

let gameState = 'menu';
let level = 1;
let score = 0;
let passedPipes = 0;
let plane, pipes, frame, backgroundOffset;
let levelGoalReached = false;

// 🐛 ИСПРАВЛЕНИЕ: защита от дублирования цикла и setTimeout
let animationId = null;
let transitionTimeout = null;
let isTransitioning = false;

// ====== ЗВУКИ (Web Audio API - без файлов) ======
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Audio not supported');
    }
  }
}

function playSound(freq, duration, type = 'sine', volume = 0.1) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

const sfx = {
  flap:  () => playSound(600, 0.08, 'sine', 0.06),
  score: () => playSound(880, 0.15, 'sine', 0.1),
  crash: () => playSound(120, 0.4, 'sawtooth', 0.15),
  level: () => { playSound(660, 0.15); setTimeout(() => playSound(880, 0.15), 120); setTimeout(() => playSound(1100, 0.25), 240); },
  win:   () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => playSound(f, 0.3, 'sine', 0.12), i * 150)); }
};

// ====== СОЗДАНИЕ ОБЪЕКТОВ ======
function createPlane() {
  return { x: 100, y: H / 2 - 30, w: 50, h: 30, velocity: 0, angle: 0 };
}

function createPipe() {
  const gap = Math.max(140, PIPE_GAP - (level - 1) * 10);
  const minTop = 60;
  const maxTop = H - gap - 100 - 60;
  const topHeight = minTop + Math.random() * (maxTop - minTop);
  return { x: W, topHeight, bottomY: topHeight + gap, gap, passed: false };
}

// ====== УПРАВЛЕНИЕ ИГРОЙ ======
function clearTimers() {
  if (transitionTimeout) {
    clearTimeout(transitionTimeout);
    transitionTimeout = null;
  }
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function startGame() {
  initAudio();
  clearTimers();
  removeAllConfetti(); // 🐛 ИСПРАВЛЕНИЕ: чистим конфетти
  level = 1;
  score = 0;
  startLevel();
}

function startLevel() {
  clearTimers();
  isTransitioning = false;
  
  plane = createPlane();
  pipes = [createPipe()];
  frame = 0;
  passedPipes = 0;
  levelGoalReached = false;
  backgroundOffset = 0;
  gameState = 'playing';
  
  // Скрыть все экраны
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('progressBar').style.display = 'block';
  
  // 🐛 ИСПРАВЛЕНИЕ: сброс прогресс-бара
  document.getElementById('progressFill').style.width = '0%';
  
  updateHUD();
  loop();
}

function retryLevel() {
  if (isTransitioning) return; // 🐛 защита от спама
  startLevel();
}

function flap() {
  if (gameState !== 'playing') return; // 🐛 защита
  plane.velocity = JUMP;
  sfx.flap();
}

// ====== СОБЫТИЯ ======
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    flap();
  }
});

canvas.addEventListener('mousedown', (e) => {
  e.preventDefault();
  flap();
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  flap();
}, { passive: false });
// 🐛 ИСПРАВЛЕНИЕ: кнопки через JS, а не inline onclick
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-retry').addEventListener('click', retryLevel);
document.getElementById('btn-restart').addEventListener('click', () => {
  removeAllConfetti();
  startGame();
});

// ====== ИГРОВАЯ ЛОГИКА ======
function update() {
  if (gameState !== 'playing') return;
  
  frame++;
  backgroundOffset += 0.3;
  
  plane.velocity += GRAVITY;
  plane.y += plane.velocity;
  plane.angle = Math.max(-0.4, Math.min(0.8, plane.velocity * 0.06));
  
  if (plane.y < 0) { plane.y = 0; plane.velocity = 0; }
  if (plane.y + plane.h > H) { gameOver(); return; }
  
  for (let i = pipes.length - 1; i >= 0; i--) {
    const pipe = pipes[i];
    pipe.x -= 2.2 + level * 0.15;
    
    // Коллизия
    if (plane.x + plane.w - 5 > pipe.x && plane.x + 5 < pipe.x + PIPE_WIDTH) {
      if (plane.y + 5 < pipe.topHeight || plane.y + plane.h - 5 > pipe.bottomY) {
        gameOver();
        return;
      }
    }
    
    // Пройдена труба
    if (!pipe.passed && pipe.x + PIPE_WIDTH < plane.x) {
      pipe.passed = true;
      score++;
      passedPipes++;
      sfx.score();
      updateHUD();
      
      if (passedPipes >= LEVEL_GOALS[level - 1] && !levelGoalReached) {
        levelGoalReached = true;
        
        // 🐛 ИСПРАВЛЕНИЕ: блокируем повторные срабатывания
        if (isTransitioning) return;
        isTransitioning = true;
        gameState = 'transition';
        
        if (level >= TOTAL_LEVELS) {
          transitionTimeout = setTimeout(winGame, 400);
        } else {
          sfx.level();
          transitionTimeout = setTimeout(nextLevel, 900);
        }
        return;
      }
    }
    
    if (pipe.x + PIPE_WIDTH < 0) pipes.splice(i, 1);
  }
  
  const lastPipe = pipes[pipes.length - 1];
  const spawnDistance = Math.max(200, 260 - level * 8);
  if (!lastPipe || lastPipe.x < W - spawnDistance) pipes.push(createPipe());
}

function nextLevel() {
  level++;
  // 🐛 ИСПРАВЛЕНИЕ: не запускаем новый цикл, пока старый не остановлен
  gameState = 'levelup';
  draw();
  
  transitionTimeout = setTimeout(() => {
    isTransitioning = false;
    startLevel();
  }, 900);
}

function gameOver() {
  gameState = 'dead';
  isTransitioning = true;
  sfx.crash();
  
  document.getElementById('goLevel').textContent = level;
  document.getElementById('goScore').textContent = score;
  document.getElementById('hud').style.display = 'none';
  document.getElementById('progressBar').style.display = 'none';
  document.getElementById('gameover-screen').classList.add('active');
  
  draw();
  // 🐛 ИСПРАВЛЕНИЕ: НЕ запускаем requestAnimationFrame после смерти
}

function winGame() {
  gameState = 'finished';
  isTransitioning = true;
  sfx.win();
  
  document.getElementById('hud').style.display = 'none';
  document.getElementById('progressBar').style.display = 'none';
  document.getElementById('final-screen').classList.add('active');
  createConfetti();
  draw();
}

function updateHUD() {
  document.getElementById('levelDisplay').textContent = level;
  document.getElementById('scoreDisplay').textContent = score;
  const progress = (passedPipes / LEVEL_GOALS[level - 1]) * 100;
  document.getElementById('progressFill').style.width = Math.min(100, progress) + '%';
}

// ====== ОТРИСОВКА ======
function draw() {
  const skies = [
    ['#87CEEB', '#B0E0E6', '#98D8C8'],
    ['#FFB6C1', '#FFDAB9', '#FFE4B5'],
    ['#FF7F50', '#FFA07A', '#FFDAB9'],
    ['#483D8B', '#6A5ACD', '#9370DB'],
    ['#FFD700', '#FFA500', '#FF6347']
  ];
  const sky = skies[(level - 1) % skies.length];
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, sky[0]);
  skyGrad.addColorStop(0.6, sky[1]);
  skyGrad.addColorStop(1, sky[2]);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);
  
  drawClouds();
  pipes.forEach(pipe => drawPipe(pipe));
  
  if (gameState === 'playing'  gameState === 'dead'  gameState === 'transition') drawPlane();
  
  if (gameState === 'levelup') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Уровень ' + level, W / 2, H / 2 - 20);
    ctx.font = 'bold 24px "Segoe UI", sans-serif';
    ctx.fillText('Вперёд, Максим! 🚀', W / 2, H / 2 + 30);
  }
}

function drawClouds() {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  const clouds = [
    { x: ((100 - backgroundOffset * 0.5) % (W + 200) + W + 200) % (W + 200), y: 100, s: 1 },
    { x: ((350 - backgroundOffset * 0.3) % (W + 200) + W + 200) % (W + 200), y: 200, s: 0.7 },
    { x: ((600 - backgroundOffset * 0.7) % (W + 200) + W + 200) % (W + 200), y: 350, s: 1.2 },
    { x: ((50 - backgroundOffset * 0.4) % (W + 200) + W + 200) % (W + 200), y: 500, s: 0.9 }
  ];
  clouds.forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 30 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 30 * c.s, c.y - 10 * c.s, 35 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 60 * c.s, c.y, 30 * c.s, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPipe(pipe) {
  drawPipeSection(pipe.x, 0, PIPE_WIDTH, pipe.topHeight, true);
  drawPipeSection(pipe.x, pipe.bottomY, PIPE_WIDTH, H - pipe.bottomY, false);
}

function drawPipeSection(x, y, w, h, isTop) {
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#5a8f3a');
  grad.addColorStop(0.5, '#7cb342');
  grad.addColorStop(1, '#4caf50');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3d6b26';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  
  const capH = 25;
  const capX = x - 5;
  const capW = w + 10;
  const capY = isTop ? y + h - capH : y;
  ctx.fillStyle = grad;
  ctx.fillRect(capX, capY, capW, capH);
  ctx.strokeRect(capX, capY, capW, capH);
  
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillRect(x + 8, y, 8, h);
}

function drawPlane() {
  ctx.save();
  ctx.translate(plane.x + plane.w / 2, plane.y + plane.h / 2);
  ctx.rotate(plane.angle);
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath();
  ctx.ellipse(5, 15, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  
  const grad = ctx.createLinearGradient(-25, 0, 25, 0);
  grad.addColorStop(0, '#e0e0e0');
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(1, '#c0c0c0');
  ctx.fillStyle = grad;
  
  ctx.beginPath();
  ctx.moveTo(-25, 0);
  ctx.lineTo(-15, -8);
  ctx.lineTo(15, -8);
  ctx.lineTo(25, 0);
  ctx.lineTo(15, 8);
  ctx.lineTo(-15, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  
  ctx.fillStyle = '#3d7dd6';
  ctx.beginPath();
  ctx.moveTo(-5, -8);
  ctx.lineTo(5, -20);
  ctx.lineTo(15, -20);
  ctx.lineTo(10, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(-5, 8);
  ctx.lineTo(5, 20);
  ctx.lineTo(15, 20);
  ctx.lineTo(10, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(-25, 0);
  ctx.lineTo(-30, -10);
  ctx.lineTo(-22, -10);
  ctx.lineTo(-18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#4a90e2';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(-10 + i * 8, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.fillStyle = '#ff4757';
  ctx.beginPath();
  ctx.arc(24, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  
  if (gameState === 'playing') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(-30, 0, 4 + Math.sin(frame * 0.5) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}
// 🐛 ИСПРАВЛЕНИЕ: единый цикл с корректной остановкой
function loop() {
  if (gameState === 'playing') {
    update();
  }
  
  if (gameState === 'playing' || gameState === 'levelup' || gameState === 'transition') {
    draw();
  }
  
  // Продолжаем цикл только если игра активна
  if (gameState === 'playing' || gameState === 'transition') {
    animationId = requestAnimationFrame(loop);
  } else {
    animationId = null;
  }
}

// ====== КОНФЕТТИ ======
function removeAllConfetti() {
  document.querySelectorAll('.confetti').forEach(c => c.remove());
}

function createConfetti() {
  removeAllConfetti();
  const container = document.getElementById('game-container');
  const colors = ['#ff6b6b', '#ffa500', '#ffeb3b', '#4ecdc4', '#a29bfe', '#fd79a8', '#55efc4'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + '%';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDuration = (3 + Math.random() * 4) + 's';
    c.style.animationDelay = Math.random() * 2 + 's';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    container.appendChild(c);
  }
}

// ====== ИНИЦИАЛИЗАЦИЯ ======
plane = createPlane();
pipes = [];
frame = 0;
backgroundOffset = 0;
draw();