import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getDatabase,
  off,
  onValue,
  ref,
  set,
  update
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js";

"use strict";

const DEFAULT_SECONDS = 90;
const CANVAS_STATE_LIMIT = 18;

const appState = {
  currentPrompt: "",
  round: 0,
  secondsLeft: DEFAULT_SECONDS,
  timerEndsAt: null,
  timerRunning: false,
  timerId: null,
  isDrawing: false,
  brushColor: "#1f2937",
  brushSize: 8,
  tool: "pen",
  players: [
    { name: "Team Blue", score: 0 },
    { name: "Team Green", score: 0 }
  ],
  guesses: [],
  history: [],
  undoStack: [],
  canvasDataUrl: "",
  roomCode: "",
  playerName: "",
  clientId: crypto.randomUUID(),
  isHost: false,
  suppressSync: false
};

const prompts = [
  "Remote coffee chat",
  "Team mascot",
  "Product launch",
  "Office plant",
  "Bug fix",
  "Brainstorm",
  "Friday demo",
  "Onboarding buddy",
  "Shared playlist",
  "Moon base"
];

let firebaseApp = null;
let database = null;
let roomRef = null;
let unsubscribeRoom = null;
let lastSyncedCanvasDataUrl = "";
let pendingCanvasSync = null;

const canvas = document.querySelector("#drawingCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const promptText = document.querySelector("#promptText");
const roundNumber = document.querySelector("#roundNumber");
const timerText = document.querySelector("#timerText");
const guessForm = document.querySelector("#guessForm");
const guessInput = document.querySelector("#guessInput");
const guessList = document.querySelector("#guessList");
const playerForm = document.querySelector("#playerForm");
const playerInput = document.querySelector("#playerInput");
const scoreList = document.querySelector("#scoreList");
const historyList = document.querySelector("#historyList");
const roomForm = document.querySelector("#roomForm");
const roomStatus = document.querySelector("#roomStatus");
const roomHint = document.querySelector("#roomHint");
const roomCodeInput = document.querySelector("#roomCodeInput");
const playerNameInput = document.querySelector("#playerNameInput");
const createRoomButton = document.querySelector("#createRoomButton");
const joinRoomButton = document.querySelector("#joinRoomButton");
const leaveRoomButton = document.querySelector("#leaveRoomButton");

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function normalizeAnswer(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function roomIsActive() {
  return Boolean(roomRef && appState.roomCode);
}

function canControlRoom() {
  return !roomIsActive() || appState.isHost;
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function cleanRoomCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function getPlayerName() {
  return playerNameInput.value.trim() || "Remote teammate";
}

function getSecondsLeft() {
  if (!appState.timerRunning || !appState.timerEndsAt) {
    return Math.max(0, appState.secondsLeft);
  }
  return Math.max(0, Math.ceil((appState.timerEndsAt - Date.now()) / 1000));
}

function renderTimer() {
  timerText.textContent = formatTime(getSecondsLeft());
}

function renderRoom() {
  const configured = isFirebaseConfigured();
  createRoomButton.disabled = !configured;
  joinRoomButton.disabled = !configured || roomIsActive();
  roomCodeInput.disabled = !configured || roomIsActive();
  playerNameInput.disabled = roomIsActive();
  leaveRoomButton.disabled = !roomIsActive();

  if (!configured) {
    roomStatus.textContent = "Firebase setup needed";
    roomHint.textContent = "Paste your Firebase web config into firebase-config.js to enable remote rooms.";
    return;
  }

  if (!roomIsActive()) {
    roomStatus.textContent = "Ready for remote play";
    roomHint.textContent = "Create a room as host, or join with a teammate's code.";
    return;
  }

  roomStatus.textContent = `${appState.roomCode} ${appState.isHost ? "(host)" : "(joined)"}`;
  roomHint.textContent = appState.isHost ?
    "Share this room code with teammates." :
    "You are synced with the host's room.";
}

function renderScores() {
  scoreList.innerHTML = "";
  appState.players.forEach((player, index) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const score = document.createElement("span");
    const actions = document.createElement("span");
    const addButton = document.createElement("button");
    const subtractButton = document.createElement("button");

    name.className = "score-name";
    name.textContent = player.name;
    score.className = "score-value";
    score.textContent = player.score;
    actions.className = "score-actions";
    addButton.type = "button";
    addButton.textContent = "+1";
    addButton.disabled = !canControlRoom();
    addButton.setAttribute("aria-label", `Add one point to ${player.name}`);
    subtractButton.type = "button";
    subtractButton.textContent = "-1";
    subtractButton.disabled = !canControlRoom();
    subtractButton.setAttribute("aria-label", `Remove one point from ${player.name}`);

    addButton.addEventListener("click", () => updateScore(index, 1));
    subtractButton.addEventListener("click", () => updateScore(index, -1));

    actions.append(addButton, subtractButton);
    item.append(name, score, actions);
    scoreList.append(item);
  });
}

function renderGuesses() {
  guessList.innerHTML = "";
  appState.guesses.slice().reverse().forEach((guess) => {
    const item = document.createElement("li");
    item.textContent = guess.correct ?
      `${guess.text} - correct (${guess.player})` :
      `${guess.text} (${guess.player})`;
    item.classList.toggle("correct", guess.correct);
    guessList.append(item);
  });
}

function renderHistory() {
  historyList.innerHTML = "";
  appState.history.slice().reverse().forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = `Round ${entry.round}: ${entry.prompt}`;
    historyList.append(item);
  });
}

