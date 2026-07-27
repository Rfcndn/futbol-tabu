/* ═══════════════════════════════════════════════════
   FUTBOL TABU - Client Application
   ═══════════════════════════════════════════════════ */

// ── Socket Connection ──
const socket = io();

// ── State ──
let myId = null;
let myRoomCode = null;
let roomState = null;
let timerInterval = null;

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
  // Check URL for room code
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get('room');
  if (urlRoom) {
    document.getElementById('room-code-input').value = urlRoom.toUpperCase();
  }

  initMenuEvents();
  initLobbyEvents();
  initSocketEvents();
});

// ═══════════════ SCREEN MANAGEMENT ═══════════════

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.add('active');
    // Re-trigger animation
    screen.style.animation = 'none';
    screen.offsetHeight; // trigger reflow
    screen.style.animation = '';
  }
}

// ═══════════════ MENU EVENTS ═══════════════

let selectedCategory = null;
let customCards = [];

function initMenuEvents() {
  const nameInput = document.getElementById('player-name');
  const codeInput = document.getElementById('room-code-input');
  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');

  // ── Create Room → navigate directly to lobby (via server) ──
  btnCreate.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      showToast('Lütfen adınızı girin!', 'error');
      nameInput.focus();
      return;
    }
    btnCreate.disabled = true;
    socket.emit('create-room', { playerName: name });
  });

  btnJoin.addEventListener('click', () => {
    const name = nameInput.value.trim();
    const code = codeInput.value.trim().toUpperCase();
    if (!name) {
      showToast('Lütfen adınızı girin!', 'error');
      nameInput.focus();
      return;
    }
    if (!code) {
      showToast('Lütfen oda kodunu girin!', 'error');
      codeInput.focus();
      return;
    }
    btnJoin.disabled = true;
    socket.emit('join-room', { roomCode: code, playerName: name });
  });

  // Enter key support
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (codeInput.value.trim()) btnJoin.click();
      else btnCreate.click();
    }
  });

  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnJoin.click();
  });

  initCreatePageEvents();
}

// ═══════════════ LOBBY EVENTS ═══════════════

function initCreatePageEvents() {
  const catCards = document.querySelectorAll('#lobby-cat-grid .cat-card');
  const btnCustomBack = document.getElementById('btn-custom-back');
  const btnAddCard = document.getElementById('btn-add-card');
  const btnCustomSave = document.getElementById('btn-custom-save');
  const btnLobbyHome = document.getElementById('btn-lobby-home');
  const btnLobbyBack = document.getElementById('btn-lobby-back');

  if (btnLobbyHome) {
    btnLobbyHome.addEventListener('click', () => window.location.href = '/');
  }
  if (btnLobbyBack) {
    btnLobbyBack.addEventListener('click', () => window.location.href = '/');
  }

  const gamingCatGrid = document.getElementById('gaming-cat-grid');
  const moviesCatGrid = document.getElementById('movies-cat-grid');
  const mainCatGrid = document.getElementById('lobby-cat-grid');
  
  const btnGamingBack = document.getElementById('btn-gaming-back');
  if (btnGamingBack) {
    btnGamingBack.addEventListener('click', () => {
      gamingCatGrid.style.display = 'none';
      mainCatGrid.style.display = 'grid';
    });
  }

  const btnMoviesBack = document.getElementById('btn-movies-back');
  if (btnMoviesBack) {
    btnMoviesBack.addEventListener('click', () => {
      moviesCatGrid.style.display = 'none';
      mainCatGrid.style.display = 'grid';
    });
  }

  // Category selection in Lobby
  catCards.forEach(card => {
    card.addEventListener('click', () => {
      if (myId !== roomState.hostId) return; // Only host can pick
      
      const cat = card.dataset.category;
      if (cat === 'custom') {
        selectedCategory = 'custom';
        showScreen('screen-custom');
        initCustomMode();
        return;
      }
      
      if (cat === 'gaming') {
        mainCatGrid.style.display = 'none';
        moviesCatGrid.style.display = 'none';
        gamingCatGrid.style.display = 'grid';
        return;
      }
      
      if (cat === 'movies') {
        mainCatGrid.style.display = 'none';
        gamingCatGrid.style.display = 'none';
        moviesCatGrid.style.display = 'grid';
        return;
      }
      
      selectedCategory = cat;
      socket.emit('update-category', { category: selectedCategory });
    });
  });

  // Handle nested gaming categories as well
  const gamingCards = document.querySelectorAll('#gaming-cat-grid .cat-card:not(#btn-gaming-back)');
  gamingCards.forEach(card => {
    card.addEventListener('click', () => {
      if (myId !== roomState.hostId) return;
      const cat = card.dataset.category;
      selectedCategory = cat;
      socket.emit('update-category', { category: selectedCategory });
    });
  });

  // Handle nested movies categories as well
  const moviesCards = document.querySelectorAll('#movies-cat-grid .cat-card:not(#btn-movies-back)');
  moviesCards.forEach(card => {
    card.addEventListener('click', () => {
      if (myId !== roomState.hostId) return;
      const cat = card.dataset.category;
      selectedCategory = cat;
      socket.emit('update-category', { category: selectedCategory });
    });
  });

  // ── Custom Mode ──
  btnCustomBack.addEventListener('click', () => {
    // If they cancel custom mode, we shouldn't keep it selected.
    // We revert to whatever the room actually has.
    if (roomState) {
      selectedCategory = roomState.category;
    }
    showScreen('screen-lobby');
  });

  btnAddCard.addEventListener('click', () => {
    addCustomCardForm();
  });

  btnCustomSave.addEventListener('click', () => {
    const cards = collectCustomCards();
    if (cards.length === 0) {
      showToast('En az 1 kart oluşturun.', 'error');
      return;
    }
    btnCustomSave.disabled = true;
    selectedCategory = 'custom';
    socket.emit('update-category', { category: 'custom', customCards: cards });
    showScreen('screen-lobby');
    btnCustomSave.disabled = false;
  });
}

