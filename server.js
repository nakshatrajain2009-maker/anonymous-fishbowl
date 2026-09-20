const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;

const blocked = ["spamword1", "spamword2"]; // Replace/add moderation terms as needed.

function code() {
  let c;
  do c = crypto.randomBytes(3).toString("hex").toUpperCase();
  while (rooms.has(c));
  return c;
}
function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(room, msg) {
  for (const p of room.players.values()) send(p.ws, msg);
}
function publicState(room) {
  return {
    type: "state",
    playerCount: room.players.size,
    phase: room.phase,
    question: room.currentQuestion ? room.currentQuestion.text : null,
    answersSubmitted: room.currentQuestion ? room.currentQuestion.answers.size : 0,
    totalPlayers: room.players.size
  };
}
function cleanText(s) {
  return String(s || "").trim().slice(0, 300);
}
function moderated(s) {
  const x = s.toLowerCase();
  return blocked.some(w => x.includes(w));
}

wss.on("connection", ws => {
  ws.id = crypto.randomUUID();

  ws.on("message", raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.type === "create") {
      const roomCode = code();
      const room = {
        host: ws.id, players: new Map(), questions: [],
        phase: "lobby", currentQuestion: null
      };
      rooms.set(roomCode, room);
      room.players.set(ws.id, { ws });
      ws.room = roomCode;
      send(ws, { type:"joined", roomCode, host:true });
      broadcast(room, publicState(room));
      return;
    }

    if (m.type === "join") {
      const room = rooms.get(String(m.roomCode || "").toUpperCase());
      if (!room) return send(ws, {type:"error", message:"Room not found."});
      if (room.players.size >= MAX_PLAYERS) return send(ws, {type:"error", message:"Room is full."});
      if (room.phase !== "lobby") return send(ws, {type:"error", message:"Game already started."});
      room.players.set(ws.id, { ws });
      ws.room = String(m.roomCode).toUpperCase();
      send(ws, { type:"joined", roomCode:ws.room, host:false });
      broadcast(room, publicState(room));
      return;
    }

    const room = rooms.get(ws.room);
    if (!room) return send(ws, {type:"error", message:"Join a room first."});

    if (m.type === "addQuestion") {
      const text = cleanText(m.text);
      if (!text) return;
      if (moderated(text)) return send(ws,{type:"error",message:"That question was blocked by moderation."});
      room.questions.push({ id:crypto.randomUUID(), text, author:ws.id, used:false });
      send(ws,{type:"questionAdded"});
      return;
    }

    if (m.type === "start" && ws.id === room.host) {
      if (room.players.size < 2) return send(ws,{type:"error",message:"At least 2 players are required."});
      room.phase = "drawing";
      broadcast(room,{type:"drawAnimation"});
      setTimeout(() => draw(room), 1600);
      return;
    }

    if (m.type === "skip" && ws.id === room.host) {
      draw(room);
      return;
    }

    if (m.type === "answer" && room.currentQuestion) {
      if (room.currentQuestion.answers.has(ws.id)) return;
      let answer = m.answer === "yes" || m.answer === "no" ? m.answer : cleanText(m.answer);
      if (!answer) return;
      if (typeof answer === "string" && !["yes","no"].includes(answer) && moderated(answer))
        return send(ws,{type:"error",message:"That answer was blocked by moderation."});
      room.currentQuestion.answers.set(ws.id, answer);
      send(ws,{type:"answerAccepted"});
      broadcast(room, publicState(room));
      if (room.currentQuestion.answers.size === room.players.size) showResults(room);
      return;
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.room);
    if (!room) return;
    room.players.delete(ws.id);
    if (ws.id === room.host) {
      const next = room.players.keys().next();
      room.host = next.done ? null : next.value;
    }
    if (!room.players.size) rooms.delete(ws.room);
    else broadcast(room, publicState(room));
  });
});

function draw(room) {
  const unused = room.questions.filter(q => !q.used);
  if (!unused.length) {
    room.phase = "lobby";
    room.currentQuestion = null;
    broadcast(room,{type:"emptyFishbowl", message:"No unused questions remain. Add more questions."});
    broadcast(room, publicState(room));
    return;
  }
  const q = unused[Math.floor(Math.random()*unused.length)];
  q.used = true;
  room.currentQuestion = { id:q.id, text:q.text, author:q.author, answers:new Map() };
  room.phase = "answering";
  broadcast(room,{type:"question", text:q.text});
  broadcast(room, publicState(room));
}

function showResults(room) {
  const vals = [...room.currentQuestion.answers.values()];
  const yes = vals.filter(x=>x==="yes").length;
  const no = vals.filter(x=>x==="no").length;
  const other = vals.filter(x=>x!=="yes" && x!=="no");
  room.phase = "results";
  broadcast(room,{type:"results", yes, no, other});
  broadcast(room, publicState(room));
}

server.listen(PORT, () => console.log(`Anonymous Fishbowl running on port ${PORT}`));
