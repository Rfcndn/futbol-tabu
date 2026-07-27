class Room {
  constructor(code, hostId, hostName) {
    this.code = code;
    this.hostId = hostId;
    this.players = new Map();
    this.teamA = { name: 'Takım A', score: 0, players: [] };
    this.teamB = { name: 'Takım B', score: 0, players: [] };
    this.usedFootballers = new Set();
    this.currentFootballer = null;
    this.tabooWords = [];
    this.currentTeam = 'A';
    this.describerIndexA = 0;
    this.describerIndexB = 0;
    this.phase = 'lobby';
    this.timer = null;
    this.describeRemainingTime = 0;
    this.describeStartTime = 0;
    this.settings = {
      roundTime: 60,
      tabooPickTime: 20,
      targetScore: 10
    };
    this.category = 'football';
    this.customCards = null;

    // Add the host as the first player
    this.addPlayer(hostId, hostName);
  }

  addPlayer(socketId, name) {
    const player = { id: socketId, name, team: null };
    this.players.set(socketId, player);
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;

    if (player.team === 'A') {
      this.teamA.players = this.teamA.players.filter(p => p.id !== socketId);
    } else if (player.team === 'B') {
      this.teamB.players = this.teamB.players.filter(p => p.id !== socketId);
    }

    this.players.delete(socketId);

    // If host left and players remain, assign new host
    if (socketId === this.hostId && this.players.size > 0) {
      this.hostId = this.players.keys().next().value;
    }

    return player;
  }

  switchTeam(socketId, team) {
    const player = this.players.get(socketId);
    if (!player) return false;

    // Remove from current team
    if (player.team === 'A') {
      this.teamA.players = this.teamA.players.filter(p => p.id !== socketId);
    } else if (player.team === 'B') {
      this.teamB.players = this.teamB.players.filter(p => p.id !== socketId);
    }

    // Add to new team
    player.team = team;
    if (team === 'A') {
      this.teamA.players.push(player);
    } else if (team === 'B') {
      this.teamB.players.push(player);
    }

    return true;
  }

  getCurrentDescriber() {
    const team = this.currentTeam === 'A' ? this.teamA : this.teamB;
    if (team.players.length === 0) return null;
    const index = this.currentTeam === 'A' ? this.describerIndexA : this.describerIndexB;
    return team.players[index % team.players.length];
  }

  getOpposingTeam() {
    return this.currentTeam === 'A' ? this.teamB : this.teamA;
  }

  getDescribingTeam() {
    return this.currentTeam === 'A' ? this.teamA : this.teamB;
  }

  getOpposingTeamId() {
    return this.currentTeam === 'A' ? 'B' : 'A';
  }

  advanceDescriber() {
    if (this.currentTeam === 'A') {
      this.describerIndexA = (this.describerIndexA + 1) % Math.max(1, this.teamA.players.length);
    } else {
      this.describerIndexB = (this.describerIndexB + 1) % Math.max(1, this.teamB.players.length);
    }
  }

  switchTurns() {
    this.currentTeam = this.currentTeam === 'A' ? 'B' : 'A';
  }

  canStart() {
    return this.teamA.players.length >= 2 && this.teamB.players.length >= 2;
  }

  getPlayerRole(socketId) {
    const describer = this.getCurrentDescriber();
    if (!describer) return 'spectator';
    if (socketId === describer.id) return 'describer';

    const player = this.players.get(socketId);
    if (!player || !player.team) return 'spectator';

    const opposingTeamId = this.getOpposingTeamId();
    if (player.team === opposingTeamId) return 'opposing';

    return 'guesser';
  }

  getState() {
    return {
      code: this.code,
      hostId: this.hostId,
      category: this.category,
      hasCustomCards: Array.isArray(this.customCards) && this.customCards.length > 0,
      teamA: {
        name: this.teamA.name,
        score: this.teamA.score,
        players: this.teamA.players.map(p => ({ id: p.id, name: p.name }))
      },
      teamB: {
        name: this.teamB.name,
        score: this.teamB.score,
        players: this.teamB.players.map(p => ({ id: p.id, name: p.name }))
      },
      unassigned: Array.from(this.players.values())
        .filter(p => !p.team)
        .map(p => ({ id: p.id, name: p.name })),
      phase: this.phase,
      currentTeam: this.currentTeam,
      settings: this.settings
    };
  }

  resetForNewGame() {
    this.teamA.score = 0;
    this.teamB.score = 0;
    this.usedFootballers.clear();
    this.currentFootballer = null;
    this.tabooWords = [];
    this.currentTeam = 'A';
    this.describerIndexA = 0;
    this.describerIndexB = 0;
    this.phase = 'lobby';
    this.describeRemainingTime = 0;
    this.describeStartTime = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = Room;