function initCustomMode() {
  const list = document.getElementById('custom-cards-list');
  list.innerHTML = '';
  customCards = [];
  document.getElementById('btn-custom-save').disabled = true;
  addCustomCardForm();
}

let customCardIdCounter = 0;

function addCustomCardForm() {
  const list = document.getElementById('custom-cards-list');
  const id = ++customCardIdCounter;

  const div = document.createElement('div');
  div.className = 'custom-card-item';
  div.dataset.cardId = id;
  div.innerHTML = `
    <div class="card-number">
      <span>Kart ${list.children.length + 1}</span>
      <button class="custom-card-remove" data-remove="${id}">Kaldır</button>
    </div>
    <input type="text" class="main-word-input" data-field="main" placeholder="Ana kelime" maxlength="40" autocomplete="off">
    <div class="forbidden-label">Yasaklı kelimeler</div>
    <input type="text" data-field="f1" placeholder="Yasaklı kelime 1" maxlength="30" autocomplete="off">
    <input type="text" data-field="f2" placeholder="Yasaklı kelime 2" maxlength="30" autocomplete="off">
    <input type="text" data-field="f3" placeholder="Yasaklı kelime 3" maxlength="30" autocomplete="off">
    <input type="text" data-field="f4" placeholder="Yasaklı kelime 4" maxlength="30" autocomplete="off">
    <input type="text" data-field="f5" placeholder="Yasaklı kelime 5" maxlength="30" autocomplete="off">
  `;

  list.appendChild(div);

  setTimeout(() => {
    div.querySelector('.main-word-input').focus();
  }, 50);

  div.querySelector('.custom-card-remove').addEventListener('click', () => {
    div.remove();
    renumberCustomCards();
    updateCustomCreateBtn();
  });

  div.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => updateCustomCreateBtn());
  });

  div.scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateCustomCreateBtn();
}

function renumberCustomCards() {
  const list = document.getElementById('custom-cards-list');
  list.querySelectorAll('.custom-card-item').forEach((item, idx) => {
    item.querySelector('.card-number span').textContent = `Kart ${idx + 1}`;
  });
}

function collectCustomCards() {
  const list = document.getElementById('custom-cards-list');
  const cards = [];
  list.querySelectorAll('.custom-card-item').forEach(item => {
    const main = item.querySelector('[data-field="main"]').value.trim();
    if (!main) return;
    const forbidden = [];
    for (let i = 1; i <= 5; i++) {
      const val = item.querySelector(`[data-field="f${i}"]`).value.trim();
      if (val) forbidden.push(val);
    }
    cards.push({ main, forbidden });
  });
  return cards;
}

function updateCustomCreateBtn() {
  const cards = collectCustomCards();
  document.getElementById('btn-custom-save').disabled = (cards.length === 0);
}

// ═══════════════ LOBBY EVENTS ═══════════════

