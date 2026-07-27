const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameManager = require('./game/GameManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

const gm = new GameManager();

// ───────────────── Socket.IO Events ─────────────────

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Room Management ──

  socket.on('create-room', ({ playerName }) => {
    if (!playerName || !playerName.trim()) {
      socket.emit('error-msg', { message: 'Lütfen bir isim girin.' });
      return;
    }

    const room = gm.createRoom(socket.id, playerName.trim());
    
    // Default category when created
    room.category = 'football';
    room.customCards = [];
    
    socket.join(room.code);
    socket.emit('room-created', { roomCode: room.code });
    io.to(room.code).emit('room-updated', room.getState());
    console.log(`[Room] Created: ${room.code} by ${playerName}`);
  });

  socket.on('update-category', ({ category, customCards }) => {
    const room = gm.findRoomByPlayer(socket.id);
    // Only host can update category, and only in lobby phase
    if (!room || socket.id !== room.hostId || room.phase !== 'lobby') return;
    
    room.category = category;
    if (category === 'custom' && Array.isArray(customCards)) {
      room.customCards = customCards;
    }
    
    io.to(room.code).emit('room-updated', room.getState());
    console.log(`[Room] ${room.code} category updated to ${category} by host.`);
  });

  socket.on('join-room', ({ roomCode, playerName }) => {
    if (!playerName || !playerName.trim()) {
      socket.emit('error-msg', { message: 'Lütfen bir isim girin.' });
      return;
    }
    if (!roomCode || !roomCode.trim()) {
      socket.emit('error-msg', { message: 'Lütfen oda kodunu girin.' });
      return;
    }

    const result = gm.joinRoom(roomCode.trim(), socket.id, playerName.trim());
    if (result.error) {
      socket.emit('error-msg', { message: result.error });
      return;
    }

    const room = result.room;
    socket.join(room.code);
    socket.emit('room-joined', { roomCode: room.code });
    io.to(room.code).emit('room-updated', room.getState());
    io.to(room.code).emit('player-joined', { playerName: playerName.trim() });
    console.log(`[Room] ${playerName} joined ${room.code}`);
  });

  socket.on('switch-team', ({ team }) => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || room.phase !== 'lobby') return;
    room.switchTeam(socket.id, team);
    io.to(room.code).emit('room-updated', room.getState());
  });

  socket.on('update-team-name', ({ team, name }) => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || socket.id !== room.hostId) return;
    if (team === 'A') room.teamA.name = name.trim() || 'Takım A';
    else if (team === 'B') room.teamB.name = name.trim() || 'Takım B';
    io.to(room.code).emit('room-updated', room.getState());
  });

  socket.on('update-settings', ({ settings }) => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || socket.id !== room.hostId) return;
    if (settings.gameMode) room.settings.gameMode = settings.gameMode;
    if (settings.roundCount) room.settings.roundCount = parseInt(settings.roundCount);
    if (settings.roundTime) room.settings.roundTime = parseInt(settings.roundTime);
    if (settings.targetScore) room.settings.targetScore = parseInt(settings.targetScore);
    io.to(room.code).emit('room-updated', room.getState());
  });

  // ── Game Flow ──

  socket.on('start-game', () => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || socket.id !== room.hostId) return;

    if (!room.canStart()) {
      socket.emit('error-msg', { message: 'Her takımda en az 2 oyuncu olmalı!' });
      return;
    }

    console.log(`[Game] Starting in room ${room.code}`);
    startNewRound(room);
  });

  socket.on('taboo-word-sync', ({ index, word }) => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || room.phase !== 'picking_taboo') return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const opposingTeamId = room.getOpposingTeamId();
    if (player.team !== opposingTeamId) return;

    // Sadece karşı takımdaki (aynı takımda olan) diğer oyunculara gönder
    const opposingTeam = room.getOpposingTeam();
    opposingTeam.players.forEach(p => {
      if (p.id !== socket.id) {
        io.to(p.id).emit('taboo-word-sync-receive', { index, word, senderId: socket.id });
      }
    });
  });

  socket.on('submit-taboo-words', ({ words }) => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || room.phase !== 'picking_taboo') return;

    // Only opposing team can submit
    const player = room.players.get(socket.id);
    if (!player) return;
    const opposingTeamId = room.getOpposingTeamId();
    if (player.team !== opposingTeamId) return;

    // Accept up to 5 non-empty words
    room.tabooWords = words
      .slice(0, 5)
      .map(w => w.trim())
      .filter(w => w.length > 0);

    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }

    console.log(`[Game] Taboo words submitted in ${room.code}: ${room.tabooWords.join(', ')}`);
    
    // Emit event to show confirmation screen
    io.to(room.code).emit('taboo-words-confirmed', {
      tabooWords: room.tabooWords,
      submitterName: player.name
    });

    // Wait 3 seconds then start describing
    room.timer = setTimeout(() => {
      if (room.phase === 'picking_taboo') {
        startDescribePhase(room);
      }
    }, 3000);
  });

  socket.on('correct-guess', () => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || room.phase !== 'describing') return;

    // Only describer can mark correct
    const describer = room.getCurrentDescriber();
    if (!describer || socket.id !== describer.id) return;

    room.getDescribingTeam().score += 1;

    handleMidRoundTransition(room, 'correct');
  });

  socket.on('taboo-violation', () => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || room.phase !== 'describing') return;

    // Only opposing team can call taboo
    const player = room.players.get(socket.id);
    if (!player) return;
    const opposingTeamId = room.getOpposingTeamId();
    if (player.team !== opposingTeamId) return;

    room.getDescribingTeam().score = Math.max(0, room.getDescribingTeam().score - 1);

    handleMidRoundTransition(room, 'taboo');
  });

  socket.on('pass', () => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || room.phase !== 'describing') return;

    // Only describer can pass
    const describer = room.getCurrentDescriber();
    if (!describer || socket.id !== describer.id) return;

    handleMidRoundTransition(room, 'pass');
  });

  socket.on('next-round', () => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || socket.id !== room.hostId) return;
    if (room.phase !== 'round_end') return;

    room.advanceDescriber();
    room.switchTurns();
    startNewRound(room);
  });

  socket.on('new-game', () => {
    const room = gm.findRoomByPlayer(socket.id);
    if (!room || socket.id !== room.hostId) return;

    room.resetForNewGame();
    io.to(room.code).emit('room-updated', room.getState());
    io.to(room.code).emit('back-to-lobby', {});
    console.log(`[Game] New game in room ${room.code}`);
  });

  // ── Disconnect ──

  socket.on('disconnect', () => {
    const room = gm.removePlayer(socket.id);
    if (room) {
      io.to(room.code).emit('room-updated', room.getState());
      io.to(room.code).emit('toast', { message: 'Bir oyuncu ayrıldı.', type: 'warning' });

      // If game was in progress and teams are broken, go back to lobby
      if (room.phase !== 'lobby' && !room.canStart()) {
        room.phase = 'lobby';
        if (room.timer) {
          clearTimeout(room.timer);
          room.timer = null;
        }
        io.to(room.code).emit('back-to-lobby', {});
        io.to(room.code).emit('toast', {
          message: 'Yeterli oyuncu kalmadı, lobiye dönüldü.',
          type: 'error'
        });
      }
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

// ───────────────── Game Phase Functions ─────────────────

function startNewRound(room) {
  room.describeRemainingTime = room.settings.roundTime;
  const footballer = gm.getRandomFootballer(room);
  room.currentFootballer = footballer;
  room.tabooWords = [];

  // Custom mode: pre-fill forbidden words and skip taboo pick phase
  if (room.category === 'custom' && room.customCards) {
    room.tabooWords = gm.getCustomForbiddenWords(room, footballer);
    room.phase = 'describing';
    startDescribePhase(room);
    return;
  }

  room.phase = 'picking_taboo';

  const describer = room.getCurrentDescriber();
  const opposingTeam = room.getOpposingTeam();
  const describingTeam = room.getDescribingTeam();

  // Send role-specific data to each player
  for (const [socketId] of room.players) {
    const role = room.getPlayerRole(socketId);

    io.to(socketId).emit('phase-taboo-pick', {
      // CRITICAL: Guessers must NOT see the footballer name
      footballer: role === 'guesser' ? null : footballer,
      role,
      describerName: describer.name,
      describingTeamName: describingTeam.name,
      opposingTeamName: opposingTeam.name,
      currentTeam: room.currentTeam,
      timeLimit: room.settings.tabooPickTime,
      scores: {
        teamA: { name: room.teamA.name, score: room.teamA.score },
        teamB: { name: room.teamB.name, score: room.teamB.score }
      },
      remaining: gm.getRemainingFootballerCount(room),
      total: gm.getTotalFootballerCount(room),
      mainRemainingTime: Math.ceil(room.describeRemainingTime),
      totalRoundTime: room.settings.roundTime
    });
  }

  // Auto-advance when timer expires
  room.timer = setTimeout(() => {
    if (room.phase === 'picking_taboo') {
      console.log(`[Game] Taboo pick time expired in ${room.code}`);
      startDescribePhase(room);
    }
  }, room.settings.tabooPickTime * 1000);
}

function startDescribePhase(room) {
  room.phase = 'describing';
  room.describeStartTime = Date.now();

  const describer = room.getCurrentDescriber();
  const describingTeam = room.getDescribingTeam();
  const opposingTeam = room.getOpposingTeam();

  for (const [socketId] of room.players) {
    const role = room.getPlayerRole(socketId);

    io.to(socketId).emit('phase-describe', {
      // CRITICAL: Guessers must NOT see the footballer name or taboo words
      footballer: role === 'guesser' ? null : room.currentFootballer,
      tabooWords: role === 'guesser' ? [] : room.tabooWords,
      role,
      describerName: describer.name,
      describingTeamName: describingTeam.name,
      opposingTeamName: opposingTeam.name,
      timeLimit: Math.ceil(room.describeRemainingTime),
      scores: {
        teamA: { name: room.teamA.name, score: room.teamA.score },
        teamB: { name: room.teamB.name, score: room.teamB.score }
      }
    });
  }

  // Auto-end when timer expires
  room.timer = setTimeout(() => {
    if (room.phase === 'describing') {
      console.log(`[Game] Describe time expired in ${room.code}`);
      room.describeRemainingTime = 0;
      endRound(room, 'timeout');
    }
  }, room.describeRemainingTime * 1000);
}

function handleMidRoundTransition(room, reason) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }

  const elapsed = (Date.now() - room.describeStartTime) / 1000;
  room.describeRemainingTime -= elapsed;

  let penalty = 0;
  if (reason === 'pass') {
    penalty = room.settings.roundTime * (5 / 60);
    room.describeRemainingTime -= penalty;
  }

  if (room.describeRemainingTime <= 0) {
    room.describeRemainingTime = 0;
    endRound(room, 'timeout');
    return;
  }

  let msg = '';
  if (reason === 'correct') msg = 'Doğru bildi! +1 Puan. Yeni futbolcu bekleniyor...';
  if (reason === 'taboo') msg = 'Tabu! -1 Puan. Yeni futbolcu bekleniyor...';
  if (reason === 'pass') msg = `Pas geçildi! -${penalty} Saniye. Yeni futbolcu bekleniyor...`;

  io.to(room.code).emit('mid-round-result', {
    reason,
    msg,
    penalty,
    remainingTime: Math.ceil(room.describeRemainingTime)
  });

  // Delay transition so clients can animate the result
  setTimeout(() => {
    // Check if room still exists and phase is still describing (in case of disconnects)
    if (!gm.rooms.has(room.code) || room.phase !== 'describing') return;

    const footballer = gm.getRandomFootballer(room);
    room.currentFootballer = footballer;
    room.tabooWords = [];

    // Custom mode: pre-fill forbidden words and skip taboo pick
    if (room.category === 'custom' && room.customCards) {
      room.tabooWords = gm.getCustomForbiddenWords(room, footballer);
      startDescribePhase(room);
      return;
    }

    // Transition to picking_taboo
    room.phase = 'picking_taboo';

    const describer = room.getCurrentDescriber();
    const opposingTeam = room.getOpposingTeam();
    const describingTeam = room.getDescribingTeam();

    for (const [socketId] of room.players) {
      const role = room.getPlayerRole(socketId);

      io.to(socketId).emit('phase-taboo-pick', {
        footballer: role === 'guesser' ? null : footballer,
        role,
        describerName: describer.name,
        describingTeamName: describingTeam.name,
        opposingTeamName: opposingTeam.name,
        currentTeam: room.currentTeam,
        timeLimit: room.settings.tabooPickTime,
        scores: {
          teamA: { name: room.teamA.name, score: room.teamA.score },
          teamB: { name: room.teamB.name, score: room.teamB.score }
        },
        remaining: gm.getRemainingFootballerCount(room),
        total: gm.getTotalFootballerCount(room),
        mainRemainingTime: Math.ceil(room.describeRemainingTime),
        totalRoundTime: room.settings.roundTime
      });
    }

    room.timer = setTimeout(() => {
      if (room.phase === 'picking_taboo') {
        console.log(`[Game] Taboo pick time expired in ${room.code} mid-round`);
        startDescribePhase(room);
      }
    }, room.settings.tabooPickTime * 1000);
  }, 2000);
}

function endRound(room, result) {
  room.phase = 'round_end';

  if (room.currentTeam === 'A') {
    room.turnsPlayedA++;
  } else {
    room.turnsPlayedB++;
  }

  const describingTeam = room.getDescribingTeam();
  const opposingTeam = room.getOpposingTeam();

  let gameOver = false;
  let winner = null;

  // Sadece tur sayıları eşitse bitirme kontrolü yap
  if (room.turnsPlayedA === room.turnsPlayedB) {
    if (room.settings.gameMode === 'score') {
      const targetScore = room.settings.targetScore;
      if (room.teamA.score >= targetScore || room.teamB.score >= targetScore) {
        if (room.teamA.score > room.teamB.score) {
          gameOver = true;
          winner = room.teamA.name;
        } else if (room.teamB.score > room.teamA.score) {
          gameOver = true;
          winner = room.teamB.name;
        }
        // Beraberlik durumu: uzatma (oyun normal şekilde round_end olur ve yeni tur başlar)
      }
    } else if (room.settings.gameMode === 'rounds') {
      const targetRounds = room.settings.roundCount;
      if (room.turnsPlayedA >= targetRounds) {
        if (room.teamA.score > room.teamB.score) {
          gameOver = true;
          winner = room.teamA.name;
        } else if (room.teamB.score > room.teamA.score) {
          gameOver = true;
          winner = room.teamB.name;
        }
        // Beraberlik durumu: uzatma
      }
    }
  }

  if (gameOver) {
    room.phase = 'game_over';
    io.to(room.code).emit('game-over', {
      winner,
      result,
      footballer: room.currentFootballer,
      tabooWords: room.tabooWords,
      scores: {
        teamA: { name: room.teamA.name, score: room.teamA.score },
        teamB: { name: room.teamB.name, score: room.teamB.score }
      },
      hostId: room.hostId
    });
    console.log(`[Game] GAME OVER in ${room.code}! Winner: ${winner}`);
  } else {
    io.to(room.code).emit('round-end', {
      result,
      footballer: room.currentFootballer,
      tabooWords: room.tabooWords,
      describingTeamName: describingTeam.name,
      scores: {
        teamA: { name: room.teamA.name, score: room.teamA.score },
        teamB: { name: room.teamB.name, score: room.teamB.score }
      },
      hostId: room.hostId
    });
  }
}

// ───────────────── Start Server ─────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚽ Futbol Tabu server running on port ${PORT}`);
  console.log(`   http://localhost:${PORT}`);
});
