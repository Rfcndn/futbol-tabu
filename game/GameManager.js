const Room = require('./Room');
const footballers = require('./players.json');

class GameManager {
  constructor() {
    this.rooms = new Map();
  }

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostId, hostName) {
    const code = this.generateCode();
    const room = new Room(code, hostId, hostName);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code.toUpperCase());
  }

  joinRoom(code, playerId, playerName) {
    const room = this.getRoom(code);
    if (!room) return { error: 'Oda bulunamadı.' };
    if (room.phase !== 'lobby') return { error: 'Oyun zaten başlamış.' };
    if (room.players.has(playerId)) return { error: 'Zaten bu odadasınız.' };
    room.addPlayer(playerId, playerName);
    return { room };
  }

  removePlayer(playerId) {
    const room = this.findRoomByPlayer(playerId);
    if (!room) return null;

    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }

    room.removePlayer(playerId);

    // If room is empty, delete it
    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      return null;
    }

    return room;
  }

  findRoomByPlayer(playerId) {
    for (const [, room] of this.rooms) {
      if (room.players.has(playerId)) {
        return room;
      }
    }
    return null;
  }

  getRandomFootballer(room) {
    // Custom mode: pick from custom cards
    if (room.category === 'custom' && room.customCards && room.customCards.length > 0) {
      const pool = room.customCards;
      const available = pool.filter(c => !room.usedFootballers.has(c.main));
      if (available.length === 0) {
        room.usedFootballers.clear();
        const c = pool[Math.floor(Math.random() * pool.length)];
        room.usedFootballers.add(c.main);
        return c.main;
      }
      const c = available[Math.floor(Math.random() * available.length)];
      room.usedFootballers.add(c.main);
      return c.main;
    }

    // Default: use footballers list
    const available = footballers.filter(f => !room.usedFootballers.has(f));
    if (available.length === 0) {
      // All used, reset
      room.usedFootballers.clear();
      const f = footballers[Math.floor(Math.random() * footballers.length)];
      room.usedFootballers.add(f);
      return f;
    }
    const f = available[Math.floor(Math.random() * available.length)];
    room.usedFootballers.add(f);
    return f;
  }

  getRemainingFootballerCount(room) {
    if (room.category === 'custom' && room.customCards) {
      return room.customCards.length - room.usedFootballers.size;
    }
    return footballers.length - room.usedFootballers.size;
  }

  getTotalFootballerCount(room) {
    if (room && room.category === 'custom' && room.customCards) {
      return room.customCards.length;
    }
    return footballers.length;
  }

  // Get pre-set forbidden words for custom cards
  getCustomForbiddenWords(room, mainWord) {
    if (room.category === 'custom' && room.customCards) {
      const card = room.customCards.find(c => c.main === mainWord);
      if (card) return card.forbidden || [];
    }
    return [];
  }
}

module.exports = GameManager;
