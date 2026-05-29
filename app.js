"use strict";

const appState = {
  currentPrompt: "",
  round: 0,
  secondsLeft: 90,
  timerId: null,
  isDrawing: false,
  brushColor: "#1f2937",
  brushSize: 8,
  tool: "pen",
  players: [
    { name: "Team Blue", score: 0 },
    { name: "Team Green", score: 0 }
  ],
  history: [],
  undoStack: []
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

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function normalizeAnswer(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function renderTimer() {
  timerText.textContent = formatTime(appState.secondsLeft);
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
    addButton.setAttribute("aria-label", `Add one point to ${player.name}`);
    subtractButton.type = "button";
    subtractButton.textContent = "-1";
    subtractButton.setAttribute("aria-label", `Remove one point from ${player.name}`);

    addButton.addEventListener("click", () => updateScore(index, 1));
    subtractButton.addEventListener("click", () => updateScore(index, -1));

    actions.append(addButton, subtractButton);
    item.append(name, score, actions);
    scoreList.append(item);
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

function updateScore(index, amount) {
  appState.players[index].score = Math.max(0, appState.players[index].score + amount);
  renderScores();
}

function stopTimer() {
  window.clearInterval(appState.timerId);
  appState.timerId = null;
}

function startTimer() {
  if (appState.timerId) {
    return;
  }

  appState.timerId = window.setInterval(() => {
    appState.secondsLeft -= 1;
    renderTimer();

    if (appState.secondsLeft <= 0) {
      stopTimer();
      appState.secondsLeft = 0;
      renderTimer();
    }
  }, 1000);
}

function pickPrompt() {
  const usedPrompts = new Set(appState.history.map((entry) => entry.prompt));
  const availablePrompts = prompts.filter((prompt) => !usedPrompts.has(prompt));
  const deck = availablePrompts.length ? availablePrompts : prompts;
  return deck[Math.floor(Math.random() * deck.length)];
}

function startRound() {
  stopTimer();
  appState.round += 1;
  appState.currentPrompt = pickPrompt();
  appState.secondsLeft = 90;
  appState.history.push({ round: appState.round, prompt: appState.currentPrompt });
  promptText.textContent = "Drawing now...";
  promptText.dataset.answer = appState.currentPrompt;
  roundNumber.textContent = appState.round;
  guessList.innerHTML = "";
  clearCanvas();
  renderTimer();
  renderHistory();
  startTimer();
}

function revealAnswer() {
  if (!appState.currentPrompt) {
    promptText.textContent = "Press Start Round";
    return;
  }

  promptText.textContent = appState.currentPrompt;
}

function addGuess(value) {
  const guess = value.trim();
  if (!guess) {
    return;
  }

  const item = document.createElement("li");
  const isCorrect = appState.currentPrompt &&
    normalizeAnswer(guess) === normalizeAnswer(appState.currentPrompt);

  item.textContent = guess;
  if (isCorrect) {
    item.className = "correct";
    item.textContent = `${guess} - correct`;
    stopTimer();
    revealAnswer();
  }

  guessList.prepend(item);
}

function saveCanvasState() {
  if (appState.undoStack.length > 24) {
    appState.undoStack.shift();
  }
  appState.undoStack.push(canvas.toDataURL("image/png"));
}

function restoreCanvasState(dataUrl) {
  const image = new Image();
  image.addEventListener("load", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
  });
  image.src = dataUrl;
}

function clearCanvas() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  appState.undoStack = [];
  saveCanvasState();
}

function undoCanvas() {
  if (appState.undoStack.length <= 1) {
    clearCanvas();
    return;
  }

  appState.undoStack.pop();
  restoreCanvasState(appState.undoStack[appState.undoStack.length - 1]);
}

function resizeCanvas() {
  const dataUrl = canvas.toDataURL("image/png");
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * scale));
  canvas.height = Math.max(1, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  restoreCanvasState(dataUrl);
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
}

function endDrawing() {
  if (!appState.isDrawing) {
    return;
  }

  appState.isDrawing = false;
  ctx.closePath();
  saveCanvasState();
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

document.querySelector("#startRoundButton").addEventListener("click", startRound);
document.querySelector("#pauseTimerButton").addEventListener("click", () => {
  if (appState.timerId) {
    stopTimer();
  } else if (appState.secondsLeft > 0) {
    startTimer();
  }
});
document.querySelector("#resetTimerButton").addEventListener("click", () => {
  stopTimer();
  appState.secondsLeft = 90;
  renderTimer();
});
document.querySelector("#revealButton").addEventListener("click", revealAnswer);
document.querySelector("#clearGuessesButton").addEventListener("click", () => {
  guessList.innerHTML = "";
});
document.querySelector("#clearCanvasButton").addEventListener("click", clearCanvas);
document.querySelector("#undoButton").addEventListener("click", undoCanvas);
document.querySelector("#saveCanvasButton").addEventListener("click", saveDrawing);
document.querySelector("#penTool").addEventListener("click", () => setTool("pen"));
document.querySelector("#eraserTool").addEventListener("click", () => setTool("eraser"));
document.querySelector("#resetScoresButton").addEventListener("click", () => {
  appState.players = appState.players.map((player) => ({ ...player, score: 0 }));
  renderScores();
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
  if (!name) {
    return;
  }

  appState.players.push({ name, score: 0 });
  playerInput.value = "";
  renderScores();
});

canvas.addEventListener("pointerdown", beginDrawing);
canvas.addEventListener("pointermove", draw);
canvas.addEventListener("pointerup", endDrawing);
canvas.addEventListener("pointercancel", endDrawing);
canvas.addEventListener("pointerleave", endDrawing);
window.addEventListener("resize", resizeCanvas);

renderScores();
renderTimer();
resizeCanvas();
clearCanvas();