function initLobbyEvents() {
  // Team join buttons
  document.querySelectorAll('.btn-team').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = btn.dataset.team;
      socket.emit('switch-team', { team });
    });
  });

  // Copy room code only
  document.getElementById('btn-copy-code-only').addEventListener('click', () => {
    const code = document.getElementById('lobby-room-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      showToast('Oda kodu kopyalandı! 📋', 'success');
    });
  });

  // Copy invite link
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const code = document.getElementById('lobby-room-code').textContent;
    const shareUrl = `${window.location.origin}?room=${code}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('Davet linki kopyalandı! 🔗', 'success');
    });
  });

  // Team name changes (host only)
  const teamAInput = document.getElementById('team-a-name-input');
  const teamBInput = document.getElementById('team-b-name-input');

  let nameDebounce = null;
  teamAInput.addEventListener('input', () => {
    clearTimeout(nameDebounce);
    nameDebounce = setTimeout(() => {
      socket.emit('update-team-name', { team: 'A', name: teamAInput.value });
    }, 500);
  });

  teamBInput.addEventListener('input', () => {
    clearTimeout(nameDebounce);
    nameDebounce = setTimeout(() => {
      socket.emit('update-team-name', { team: 'B', name: teamBInput.value });
    }, 500);
  });

  // Settings changes
  document.getElementById('setting-round-time').addEventListener('change', (e) => {
    socket.emit('update-settings', { settings: { roundTime: e.target.value } });
  });

  document.getElementById('setting-target-score').addEventListener('change', (e) => {
    socket.emit('update-settings', { settings: { targetScore: e.target.value } });
  });

  // Start game
  document.getElementById('btn-start-game').addEventListener('click', () => {
    socket.emit('start-game');
  });
}

// ═══════════════ SOCKET EVENTS ═══════════════

function initSocketEvents() {
  socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected:', myId);
  });

  socket.on('room-created', ({ roomCode }) => {
    myRoomCode = roomCode;
    showScreen('screen-lobby');
    document.getElementById('lobby-room-code').textContent = roomCode;
    showToast('Oda oluşturuldu! 🏟️', 'success');
    // Update URL without reload
    window.history.replaceState({}, '', `?room=${roomCode}`);
  });

  socket.on('room-joined', ({ roomCode }) => {
    myRoomCode = roomCode;
    showScreen('screen-lobby');
    document.getElementById('lobby-room-code').textContent = roomCode;
    showToast('Odaya katıldınız! 🎯', 'success');
    window.history.replaceState({}, '', `?room=${roomCode}`);
  });

  socket.on('room-updated', (state) => {
    roomState = state;
    renderLobby(state);
  });

  socket.on('player-joined', ({ playerName }) => {
    showToast(`${playerName} katıldı! 👋`, 'info');
  });

  socket.on('phase-taboo-pick', (data) => {
    clearTimer();
    renderTabooPick(data);
    showScreen('screen-taboo-pick');
  });

  socket.on('phase-describe', (data) => {
    clearTimer();
    renderDescribe(data);
    showScreen('screen-describe');
  });

  socket.on('round-end', (data) => {
    clearTimer();
    renderRoundEnd(data);
    showScreen('screen-round-end');
  });

  socket.on('game-over', (data) => {
    clearTimer();
    renderGameOver(data);
    showScreen('screen-game-over');
  });

  socket.on('taboo-words-confirmed', (data) => {
    const container = document.getElementById('taboo-pick-content');
    if (!container) return;

    const roleBadge = container.querySelector('.role-badge');
    const isOpposing = roleBadge && roleBadge.classList.contains('role-badge-opposing');

    let html = `
      <div style="text-align: center; padding: 40px 20px;">
        <h2 style="color: var(--green-400); margin-bottom: 16px;">Yasaklı Kelimeler Onaylandı!</h2>
        <p style="color: var(--text-secondary); margin-bottom: 24px;">
          ${data.submitterName} tarafından kelimeler belirlendi.
        </p>
    `;

    if (isOpposing) {
      html += `
        <div class="taboo-words-display">
          <h3>Seçilen Kelimeler</h3>
          ${data.tabooWords.map(w => `
            <div class="taboo-word-item">
              <span class="taboo-word-icon">✕</span>
              <span>${w}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      html += `
        <div class="info-box">
          <h3>⏳ Oyun Başlıyor...</h3>
          <p>Hazır olun!</p>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  });

  socket.on('mid-round-result', (data) => {
    const { reason, msg, penalty, remainingTime } = data;
    showToast(msg, reason === 'correct' ? 'success' : (reason === 'taboo' ? 'error' : 'warning'));

    if (reason === 'pass' && penalty > 0) {
      const textEl = document.getElementById('desc-timer-text');
      const timerContainer = document.getElementById('desc-game-timer');
      if (textEl && timerContainer) {
        clearTimer();
        
        timerContainer.classList.add('penalty-flash');
        setTimeout(() => timerContainer.classList.remove('penalty-flash'), 1000);
        
        const currentText = parseInt(textEl.textContent);
        if (!isNaN(currentText)) {
            textEl.innerHTML = `<span style="color:var(--red-400)">-${penalty}</span>`;
            setTimeout(() => {
                textEl.textContent = remainingTime;
            }, 1000);
        }
      }
    } else {
       clearTimer();
       const textEl = document.getElementById('desc-timer-text');
       if(textEl) {
           textEl.textContent = remainingTime;
       }
    }
    
    // Disable action buttons
    document.querySelectorAll('.action-buttons .btn').forEach(btn => btn.disabled = true);
  });

  socket.on('back-to-lobby', () => {
    clearTimer();
    showScreen('screen-lobby');
  });

  socket.on('toast', ({ message, type }) => {
    showToast(message, type);
  });

  socket.on('error-msg', ({ message }) => {
    showToast(message, 'error');
    // Re-enable buttons
    document.querySelectorAll('.btn').forEach(b => b.disabled = false);
  });

  socket.on('disconnect', () => {
    showToast('Bağlantı kesildi! Yeniden bağlanılıyor...', 'error');
  });

  socket.on('reconnect', () => {
    showToast('Yeniden bağlanıldı! ✓', 'success');
  });

  socket.on('taboo-word-sync-receive', ({ index, word, senderId }) => {
    const input = document.getElementById(`taboo-word-${index}`);
    if (input) {
      input.value = word;
      
      // Highlight briefly to show it changed remotely
      input.style.transition = 'background-color 0.2s';
      input.style.backgroundColor = 'rgba(16, 185, 129, 0.2)'; // Var green
      setTimeout(() => {
        input.style.backgroundColor = '';
      }, 500);
    }
  });
}