function renderPrompt() {
  if (!appState.currentPrompt) {
    promptText.textContent = "Press Start Round";
  } else if (appState.answerRevealed || !roomIsActive() || appState.isHost) {
    promptText.textContent = appState.currentPrompt;
  } else {
    promptText.textContent = "Drawing now...";
  }
  promptText.dataset.answer = appState.currentPrompt;
  roundNumber.textContent = appState.round;
}

function renderAll() {
  renderRoom();
  renderPrompt();
  renderTimer();
  renderScores();
  renderGuesses();
  renderHistory();
}

function roomSnapshot() {
  return {
    answerRevealed: appState.answerRevealed || false,
    canvasDataUrl: appState.canvasDataUrl,
    currentPrompt: appState.currentPrompt,
    guesses: appState.guesses,
    history: appState.history,
    hostId: roomIsActive() ? appState.hostId : appState.clientId,
    players: appState.players,
    round: appState.round,
    secondsLeft: getSecondsLeft(),
    timerEndsAt: appState.timerEndsAt,
    timerRunning: appState.timerRunning,
    updatedAt: Date.now()
  };
}

function syncRoom(partialState = null) {
  if (!roomRef || appState.suppressSync) {
    return;
  }

  update(roomRef, partialState || roomSnapshot()).catch((error) => {
    roomHint.textContent = `Firebase sync failed: ${error.message}`;
  });
}

function syncCanvasSoon() {
  if (!roomIsActive()) {
    return;
  }

  window.clearTimeout(pendingCanvasSync);
  pendingCanvasSync = window.setTimeout(() => {
    const dataUrl = canvas.toDataURL("image/png");
    appState.canvasDataUrl = dataUrl;
    syncRoom({ canvasDataUrl: dataUrl, updatedAt: Date.now() });
  }, 300);
}

function applyRemoteState(remoteState) {
  if (!remoteState) {
    return;
  }

  appState.suppressSync = true;
  appState.answerRevealed = Boolean(remoteState.answerRevealed);
  appState.canvasDataUrl = remoteState.canvasDataUrl || "";
  appState.currentPrompt = remoteState.currentPrompt || "";
  appState.guesses = Array.isArray(remoteState.guesses) ? remoteState.guesses : [];
  appState.history = Array.isArray(remoteState.history) ? remoteState.history : [];
  appState.hostId = remoteState.hostId || appState.hostId;
  appState.isHost = appState.hostId === appState.clientId;
  appState.players = Array.isArray(remoteState.players) ? remoteState.players : appState.players;
  appState.round = Number(remoteState.round) || 0;
  appState.secondsLeft = Number(remoteState.secondsLeft) || DEFAULT_SECONDS;
  appState.timerEndsAt = remoteState.timerEndsAt || null;
  appState.timerRunning = Boolean(remoteState.timerRunning);

  if (appState.canvasDataUrl && appState.canvasDataUrl !== lastSyncedCanvasDataUrl) {
    lastSyncedCanvasDataUrl = appState.canvasDataUrl;
    restoreCanvasState(appState.canvasDataUrl, false);
  }

  appState.suppressSync = false;
  renderAll();
}

function initFirebase() {
  if (!isFirebaseConfigured()) {
    renderRoom();
    return false;
  }

  if (!firebaseApp) {
    firebaseApp = initializeApp(firebaseConfig);
    database = getDatabase(firebaseApp);
  }
  return true;
}

async function connectRoom(code, isHost) {
  if (!initFirebase()) {
    return;
  }

  leaveRoom(false);
  appState.roomCode = cleanRoomCode(code);
  appState.playerName = getPlayerName();
  appState.isHost = isHost;
  appState.hostId = isHost ? appState.clientId : "";
  roomCodeInput.value = appState.roomCode;
  roomRef = ref(database, `rooms/${appState.roomCode}`);

  if (isHost) {
    appState.players = [{ name: appState.playerName || "Host", score: 0 }];
    appState.canvasDataUrl = canvas.toDataURL("image/png");
    await set(roomRef, roomSnapshot());
  }

  unsubscribeRoom = onValue(roomRef, (snapshot) => {
    const remoteState = snapshot.val();
    if (!remoteState && !isHost) {
      roomHint.textContent = "Room not found yet. Check the code with your host.";
      return;
    }
    applyRemoteState(remoteState);
  });
  renderAll();
}

