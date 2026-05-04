import { MATCH_TARGET_SCORE, TILE_THEMES, BG_THEMES, AVATAR_OPTIONS } from './constants.js';

function safeScene(game) {
  if (!game || !game.scene) return null;
  const scene = game.scene.getScene('DominoAmazonicoScene');
  if (scene) return scene;
  if (game.scene.scenes && game.scene.scenes.length) {
    return game.scene.scenes[0];
  }
  return null;
}

function makeSwatch(fill, border, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'settings-swatch';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = '<span class="settings-swatch__dot"></span><span class="sr-only">' + label + '</span>';
  const dot = button.querySelector('.settings-swatch__dot');
  dot.style.background = fill;
  dot.style.borderColor = border;
  return button;
}

function makeAvatarButton(option) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'avatar-cycle-btn';
  button.dataset.avatarKey = option.key;
  button.innerHTML = '<span class="avatar-cycle-btn__label">Avatar</span><span class="avatar-cycle-btn__value">' + option.name + '</span>';
  return button;
}

export function initDominoAmazonicoUI(game) {
  const overlay = document.getElementById('hud-overlay');
  const chatList = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatQuickSelect = document.getElementById('chat-quick-select');
  const tileThemeRow = document.getElementById('tile-theme-swatches');
  const tableThemeRow = document.getElementById('table-theme-swatches');
  const avatarRow = document.getElementById('avatar-options');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsButton = document.getElementById('settings-toggle');
  const settingsCloseButton = document.getElementById('settings-close');
  const chatToggle = document.getElementById('chat-toggle');
  const chatPanel = document.getElementById('chat-panel');
  const soundButton = document.getElementById('sound-toggle');
  const restartButton = document.getElementById('restart-round');
  const fullscreenButton = document.getElementById('fullscreen-toggle');
  const humanImageInput = document.getElementById('human-avatar-upload');
  const themePresetLight = document.getElementById('theme-preset-light');
  const themePresetDark = document.getElementById('theme-preset-dark');
  const pointsInput = document.getElementById('points-input');
  const pointsMinus = document.getElementById('points-minus');
  const pointsPlus = document.getElementById('points-plus');
  const passButton = document.getElementById('pass-turn-button');
  const galoButton = document.getElementById('galo-button');
  const actionHint = document.getElementById('action-hint');
  const headerSubtitle = document.getElementById('header-subtitle');

  let messageCount = 0;
  let unreadCount = 0;

  if (!overlay || !chatList || !chatForm || !chatQuickSelect || !chatToggle || !chatPanel) {
    return;
  }

  const updateFullscreenLabel = function() {
    if (!fullscreenButton) return;
    fullscreenButton.textContent = document.fullscreenElement ? '🗗 Sair da tela cheia' : '⛶ Tela cheia';
  };

  const updateChatToggleText = function() {
    const isChatHidden = chatPanel.classList.contains('is-hidden');
    if (isChatHidden && unreadCount > 0) {
      chatToggle.textContent = 'Chat 💬 (' + unreadCount + ')';
    } else {
      chatToggle.textContent = 'Chat 💬';
    }
  };

  updateChatToggleText();
  updateFullscreenLabel();

  const api = {
    scene: null,
    attachScene: function(scene) {
      this.scene = scene;
      this.syncSettingsState();
    },
    syncSettingsState: function() {
      const scene = this.scene || safeScene(game);
      if (!scene) return;


      if (tileThemeRow && tileThemeRow.children) {
        Array.from(tileThemeRow.children).forEach(function(button, index) {
          button.classList.toggle('is-active', index === scene.currentTileThemeIndex);
        });
      }
      if (tableThemeRow && tableThemeRow.children) {
        Array.from(tableThemeRow.children).forEach(function(button, index) {
          button.classList.toggle('is-active', index === scene.currentBgThemeIndex);
        });
      }
      if (avatarRow && avatarRow.children) {
        Array.from(avatarRow.children).forEach(function(button) {
          const human = scene.players && Array.isArray(scene.players) ? scene.players[0] : null;
          button.classList.toggle('is-active', Boolean(human && button.dataset.avatarKey === human.avatarKey));
        });
      }

      soundButton.textContent = scene.soundEnabled ? '🔊 Som' : '🔇 Som';
      if (pointsInput) {
        pointsInput.value = String(scene.pendingAnnouncement || 0);
      }
      if (galoButton) {
        galoButton.classList.toggle('is-active', Boolean(scene.pendingGalo));
      }
      if (themePresetLight) themePresetLight.classList.toggle('is-active', scene.currentVisualMode === 'light');
      if (themePresetDark) themePresetDark.classList.toggle('is-active', scene.currentVisualMode === 'dark');
      if (actionHint) {
        actionHint.textContent = scene.pendingGalo
          ? 'GALO armado para a próxima jogada. Se confirmar, ganha +50 e joga novamente.'
          : 'Informe os pontos em passos de 5 antes de jogar. Após a jogada, o marcador volta para zero.';
      }
    },
    addMessage: function(author, text, kind) {
      kind = kind || 'player';
      if (!text) return;
      const item = document.createElement('div');
      item.className = 'chat-message chat-message--' + kind;
      item.innerHTML = '<strong>' + author + ':</strong> <span>' + text + '</span>';
      chatList.appendChild(item);
      chatList.scrollTop = chatList.scrollHeight;
      messageCount++;
      const isChatHidden = chatPanel.classList.contains('is-hidden');
      if (isChatHidden) {
        unreadCount++;
      }
      updateChatToggleText();
    },
    addSystemMessage: function(text) {
      if (!text) return;
      const item = document.createElement('div');
      item.className = 'chat-message chat-message--system';
      item.textContent = text;
      chatList.appendChild(item);
      chatList.scrollTop = chatList.scrollHeight;
    }
  };

  window.dominoAmazonicoUI = api;

  if (headerSubtitle) {
    headerSubtitle.textContent = 'Partida até ' + MATCH_TARGET_SCORE + ' pontos';
  }

  TILE_THEMES.forEach(function(theme, index) {
    const swatch = makeSwatch(theme.face, theme.edge, 'Pedras: ' + theme.name);
    swatch.addEventListener('click', function() {
      const scene = api.scene || safeScene(game);
      if (!scene) return;
      scene.applyTileTheme(index);
      api.syncSettingsState();
    });
    tileThemeRow.appendChild(swatch);
  });

  BG_THEMES.forEach(function(theme, index) {
    const swatch = makeSwatch(theme.felt, theme.glow, 'Mesa: ' + theme.name);
    swatch.addEventListener('click', function() {
      const scene = api.scene || safeScene(game);
      if (!scene) return;
      scene.applyBgTheme(index);
      api.syncSettingsState();
    });
    tableThemeRow.appendChild(swatch);
  });

  if (themePresetLight) {
    themePresetLight.addEventListener('click', function() {
      const scene = api.scene || safeScene(game);
      if (!scene || typeof scene.applyVisualPreset !== 'function') return;
      scene.applyVisualPreset('light');
      api.syncSettingsState();
    });
  }

  if (themePresetDark) {
    themePresetDark.addEventListener('click', function() {
      const scene = api.scene || safeScene(game);
      if (!scene || typeof scene.applyVisualPreset !== 'function') return;
      scene.applyVisualPreset('dark');
      api.syncSettingsState();
    });
  }

  if (avatarRow) {
    AVATAR_OPTIONS.forEach(function(option) {
      const button = makeAvatarButton(option);
      button.addEventListener('click', function() {
        const scene = api.scene || safeScene(game);
        if (!scene || typeof scene.applyHumanAvatarPreset !== 'function') return;
        scene.applyHumanAvatarPreset(option.key);
        api.syncSettingsState();
      });
      avatarRow.appendChild(button);
    });
  }

  chatForm.addEventListener('submit', function(event) {
    event.preventDefault();
    const text = chatQuickSelect.value.trim();
    if (!text) return;
    api.addMessage('Você', text, 'self');
    chatQuickSelect.value = '';
    const scene = api.scene || safeScene(game);
    if (scene && typeof scene.onHumanChat === 'function') {
      scene.onHumanChat(text);
    }
  });

  chatToggle.addEventListener('click', function() {
    chatPanel.classList.toggle('is-hidden');
    const isChatHidden = chatPanel.classList.contains('is-hidden');
    if (!isChatHidden) {
      unreadCount = 0;
    }
    updateChatToggleText();
  });

  if (settingsButton) {
    settingsButton.addEventListener('click', function() {
      if (settingsPanel) settingsPanel.classList.toggle('is-open');
    });
  }

  if (settingsCloseButton) {
    settingsCloseButton.addEventListener('click', function() {
      if (settingsPanel) settingsPanel.classList.remove('is-open');
    });
  }

  soundButton.addEventListener('click', function() {
    const scene = api.scene || safeScene(game);
    if (!scene) return;
    scene.toggleSoundEnabled();
    api.syncSettingsState();
  });

  if (restartButton) {
    restartButton.addEventListener('click', function() {
      const scene = api.scene || safeScene(game);
      if (!scene) {
        api.addSystemMessage('A partida ainda não está pronta. Aguarde alguns segundos e tente de novo.');
        return;
      }
      if (settingsPanel) settingsPanel.classList.remove('is-open');
      scene.startNewRound();
    });
  }

  if (fullscreenButton) {
    fullscreenButton.addEventListener('click', async function() {
      const target = document.documentElement;
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else if (target.requestFullscreen) {
          await target.requestFullscreen();
        }
      } catch (error) {
        api.addSystemMessage('Tela cheia indisponível neste navegador.');
      }
      updateFullscreenLabel();
    });
    document.addEventListener('fullscreenchange', updateFullscreenLabel);
  }

  if (pointsMinus) {
    pointsMinus.addEventListener('click', function() {
      const scene = api.scene || safeScene(game);
      if (!scene || typeof scene.adjustPendingAnnouncement !== 'function') return;
      scene.adjustPendingAnnouncement(-5);
      // Sincroniza input visual imediatamente
      if (pointsInput) pointsInput.value = String(scene.pendingAnnouncement || 0);
      api.syncSettingsState();
    });
  }

  if (pointsPlus) {
    pointsPlus.addEventListener('click', function() {
      const scene = api.scene || safeScene(game);
      if (!scene || typeof scene.adjustPendingAnnouncement !== 'function') return;
      scene.adjustPendingAnnouncement(5);
      // Sincroniza input visual imediatamente
      if (pointsInput) {
        pointsInput.value = String(scene.pendingAnnouncement || 0);
        pointsInput.classList.add('button-pressed');
        setTimeout(() => pointsInput.classList.remove('button-pressed'), 120);
      }
      api.syncSettingsState();
    });
  }

  if (pointsInput) {
    pointsInput.setAttribute('readonly', 'readonly');
    pointsInput.addEventListener('keydown', function(e) {
      e.preventDefault();
      return false;
    });
    pointsInput.addEventListener('paste', function(e) {
      e.preventDefault();
      return false;
    });
  }

  if (passButton) {
    passButton.addEventListener('click', function() {
      const scene = api.scene || safeScene(game);
      if (!scene || typeof scene.requestHumanPass !== 'function') return;

      // Feedback visual
      passButton.classList.add('button-pressed');
      setTimeout(() => passButton.classList.remove('button-pressed'), 200);

      scene.requestHumanPass();
      api.addSystemMessage('Você passou a vez.');
      api.syncSettingsState();
    });
  }

  if (galoButton) {
    galoButton.addEventListener('click', function() {
      const scene = api.scene || safeScene(game);
      if (!scene || typeof scene.toggleGaloAnnouncement !== 'function') return;

      // Feedback visual
      galoButton.classList.add('button-pressed');
      setTimeout(() => galoButton.classList.remove('button-pressed'), 200);

      const wasActive = scene.pendingGalo;
      scene.toggleGaloAnnouncement();

      // Destacar botão GALO quando ativo
      if (scene.pendingGalo) {
        galoButton.classList.add('is-active');
      } else {
        galoButton.classList.remove('is-active');
      }

      if (!wasActive && scene.pendingGalo) {
        api.addSystemMessage('GALO ativado! Você anunciou que fará todos os pontos restantes.');
      } else if (wasActive && !scene.pendingGalo) {
        api.addSystemMessage('GALO desativado.');
      }

      api.syncSettingsState();
    });
  }

  if (humanImageInput) {
    humanImageInput.addEventListener('change', function(event) {
      const file = event.target.files && event.target.files[0];
      const scene = api.scene || safeScene(game);
      if (!file || !scene || typeof scene.applyUploadedAvatarToHuman !== 'function') return;
      const reader = new FileReader();
      reader.onload = function() {
        if (typeof reader.result === 'string') {
          scene.applyUploadedAvatarToHuman(reader.result, true);
          api.syncSettingsState();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  window.addEventListener('message', function(event) {
    const scene = api.scene || safeScene(game);
    if (!scene || !event || !event.data) return;
    if (event.data.type === 'players' && typeof scene.applyExternalPlayers === 'function') {
      scene.applyExternalPlayers(event.data.players || []);
      api.syncSettingsState();
    }
    if (event.data.type === 'player-profile' && typeof scene.applyExternalProfile === 'function') {
      scene.applyExternalProfile({ profile: event.data.profile || null, stats: event.data.stats || null });
      api.syncSettingsState();
    }
    if (event.data.type === 'set-announcement') {
      const points = Math.max(0, Math.min(200, Number(event.data.points) || 0));
      scene.pendingAnnouncement = points;
      if (pointsInput) pointsInput.value = String(points);
      if (typeof scene.updatePointsDisplay === 'function') scene.updatePointsDisplay();
      api.syncSettingsState();
    }
    if (event.data.type === 'score-action') {
      if (event.data.action === 'galo' && typeof scene.toggleGaloAnnouncement === 'function') {
        scene.toggleGaloAnnouncement();
      }
      if (event.data.action === 'passei' && typeof scene.requestHumanPass === 'function') {
        scene.requestHumanPass();
      }
      api.syncSettingsState();
    }
  });

  api.addSystemMessage('Mesa pronta. Escolha modo claro ou escuro, ajuste os pontos e use GALO ou PASSEI quando necessário.');
}

// Função para resetar ação pendente após jogada
export function resetPendingAction(scene) {
  scene.pendingAnnouncedPoints = null;
  scene.pendingGalo = false;
  if (scene.setSelectedScore) scene.setSelectedScore(null);
  if (scene.refreshHudState) scene.refreshHudState();
}