// ═══════════════ RENDER: LOBBY ═══════════════

function renderLobby(state) {
  const isHost = state.hostId === myId;
  
  // Category UI sync
  const catGrid = document.getElementById('lobby-cat-grid');
  const gamingGrid = document.getElementById('gaming-cat-grid');
  const moviesGrid = document.getElementById('movies-cat-grid');
  const allCatCards = document.querySelectorAll('.cat-card');
  const hostBadge = document.getElementById('category-host-badge');
  
  if (isHost) {
    catGrid.style.pointerEvents = 'auto';
    catGrid.style.opacity = '1';
    gamingGrid.style.pointerEvents = 'auto';
    moviesGrid.style.pointerEvents = 'auto';
    hostBadge.style.display = 'none';
  } else {
    catGrid.style.pointerEvents = 'none';
    catGrid.style.opacity = '0.6';
    gamingGrid.style.pointerEvents = 'none';
    moviesGrid.style.pointerEvents = 'none';
    hostBadge.style.display = 'inline-block';
  }

  // Show correct grid based on category
  if (state.category && state.category.startsWith('gaming_')) {
    catGrid.style.display = 'none';
    moviesGrid.style.display = 'none';
    gamingGrid.style.display = 'grid';
  } else if (state.category && state.category.startsWith('movies_')) {
    catGrid.style.display = 'none';
    gamingGrid.style.display = 'none';
    moviesGrid.style.display = 'grid';
  } else {
    gamingGrid.style.display = 'none';
    moviesGrid.style.display = 'none';
    catGrid.style.display = 'grid';
  }

  allCatCards.forEach(card => {
    if (
      card.dataset.category === state.category || 
      (card.dataset.category === 'gaming' && state.category && state.category.startsWith('gaming_')) ||
      (card.dataset.category === 'movies' && state.category && state.category.startsWith('movies_'))
    ) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  // Team A players
  const teamAEl = document.getElementById('team-a-players');
  teamAEl.innerHTML = state.teamA.players.map(p => `
    <div class="team-player-item ${p.id === myId ? 'is-me' : ''}">
      <span>${p.name}</span>
      ${p.id === state.hostId ? '<span class="host-badge">HOST</span>' : ''}
    </div>
  `).join('') || '<div style="color:var(--text-muted);font-size:0.85rem;padding:12px;">Oyuncu bekleniyor...</div>';

  // Team B players
  const teamBEl = document.getElementById('team-b-players');
  teamBEl.innerHTML = state.teamB.players.map(p => `
    <div class="team-player-item ${p.id === myId ? 'is-me' : ''}">
      <span>${p.name}</span>
      ${p.id === state.hostId ? '<span class="host-badge">HOST</span>' : ''}
    </div>
  `).join('') || '<div style="color:var(--text-muted);font-size:0.85rem;padding:12px;">Oyuncu bekleniyor...</div>';

  // Unassigned players
  const unassignedEl = document.getElementById('unassigned-section');
  const unassignedList = document.getElementById('unassigned-players');
  if (state.unassigned.length > 0) {
    unassignedEl.style.display = 'block';
    unassignedList.innerHTML = state.unassigned.map(p => `
      <div class="team-player-item ${p.id === myId ? 'is-me' : ''}">
        ${p.name}
        ${p.id === state.hostId ? '<span class="host-badge">HOST</span>' : ''}
      </div>
    `).join('');
  } else {
    unassignedEl.style.display = 'none';
  }

  // Team names
  const teamANameInput = document.getElementById('team-a-name-input');
  const teamBNameInput = document.getElementById('team-b-name-input');
  if (document.activeElement !== teamANameInput) teamANameInput.value = state.teamA.name;
  if (document.activeElement !== teamBNameInput) teamBNameInput.value = state.teamB.name;

  // Only host can edit team names and settings
  teamANameInput.readOnly = !isHost;
  teamBNameInput.readOnly = !isHost;
  document.getElementById('setting-round-time').disabled = !isHost;
  document.getElementById('setting-target-score').disabled = !isHost;

  // Settings
  if (isHost) {
    document.getElementById('settings-card').style.display = 'block';
  }
  document.getElementById('setting-round-time').value = state.settings.roundTime;
  document.getElementById('setting-target-score').value = state.settings.targetScore;

  // Start button (host only, enough players)
  const hasPlayers = state.teamA.players.length >= 2 && state.teamB.players.length >= 2;
  const hasValidCategory = state.category && state.category !== 'custom' || (state.category === 'custom' && state.hasCustomCards);
  const canStart = hasPlayers && hasValidCategory;
  
  const startBtn = document.getElementById('btn-start-game');
  const hint = document.getElementById('lobby-hint') || document.createElement('div'); // Handle if hint doesn't exist
  if (!document.getElementById('lobby-hint')) {
    hint.id = 'lobby-hint';
    hint.style.textAlign = 'center';
    hint.style.marginTop = '8px';
    hint.style.color = 'var(--text-muted)';
    startBtn.parentNode.insertBefore(hint, startBtn.nextSibling);
  }

  if (isHost) {
    startBtn.style.display = 'block';
    startBtn.disabled = !canStart;
    if (!canStart) {
      startBtn.style.opacity = '0.5';
      if (!hasPlayers) {
        hint.textContent = `Her takımda en az 2 oyuncu olmalı. (A: ${state.teamA.players.length}, B: ${state.teamB.players.length})`;
      } else if (!hasValidCategory) {
        hint.textContent = state.category === 'custom' ? 'Özel mod için kart oluşturmalısınız.' : 'Lütfen bir kategori seçin.';
      }
      hint.style.display = 'block';
    } else {
      startBtn.style.opacity = '1';
      hint.style.display = 'none';
    }
  } else {
    startBtn.style.display = 'none';
    if (!canStart) {
      hint.textContent = 'Host\'un oyunu başlatması için takımların ve kategorinin hazır olması bekleniyor.';
      hint.style.display = 'block';
    } else {
      hint.textContent = 'Host oyunu başlatacak, hazır olun!';
      hint.style.display = 'block';
    }
  }

  // Scores
  document.getElementById('team-a-score-lobby').textContent = state.teamA.score;
  document.getElementById('team-b-score-lobby').textContent = state.teamB.score;
}

// ═══════════════ RENDER: TABOO PICK PHASE ═══════════════

function renderTabooPick(data) {
  const container = document.getElementById('taboo-pick-content');
  const { footballer, role, describerName, describingTeamName, opposingTeamName, timeLimit, scores, currentTeam, mainRemainingTime, totalRoundTime } = data;

  let html = renderScoreBar(scores, currentTeam);

  if (role === 'opposing') {
    // Opposing team: sees footballer, inputs taboo words
    html += `
      <div class="role-badge role-badge-opposing">🚫 Yasaklı Kelime Belirle</div>
      <p style="color:var(--text-secondary);margin-bottom:8px;">
        <strong>${describerName}</strong> (${describingTeamName}) bu futbolcuyu anlatacak
      </p>
      <div class="footballer-card">
        <div class="label">FUTBOLCU</div>
        <div class="footballer-name">${footballer}</div>
      </div>

      <div class="taboo-input-form" id="taboo-form">
        <h3>5 yasaklı kelime belirleyin</h3>
        ${[1,2,3,4,5].map(i => `
          <div class="taboo-input-item">
            <span class="taboo-number">${i}</span>
            <input type="text" class="taboo-input" id="taboo-word-${i}"
                   placeholder="Yasaklı kelime ${i}" maxlength="30" autocomplete="off">
          </div>
        `).join('')}
        <div style="margin-top:16px;text-align:center;">
          <button class="btn btn-danger btn-lg" id="btn-submit-taboo">
            🚫 Yasaklı Kelimeleri Gönder
          </button>
        </div>
      </div>
    `;
  } else if (role === 'describer') {
    // Describer: sees footballer, waits
    html += `
      <div class="role-badge role-badge-describer">📢 Sen Anlatacaksın</div>
      <p style="color:var(--text-secondary);margin-bottom:8px;">
        Bu futbolcuyu anlatmaya hazırlan!
      </p>
      <div class="footballer-card">
        <div class="label">FUTBOLCU</div>
        <div class="footballer-name">${footballer}</div>
      </div>
      <div class="info-box">
        <h3>⏳ Bekleyin</h3>
        <p>${opposingTeamName} yasaklı kelimeleri belirliyor
          <span class="waiting-dots"><span></span><span></span><span></span></span>
        </p>
      </div>
    `;
  } else {
    // Guesser: sees NOTHING about the footballer
    html += `
      <div class="role-badge role-badge-guesser">🎯 Tahmin Edeceksin</div>
      <p style="color:var(--text-secondary);margin-bottom:8px;">
        <strong>${describerName}</strong> anlatmaya hazırlanıyor
      </p>
      <div class="footballer-card hidden-card">
        <div class="label">FUTBOLCU</div>
        <div class="footballer-name">? ? ?</div>
      </div>
      <div class="info-box">
        <h3>🤫 Hazır Ol!</h3>
        <p>Futbolcu ismi sana gösterilmeyecek. Rakip takım yasaklı kelimeleri belirliyor, ardından anlatım başlayacak.
          <span class="waiting-dots"><span></span><span></span><span></span></span>
        </p>
      </div>
    `;
  }

  // Timer
  html += renderTimerHTML('pick-');

  if (role === 'describer' || role === 'guesser') {
    const progress = Math.min(1, Math.max(0, mainRemainingTime / (totalRoundTime || 60)));
    const offset = 282.74 * (1 - progress);
    
    html += `
      <div style="margin-top: 20px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
        <div style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 1px;">Kalan Anlatım Süreniz</div>
        <div class="timer-container" style="transform: scale(0.65); margin: 0; width: 100px; height: 100px;">
          <svg class="timer-svg" viewBox="0 0 100 100">
            <circle class="timer-bg-circle" cx="50" cy="50" r="45" style="stroke: var(--amber-500); opacity: 0.2;"/>
            <circle class="timer-progress-circle" cx="50" cy="50" r="45" style="stroke: var(--amber-500); stroke-dasharray: 282.74; stroke-dashoffset: ${offset};"/>
          </svg>
          <span class="timer-text" style="color: var(--amber-400); font-size: 1.5rem;">${mainRemainingTime}</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Start timer
  startTimer(timeLimit, 'pick-');

  // Taboo submit button handler
  if (role === 'opposing') {
    document.getElementById('btn-submit-taboo').addEventListener('click', submitTabooWords);

    // Focus first input
    setTimeout(() => {
      const firstInput = document.getElementById('taboo-word-1');
      if (firstInput) firstInput.focus();
    }, 300);

    // Sync inputs in real-time
    document.querySelectorAll('.taboo-input').forEach((input, idx) => {
      input.addEventListener('input', () => {
        socket.emit('taboo-word-sync', { index: idx + 1, word: input.value });
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const nextInput = document.getElementById(`taboo-word-${idx + 2}`);
          if (nextInput) nextInput.focus();
          else submitTabooWords();
        }
      });
    });
  }
}

function submitTabooWords() {
  const words = [];
  for (let i = 1; i <= 5; i++) {
    const input = document.getElementById(`taboo-word-${i}`);
    if (input && input.value.trim()) {
      words.push(input.value.trim());
    }
  }

  if (words.length === 0) {
    showToast('En az 1 yasaklı kelime girin!', 'warning');
    return;
  }

  socket.emit('submit-taboo-words', { words });
  document.getElementById('btn-submit-taboo').disabled = true;
  showToast('Yasaklı kelimeler gönderildi! ✓', 'success');
}

// ═══════════════ RENDER: DESCRIBE PHASE ═══════════════

function renderDescribe(data) {
  const container = document.getElementById('describe-content');
  const { footballer, tabooWords, role, describerName, describingTeamName, opposingTeamName, timeLimit, scores } = data;

  // Figure out current team from who is describing
  const currentTeam = roomState ? roomState.currentTeam : 'A';
  let html = renderScoreBar(scores, currentTeam);

  if (role === 'describer') {
    html += `
      <div class="role-badge role-badge-describer">📢 ANLATIYORSUN!</div>
      <div class="footballer-card">
        <div class="label">ANLAT</div>
        <div class="footballer-name">${footballer}</div>
      </div>
    `;

    if (tabooWords.length > 0) {
      html += `
        <div class="taboo-words-display">
          <h3>🚫 YASAKLI KELİMELER</h3>
          ${tabooWords.map(w => `
            <div class="taboo-word-item">
              <span class="taboo-word-icon">✕</span>
              <span>${w}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    html += renderTimerHTML('desc-');

    html += `
      <div class="action-buttons">
        <button class="btn btn-primary" id="btn-correct">✓ Doğru Bildi</button>
        <button class="btn btn-warning" id="btn-pass">⟫ Pas</button>
      </div>
    `;
  } else if (role === 'opposing') {
    html += `
      <div class="role-badge role-badge-opposing">👀 GÖZLEMLE</div>
      <p style="color:var(--text-secondary);margin-bottom:8px;">
        <strong>${describerName}</strong> anlatıyor. Yasaklı kelime kullanırsa TABU bas!
      </p>
      <div class="footballer-card">
        <div class="label">FUTBOLCU</div>
        <div class="footballer-name">${footballer}</div>
      </div>
    `;

    if (tabooWords.length > 0) {
      html += `
        <div class="taboo-words-display">
          <h3>🚫 YASAKLI KELİMELER</h3>
          ${tabooWords.map(w => `
            <div class="taboo-word-item">
              <span class="taboo-word-icon">✕</span>
              <span>${w}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    html += renderTimerHTML('desc-');

    html += `
      <div class="action-buttons">
        <button class="btn btn-danger" id="btn-taboo" style="max-width:300px;">🚫 TABU!</button>
      </div>
    `;
  } else {
    // Guesser - sees NOTHING
    html += `
      <div class="role-badge role-badge-guesser">🎯 TAHMİN ET!</div>
      <div class="footballer-card hidden-card">
        <div class="label">FUTBOLCU</div>
        <div class="footballer-name">? ? ?</div>
      </div>
      <div class="info-box">
        <h3>🎧 Dinle ve Tahmin Et!</h3>
        <p><strong>${describerName}</strong> anlatıyor. Futbolcunun kim olduğunu tahmin etmeye çalış!</p>
      </div>
    `;

    html += renderTimerHTML('desc-');
  }

  container.innerHTML = html;

  // Start timer
  startTimer(timeLimit, 'desc-');

  // Button handlers
  if (role === 'describer') {
    document.getElementById('btn-correct').addEventListener('click', () => {
      socket.emit('correct-guess');
      document.getElementById('btn-correct').disabled = true;
      document.getElementById('btn-pass').disabled = true;
    });

    document.getElementById('btn-pass').addEventListener('click', () => {
      socket.emit('pass');
      document.getElementById('btn-correct').disabled = true;
      document.getElementById('btn-pass').disabled = true;
    });
  } else if (role === 'opposing') {
    document.getElementById('btn-taboo').addEventListener('click', () => {
      socket.emit('taboo-violation');
      document.getElementById('btn-taboo').disabled = true;
    });
  }
}

// ═══════════════ RENDER: ROUND END ═══════════════

function renderRoundEnd(data) {
  const container = document.getElementById('round-end-content');
  const { result, footballer, tabooWords, describingTeamName, scores, hostId } = data;
  const isHost = hostId === myId;

  const resultConfig = {
    correct: { icon: '🎉', title: 'Doğru Bildi!', class: 'correct' },
    taboo: { icon: '🚫', title: 'TABU İhlali!', class: 'taboo' },
    pass: { icon: '⏭️', title: 'Pas Geçildi', class: 'pass' },
    timeout: { icon: '⏰', title: 'Süre Doldu!', class: 'timeout' }
  };

  const config = resultConfig[result] || resultConfig.timeout;

  let html = `
    <div class="result-icon">${config.icon}</div>
    <div class="result-title ${config.class}">${config.title}</div>

    <div class="result-footballer">
      Futbolcu: <strong>${footballer}</strong>
    </div>
  `;

  if (tabooWords.length > 0) {
    html += `
      <div class="taboo-words-display" style="margin-bottom:20px;">
        <h3>Yasaklı Kelimeler</h3>
        ${tabooWords.map(w => `
          <div class="taboo-word-item" style="opacity:1;animation:none;">
            <span class="taboo-word-icon">✕</span>
            <span>${w}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  html += renderScoreBar(scores, null);

  if (isHost) {
    html += `
      <button class="btn btn-start btn-lg" id="btn-next-round" style="margin-top:24px;">
        ➡️ Sonraki Tur
      </button>
    `;
  } else {
    html += `
      <div class="info-box" style="margin-top:20px;">
        <p>Host sonraki tura geçecek...</p>
      </div>
    `;
  }

  container.innerHTML = html;

  if (isHost) {
    document.getElementById('btn-next-round').addEventListener('click', () => {
      socket.emit('next-round');
      document.getElementById('btn-next-round').disabled = true;
    });
  }
}

// ═══════════════ RENDER: GAME OVER ═══════════════

function renderGameOver(data) {
  const container = document.getElementById('game-over-content');
  const { winner, result, footballer, scores, hostId } = data;
  const isHost = hostId === myId;

  spawnConfetti();

  let html = `
    <div class="result-icon">🏆</div>
    <div class="winner-section">
      <div class="winner-title">${winner}</div>
      <div class="winner-sub">KAZANDI!</div>
    </div>

    <div class="result-footballer" style="margin:16px 0;">
      Son futbolcu: <strong>${footballer}</strong>
    </div>

    ${renderScoreBar(scores, null)}

    <div style="margin-top:24px;">
  `;

  if (isHost) {
    html += `
      <button class="btn btn-start btn-lg" id="btn-new-game">
        🔄 Yeni Oyun
      </button>
    `;
  } else {
    html += `
      <div class="info-box">
        <p>Host yeni oyun başlatabilir.</p>
      </div>
    `;
  }

  html += `</div>`;

  container.innerHTML = html;

  if (isHost) {
    document.getElementById('btn-new-game').addEventListener('click', () => {
      socket.emit('new-game');
    });
  }
}

// ═══════════════ SHARED UI COMPONENTS ═══════════════

function renderScoreBar(scores, currentTeam) {
  return `
    <div class="score-bar">
      <div class="score-team score-team-a ${currentTeam === 'A' ? 'active-team' : ''}">
        <span class="score-team-name">${scores.teamA.name}</span>
        <span class="score-team-value">${scores.teamA.score}</span>
      </div>
      <span class="score-separator">—</span>
      <div class="score-team score-team-b ${currentTeam === 'B' ? 'active-team' : ''}">
        <span class="score-team-name">${scores.teamB.name}</span>
        <span class="score-team-value">${scores.teamB.score}</span>
      </div>
    </div>
  `;
}

function renderTimerHTML(idPrefix = '') {
  return `
    <div class="timer-container" id="${idPrefix}game-timer">
      <svg class="timer-svg" viewBox="0 0 100 100">
        <circle class="timer-bg-circle" cx="50" cy="50" r="45"/>
        <circle class="timer-progress-circle" cx="50" cy="50" r="45"
                id="${idPrefix}timer-circle"/>
      </svg>
      <span class="timer-text" id="${idPrefix}timer-text">--</span>
    </div>
  `;
}

// ═══════════════ TIMER ═══════════════

function startTimer(totalSeconds, prefix = '') {
  clearTimer();

  let remaining = totalSeconds;
  const circumference = 2 * Math.PI * 45; // ~282.74

  const container = document.getElementById(`${prefix}game-timer`);
  const textEl = document.getElementById(`${prefix}timer-text`);
  const circleEl = document.getElementById(`${prefix}timer-circle`);

  if (!container || !textEl || !circleEl) return;

  circleEl.style.strokeDasharray = circumference;

  function update() {
    textEl.textContent = remaining;

    const progress = remaining / totalSeconds;
    circleEl.style.strokeDashoffset = circumference * (1 - progress);

    // Color states
    container.classList.remove('warning', 'critical');
    if (remaining <= 5) {
      container.classList.add('critical');
    } else if (remaining <= 10) {
      container.classList.add('warning');
    }
  }

  update();

  timerInterval = setInterval(() => {
    remaining--;
    if (remaining < 0) {
      clearTimer();
      return;
    }
    update();
  }, 1000);
}

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ═══════════════ TOAST ═══════════════

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ═══════════════ CONFETTI ═══════════════

function spawnConfetti() {
  const colors = ['#4ade80', '#fbbf24', '#60a5fa', '#f87171', '#a78bfa', '#f472b6'];
  const container = document.body;

  for (let i = 0; i < 60; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti-piece';
    confetti.style.left = Math.random() * 100 + 'vw';
    confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
    confetti.style.animationDelay = Math.random() * 1 + 's';
    confetti.style.width = (6 + Math.random() * 8) + 'px';
    confetti.style.height = (6 + Math.random() * 8) + 'px';
    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    container.appendChild(confetti);

    setTimeout(() => confetti.remove(), 5000);
  }
}