function leaveRoom(shouldRender = true) {
  if (unsubscribeRoom && roomRef) {
    off(roomRef);
  }
  unsubscribeRoom = null;
  roomRef = null;
  appState.roomCode = "";
  appState.isHost = false;
  appState.hostId = "";
  if (shouldRender) {
    renderAll();
  }
}

function updateScore(index, amount) {
  if (!canControlRoom()) {
    return;
  }
  appState.players[index].score = Math.max(0, appState.players[index].score + amount);
  renderScores();
  syncRoom({ players: appState.players, updatedAt: Date.now() });
}

function stopTimer() {
  window.clearInterval(appState.timerId);
  appState.timerId = null;
}

function startTimerLoop() {
  if (appState.timerId) {
    return;
  }

  appState.timerId = window.setInterval(() => {
    appState.secondsLeft = getSecondsLeft();
    renderTimer();

    if (appState.secondsLeft <= 0 && appState.timerRunning) {
      appState.timerRunning = false;
      appState.timerEndsAt = null;
      if (canControlRoom()) {
        syncRoom({
          secondsLeft: 0,
          timerEndsAt: null,
          timerRunning: false,
          updatedAt: Date.now()
        });
      }
    }
  }, 250);
}

function pickPrompt() {
  const usedPrompts = new Set(appState.history.map((entry) => entry.prompt));
  const availablePrompts = prompts.filter((prompt) => !usedPrompts.has(prompt));
  const deck = availablePrompts.length ? availablePrompts : prompts;
  return deck[Math.floor(Math.random() * deck.length)];
}

function startRound() {
  if (!canControlRoom()) {
    return;
  }

  appState.round += 1;
  appState.currentPrompt = pickPrompt();
  appState.secondsLeft = DEFAULT_SECONDS;
  appState.timerEndsAt = Date.now() + DEFAULT_SECONDS * 1000;
  appState.timerRunning = true;
  appState.answerRevealed = false;
  appState.guesses = [];
  appState.history.push({ round: appState.round, prompt: appState.currentPrompt });
  clearCanvas(false);
  appState.canvasDataUrl = canvas.toDataURL("image/png");
  renderAll();
  syncRoom(roomSnapshot());
}

function pauseOrResumeTimer() {
  if (!canControlRoom()) {
    return;
  }

  if (appState.timerRunning) {
    appState.secondsLeft = getSecondsLeft();
    appState.timerRunning = false;
    appState.timerEndsAt = null;
  } else if (appState.secondsLeft > 0) {
    appState.timerRunning = true;
    appState.timerEndsAt = Date.now() + appState.secondsLeft * 1000;
  }
  renderTimer();
  syncRoom({
    secondsLeft: appState.secondsLeft,
    timerEndsAt: appState.timerEndsAt,
    timerRunning: appState.timerRunning,
    updatedAt: Date.now()
  });
}

function resetTimer() {
  if (!canControlRoom()) {
    return;
  }

  appState.secondsLeft = DEFAULT_SECONDS;
  appState.timerEndsAt = null;
  appState.timerRunning = false;
  renderTimer();
  syncRoom({
    secondsLeft: appState.secondsLeft,
    timerEndsAt: null,
    timerRunning: false,
    updatedAt: Date.now()
  });
}

function revealAnswer() {
  if (!canControlRoom()) {
    return;
  }

  appState.answerRevealed = true;
  renderPrompt();
  syncRoom({ answerRevealed: true, updatedAt: Date.now() });
}

function addGuess(value) {
  const guess = value.trim();
  if (!guess) {
    return;
  }

  const isCorrect = appState.currentPrompt &&
    normalizeAnswer(guess) === normalizeAnswer(appState.currentPrompt);
  appState.guesses.push({
    correct: isCorrect,
    id: crypto.randomUUID(),
    player: getPlayerName(),
    text: guess,
    timestamp: Date.now()
  });

  if (isCorrect) {
    appState.timerRunning = false;
    appState.timerEndsAt = null;
    appState.answerRevealed = true;
  }

  renderAll();
  syncRoom({
    answerRevealed: appState.answerRevealed,
    guesses: appState.guesses,
    secondsLeft: getSecondsLeft(),
    timerEndsAt: appState.timerEndsAt,
    timerRunning: appState.timerRunning,
    updatedAt: Date.now()
  });
}

function saveCanvasState() {
  if (appState.undoStack.length > CANVAS_STATE_LIMIT) {
    appState.undoStack.shift();
  }
  appState.undoStack.push(canvas.toDataURL("image/png"));
}

