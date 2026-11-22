const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const CATS = {
  "Хоол": ["бууз","хуушуур","цуйван","банш","хорхог","шөл","пицца","бургер","суши","талх","зайрмаг","шашлик"],
  "Амьтан": ["морь","тэмээ","хонь","ямаа","үхэр","нохой","муур","арслан","баавгай","чоно","шонхор","загас"],
  "Газар": ["Улаанбаатар","Говь","Хөвсгөл нуур","Хархорин","Эрдэнэт","Дархан","Чингис хаан талбай","Токио","Парис","Нью-Йорк","Сөүл","Алтай"],
  "Эд зүйл": ["утас","ном","шүхэр","цүнх","түлхүүр","толь","цаг","сандал","дэнлүү","шүдний сойз","компьютер","чихэвч"],
  "Мэргэжил": ["багш","эмч","жолооч","тогооч","цагдаа","малчин","инженер","програмист","зураач","дуучин","нисгэгч","тамирчин"],
  "Спорт": ["бөх","сур харваа","хөл бөмбөг","сагсан бөмбөг","теннис","шатар","бокс","жүдо","гольф","усан сэлэлт","морин уралдаан","волейбол"],
  "Монгол ёс": ["наадам","цагаан сар","морин хуур","хөөмий","гэр","дээл","хадаг","айраг","шагай","аргал","урт дуу","тооно"]
};

const rooms = {};
const pick = a => a[Math.floor(Math.random() * a.length)];

function makeCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const code = makeCode();
    rooms[code] = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, name: (name || "").trim() || "Тоглогч 1" }],
      game: null
    };
    socket.join(code);
    socket.emit("roomJoined", { code, isHost: true, players: rooms[code].players });
  });

  socket.on("joinRoom", ({ code, name }) => {
    code = (code || "").trim().toUpperCase();
    const room = rooms[code];
    if (!room) return socket.emit("errMsg", "Ийм кодтой өрөө олдсонгүй.");
    if (room.game) return socket.emit("errMsg", "Тоглоом аль хэдийн эхэлсэн байна.");
    if (room.players.some(p => p.id === socket.id)) return;

    room.players.push({ id: socket.id, name: (name || "").trim() || `Тоглогч ${room.players.length + 1}` });
    socket.join(code);
    socket.emit("roomJoined", { code, isHost: room.hostId === socket.id, players: room.players });
    io.to(code).emit("playersUpdated", room.players);
  });

  socket.on("startGame", ({ code, settings }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 3) return socket.emit("errMsg", "Хамгийн багадаа 3 тоглогч хэрэгтэй.");

    const pool = [];
    (settings.cats || []).forEach(c => {
      if (CATS[c]) CATS[c].forEach(w => pool.push([w, c]));
    });
   
const cu = (settings.custom || "").split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    if (cu.length >= 3) cu.forEach(w => pool.push([w, "Өөрийн үгс"]));
    if (!pool.length) return socket.emit("errMsg", "Ядаж нэг ангилал сонго.");

    const [word, cat] = pick(pool);
    const maxImp = Math.max(1, Math.floor((room.players.length - 1) / 2));
    const impCount = Math.min(Math.max(1, settings.imp || 1), maxImp);

    const shuffledIds = room.players.map(p => p.id).sort(() => Math.random() - 0.5);
    const impSet = new Set(shuffledIds.slice(0, impCount));
    const firstPlayer = pick(room.players).name;

    room.game = {
      word,
      cat,
      hint: !!settings.hint,
      timed: !!settings.timed,
      min: Math.min(15, Math.max(1, settings.min || 3)),
      impSet,
      firstPlayer
    };

    room.players.forEach(p => {
      const isImp = impSet.has(p.id);
      io.to(p.id).emit("roleAssigned", {
        isImp,
        word: isImp ? null : word,
        cat: isImp ? (settings.hint ? cat : null) : cat,
        firstPlayer,
        timed: room.game.timed,
        min: room.game.min
      });
    });
  });

  socket.on("endRound", ({ code }) => {
    const room = rooms[code];
    if (!room || room.hostId !== socket.id || !room.game) return;
    const impostors = room.players
      .filter(p => room.game.impSet.has(p.id))
      .map(p => p.name);

    io.to(code).emit("gameResult", {
      impostors,
      word: room.game.word,
      cat: room.game.cat
    });
    room.game = null;
  });

  socket.on("disconnect", () => {
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        if (room.players.length === 0) {
          delete rooms[code];
        } else {
          if (room.hostId === socket.id) room.hostId = room.players[0].id;
          io.to(code).emit("playersUpdated", room.players);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