function restoreCanvasState(dataUrl, saveUndo = true) {
  const image = new Image();
  image.addEventListener("load", () => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (saveUndo) {
      saveCanvasState();
    }
  });
  image.src = dataUrl;
}

function clearCanvas(shouldSync = true) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  appState.undoStack = [];
  saveCanvasState();
  appState.canvasDataUrl = canvas.toDataURL("image/png");
  lastSyncedCanvasDataUrl = appState.canvasDataUrl;
  if (shouldSync) {
    syncRoom({ canvasDataUrl: appState.canvasDataUrl, updatedAt: Date.now() });
  }
}

function undoCanvas() {
  if (appState.undoStack.length <= 1) {
    clearCanvas();
    return;
  }

  appState.undoStack.pop();
  restoreCanvasState(appState.undoStack[appState.undoStack.length - 1], false);
  window.setTimeout(syncCanvasSoon, 120);
}

function resizeCanvas() {
  const dataUrl = canvas.toDataURL("image/png");
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  restoreCanvasState(dataUrl, false);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function configureStroke() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = appState.brushSize;
  ctx.strokeStyle = appState.tool === "eraser" ? "#ffffff" : appState.brushColor;
  ctx.globalCompositeOperation = "source-over";
}

function beginDrawing(event) {
  appState.isDrawing = true;
  saveCanvasState();
  configureStroke();
  const point = canvasPoint(event);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}

function draw(event) {
  if (!appState.isDrawing) {
    return;
  }

  const point = canvasPoint(event);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  syncCanvasSoon();
}

function endDrawing() {
  if (!appState.isDrawing) {
    return;
  }

  appState.isDrawing = false;
  ctx.closePath();
  saveCanvasState();
  syncCanvasSoon();
}

function setTool(nextTool) {
  appState.tool = nextTool;
  document.querySelectorAll(".tool-button").forEach((button) => {
    const isActive = button.id === `${nextTool}Tool`;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function saveDrawing() {
  const link = document.createElement("a");
  link.download = `draw-guess-round-${appState.round || "sketch"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

createRoomButton.addEventListener("click", () => {
  connectRoom(createRoomCode(), true);
});

roomForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = cleanRoomCode(roomCodeInput.value);
  if (code) {
    connectRoom(code, false);
  }
});

leaveRoomButton.addEventListener("click", () => leaveRoom());
document.querySelector("#startRoundButton").addEventListener("click", startRound);
document.querySelector("#pauseTimerButton").addEventListener("click", pauseOrResumeTimer);
document.querySelector("#resetTimerButton").addEventListener("click", resetTimer);
document.querySelector("#revealButton").addEventListener("click", revealAnswer);
document.querySelector("#clearGuessesButton").addEventListener("click", () => {
  if (!canControlRoom()) {
    return;
  }
  appState.guesses = [];
  renderGuesses();
  syncRoom({ guesses: [], updatedAt: Date.now() });
});
document.querySelector("#clearCanvasButton").addEventListener("click", () => clearCanvas());
document.querySelector("#undoButton").addEventListener("click", undoCanvas);
document.querySelector("#saveCanvasButton").addEventListener("click", saveDrawing);
document.querySelector("#penTool").addEventListener("click", () => setTool("pen"));
document.querySelector("#eraserTool").addEventListener("click", () => setTool("eraser"));
document.querySelector("#resetScoresButton").addEventListener("click", () => {
  if (!canControlRoom()) {
    return;
  }
  appState.players = appState.players.map((player) => ({ ...player, score: 0 }));
  renderScores();
  syncRoom({ players: appState.players, updatedAt: Date.now() });
});

document.querySelector("#brushSize").addEventListener("input", (event) => {
  appState.brushSize = Number(event.target.value);
});

document.querySelectorAll(".swatch").forEach((button) => {
  button.addEventListener("click", () => {
    appState.brushColor = button.dataset.color;
    setTool("pen");
    document.querySelectorAll(".swatch").forEach((swatch) => {
      swatch.classList.toggle("active", swatch === button);
    });
  });
});

guessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addGuess(guessInput.value);
  guessInput.value = "";
  guessInput.focus();
});

playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = playerInput.value.trim();
  if (!name || !canControlRoom()) {
    return;
  }

  appState.players.push({ name, score: 0 });
  playerInput.value = "";
  renderScores();
  syncRoom({ players: appState.players, updatedAt: Date.now() });
});

canvas.addEventListener("pointerdown", beginDrawing);
canvas.addEventListener("pointermove", draw);
canvas.addEventListener("pointerup", endDrawing);
canvas.addEventListener("pointercancel", endDrawing);
canvas.addEventListener("pointerleave", endDrawing);
window.addEventListener("resize", resizeCanvas);

renderAll();
resizeCanvas();
clearCanvas(false);
startTimerLoop();
