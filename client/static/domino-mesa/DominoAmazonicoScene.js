import {
  GAME_WIDTH, GAME_HEIGHT,
  TILE_W, TILE_H,
  HAND_TILE_SCALE, BOT_TILE_SCALE,
  MATCH_TARGET_SCORE, SNAP_DISTANCE,
  TILE_THEMES, BG_THEMES, PIP_LAYOUTS, AVATAR_OPTIONS
} from './constants.js';
import { showGameMessage } from './main.js';
import {
  calculateScore,
  getOpenEnds,
  hasValidMoves,
  canPlayDomino,
  orientDominoForSide,
  placeDominoOnBoard,
  areVerticalSidesUnlocked,
  getOpenValue,
  hasExclusiveNextPlay
} from '../../shared/gameEngine.js';

const CHAT_REPLIES = {
  human: ['Boa jogada!', 'Vou fechar a ponta.', 'Essa encaixa certinho.', 'Agora ficou bom.', 'Segura essa.', 'Deixa comigo!'],
  play:  ['Boa!', 'Essa foi bonita.', 'Gostei dessa peça.', 'A mesa apertou agora.', 'Essa mudou o jogo.'],
  pass:  ['Passei.', 'Sem encaixe por aqui.', 'Travei nessa vez.', 'Não tenho peça para essa ponta.'],
  win:   ['Ganhei essa rodada!', 'Foi por pouco!', 'Essa foi minha.', 'Rodada fechada!']
};

const TILE_VISIBLE_W = TILE_W - 10;
const TILE_VISIBLE_H = TILE_H - 8;

const BOARD_SIDES = ['left', 'right', 'up', 'down'];

export default class DominoAmazonicoScene extends Phaser.Scene {
  constructor() {
    super('DominoAmazonicoScene');
  }

  preload() {
    this.load.audio('defeat', 'assets/audio/defeat.mp3');
    this.load.audio('popup', 'assets/audio/popup.mp3');
    this.load.audio('pot_acquired', 'assets/audio/pot_acquired.mp3');
    this.load.audio('tile_sound_1', 'assets/audio/tile_sound_1.mp3');
    this.load.audio('tile_sound_2', 'assets/audio/tile_sound_2.mp3');
    this.load.audio('tile_sound_3', 'assets/audio/tile_sound_3.mp3');
    this.load.audio('victory', 'assets/audio/victory.mp3');

    this.load.svg('avatar_player', 'assets/avatars/player.svg', { width: 256, height: 256 });
    this.load.svg('avatar_aru', 'assets/avatars/aru.svg', { width: 256, height: 256 });
    this.load.svg('avatar_boto', 'assets/avatars/boto.svg', { width: 256, height: 256 });
    this.load.svg('avatar_iara', 'assets/avatars/iara.svg', { width: 256, height: 256 });
    this.load.svg('avatar_onca', 'assets/avatars/onca.svg', { width: 256, height: 256 });
    this.load.svg('avatar_arara', 'assets/avatars/arara.svg', { width: 256, height: 256 });
    this.load.svg('avatar_curupira', 'assets/avatars/curupira.svg', { width: 256, height: 256 });
    this.load.svg('avatar_tucano', 'assets/avatars/tucano.svg', { width: 256, height: 256 });
  }

  create() {
    this.currentTileThemeIndex = 0;
    this.currentBgThemeIndex = 0;
    this.currentVisualMode = 'light';
    this.roundNumber = 0;
    this.turnLocked = true;
    this.passChain = 0;
    this.pendingReset = false;
    this.playedFirstTile = false;
    this.currentPlayerIndex = 0;
    this.currentBoardScale = 1.06;
    this.soundEnabled = true;
    this.teamScores = [0, 0];
    this.previousRoundOutcome = 'first';
    this.lastRoundWinnerId = null;
    this.currentOpeningRequirement = { type: 'exact', a: 6, b: 6 };

    // Inicializar variáveis para controles da UI
    this.pendingAnnouncement = 0;
    this.pendingGalo = false;
    this.humanPassRequested = false;

    this.centerTile = null;
    this.centerValue = null;
    this.spinnerCenter = false;
    this.sideCounts = { left: 0, right: 0, up: 0, down: 0 };
    this.openSides = { left: null, right: null, up: null, down: null };
    this.boardTiles = [];
    this.boardState = {
      left: null,
      right: null,
      up: null,
      down: null,
      played: [],
      openingRule: this.previousRoundOutcome === 'batida' ? 'anyCarroca' : 'sena',
      branches: { center: null, left: [], right: [], up: [], down: [] }
    };

    this.players = [
      { id: 0, seat: 'bottom', name: 'Você', avatarKey: 'avatar_player', isHuman: true, hand: [], score: 0, teamId: 0, competitivePoints: 0, rankPosition: null, isStandIn: false },
      { id: 1, seat: 'left', name: 'Bot Amazônico 1', avatarKey: 'avatar_onca', isHuman: false, hand: [], score: 0, teamId: 1, competitivePoints: 42, rankPosition: null, isStandIn: true },
      { id: 2, seat: 'top', name: 'Bot Amazônico 2', avatarKey: 'avatar_boto', isHuman: false, hand: [], score: 0, teamId: 0, competitivePoints: 58, rankPosition: null, isStandIn: true },
      { id: 3, seat: 'right', name: 'Bot Amazônico 3', avatarKey: 'avatar_arara', isHuman: false, hand: [], score: 0, teamId: 1, competitivePoints: 46, rankPosition: null, isStandIn: true }
    ];

    this.sounds = {
      dealStart: this.makeOptionalSound('popup', { volume: 1.0 }),
      score: this.makeOptionalSound('pot_acquired', { volume: 0.74 }),
      turn: this.makeOptionalSound('turn_start', { volume: 0.42 }),
      victory: this.makeOptionalSound('victory', { volume: 0.85 }),
      defeat: this.makeOptionalSound('defeat', { volume: 0.82 })
    };
    this.tileSfxKeys = ['tile_sound_1', 'tile_sound_2', 'tile_sound_3'];

    this.buildAvatarCatalog();

    this.generateAllTileTextures();
    this.createLayout();
    this.createToast();
    this.startNewRound();

    this.scale.on('resize', () => {
      this.drawBackground(BG_THEMES[this.currentBgThemeIndex]);
      this.layoutHands(false);
      this.relayoutBoardTiles(0);
      this.positionTurnBadge(this.players[this.currentPlayerIndex] || this.players[0]);
    });

    if (window.dominoAmazonicoUI && window.dominoAmazonicoUI.attachScene) {
      window.dominoAmazonicoUI.attachScene(this);
    }
  }

  makeOptionalSound(key, config) {
    return {
      play: () => {
        if (!this.soundEnabled) return;
        try {
          if (this.cache.audio && this.cache.audio.exists(key)) {
            this.sound.play(key, config || {});
          }
        } catch (error) {
          console.warn('Failed to play sound:', key, error);
        }
      }
    };
  }

  createLayout() {
    this.background = this.add.graphics();
    this.tableShadow = this.add.graphics();
    this.tableFrame = this.add.graphics();
    this.tableSurface = this.add.graphics();
    this.boardInset = this.add.graphics();
    this.boardGlow = this.add.graphics();

    this.boardContainer = this.add.container(0, 0);
    this.handsContainer = this.add.container(0, 0);
    this.uiContainer = this.add.container(0, 0);

    this.turnBadge = this.add.container(0, 0).setDepth(260);
    this.turnBadgeBg = this.add.graphics();
    this.turnText = this.add.text(0, 0, '', {
      fontFamily: 'Arial',
      fontStyle: 'bold',
      fontSize: '20px',
      color: '#163127',
      align: 'center'
    }).setOrigin(0.5);
    this.turnBadge.add([this.turnBadgeBg, this.turnText]);

    this.createPlayerPanels();
    this.drawBackground(BG_THEMES[this.currentBgThemeIndex]);
    this.createSnapPreview();
  }

  createPlayerPanels() {
    this.playerPanels = {};
    const cfgs = this.getPanelConfigs();

    this.players.forEach((player) => {
      const cfg = cfgs[player.seat];
      const container = this.add.container(cfg.x, cfg.y).setDepth(80);

      const bg = this.add.graphics();
      bg.fillStyle(0x0d241d, 0.08);
      bg.lineStyle(2, 0xe9cb98, 0.28);
      bg.fillRoundedRect(-cfg.w / 2, -cfg.h / 2, cfg.w, cfg.h, 18);
      bg.strokeRoundedRect(-cfg.w / 2, -cfg.h / 2, cfg.w, cfg.h, 18);

      const badge = this.add.container(cfg.scoreBadge.x, cfg.scoreBadge.y);
      const badgeBg = this.add.graphics();
      badgeBg.fillStyle(0x231710, 0.96);
      badgeBg.fillRoundedRect(-42, -28, 84, 56, 14);
      const scoreValue = this.add.text(0, -5, '0', {
        fontFamily: 'Arial', fontStyle: 'bold', fontSize: '28px', color: '#ffffff'
      }).setOrigin(0.5);
      const scoreLabel = this.add.text(0, 16, 'equipe', {
        fontFamily: 'Arial', fontStyle: 'bold', fontSize: '12px', color: '#ffffffcc'
      }).setOrigin(0.5);
      badge.add([badgeBg, scoreValue, scoreLabel]);

      const avatar = this.add.image(cfg.avatar.x, cfg.avatar.y, player.avatarKey).setDisplaySize(58, 58);
      const nameText = this.add.text(cfg.namePos.x, cfg.namePos.y, player.name, {
        fontFamily: 'Arial', fontStyle: 'bold', fontSize: cfg.vertical ? '18px' : '17px', color: '#ffffff'
      }).setOrigin(cfg.namePos.ox, cfg.namePos.oy);
      const piecesText = this.add.text(cfg.piecesPos.x, cfg.piecesPos.y, 'Ranking iniciante', {
        fontFamily: 'Arial', fontSize: '14px', color: '#ffffffcc'
      }).setOrigin(cfg.piecesPos.ox, cfg.piecesPos.oy);

      container.add([bg, badge, avatar, nameText, piecesText]);
      this.uiContainer.add(container);

      player.panel = container;
      player.panelConfig = cfg;
      player.scoreText = scoreValue;
      player.piecesText = piecesText;
      player.scoreBadge = badge;
      player.avatarSprite = avatar;
      player.nameText = nameText;
      player.scoreLabelText = scoreLabel;
      this.playerPanels[player.seat] = container;
    });
  }

  getPanelConfigs() {
    const PX = GAME_WIDTH / 2;
    const PY = GAME_HEIGHT / 2;

    return {
      bottom: {
        x: PX, y: GAME_HEIGHT - 58,
        w: 1290, h: 94, vertical: false,
        scoreBadge: { x: -580, y: 0 },
        avatar: { x: -505, y: 0 },
        namePos: { x: -458, y: -14, ox: 0, oy: 0.5 },
        piecesPos: { x: -458, y: 13, ox: 0, oy: 0.5 },
        handAxis: 'x', handCenterX: 12, handCenterY: 0,
        turnBadge: { x: 0, y: -76 }
      },
      top: {
        x: PX, y: 58,
        w: 1290, h: 94, vertical: false,
        scoreBadge: { x: -580, y: 0 },
        avatar: { x: -505, y: 0 },
        namePos: { x: -458, y: -14, ox: 0, oy: 0.5 },
        piecesPos: { x: -458, y: 13, ox: 0, oy: 0.5 },
        handAxis: 'x', handCenterX: 12, handCenterY: 0,
        turnBadge: { x: 0, y: 76 }
      },
      left: {
        x: 74, y: PY,
        w: 118, h: 726, vertical: true,
        scoreBadge: { x: 0, y: -310 },
        avatar: { x: 0, y: -245 },
        namePos: { x: 0, y: -196, ox: 0.5, oy: 0.5 },
        piecesPos: { x: 0, y: -173, ox: 0.5, oy: 0.5 },
        handAxis: 'y', handCenterX: 0, handCenterY: 42,
        turnBadge: { x: 132, y: -298 }
      },
      right: {
        x: GAME_WIDTH - 74, y: PY,
        w: 118, h: 726, vertical: true,
        scoreBadge: { x: 0, y: 310 },
        avatar: { x: 0, y: 245 },
        namePos: { x: 0, y: 196, ox: 0.5, oy: 0.5 },
        piecesPos: { x: 0, y: 173, ox: 0.5, oy: 0.5 },
        handAxis: 'y', handCenterX: 0, handCenterY: -42,
        turnBadge: { x: -132, y: 298 }
      }
    };
  }

  drawBackground(theme) {
    const bx = 104;
    const by = 92;
    const bw = GAME_WIDTH - 208;
    const bh = GAME_HEIGHT - 184;

    this.boardBounds = new Phaser.Geom.Rectangle(bx, by, bw, bh);
    this.boardCenter = new Phaser.Math.Vector2(bx + bw / 2, by + bh / 2);

    this.background.clear();
    this.background.fillGradientStyle(
      Phaser.Display.Color.HexStringToColor(theme.outer).color,
      Phaser.Display.Color.HexStringToColor(theme.outer).color,
      Phaser.Display.Color.HexStringToColor(theme.felt).color,
      Phaser.Display.Color.HexStringToColor(theme.felt).color,
      1
    );
    this.background.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.tableShadow.clear();
    this.tableShadow.fillStyle(0x000000, 0.22);
    this.tableShadow.fillRoundedRect(bx - 14, by - 10, bw + 28, bh + 28, 32);

    this.tableFrame.clear();
    this.tableFrame.fillStyle(Phaser.Display.Color.HexStringToColor(theme.rail).color, 0.94);
    this.tableFrame.fillRoundedRect(bx - 20, by - 16, bw + 40, bh + 40, 34);

    this.tableSurface.clear();
    this.tableSurface.fillStyle(Phaser.Display.Color.HexStringToColor(theme.felt).color, 1);
    this.tableSurface.fillRoundedRect(bx, by, bw, bh, 28);
    this.tableSurface.lineStyle(2, Phaser.Display.Color.HexStringToColor(theme.glow).color, 0.32);
    this.tableSurface.strokeRoundedRect(bx, by, bw, bh, 28);

    this.boardInset.clear();
    this.boardInset.fillStyle(0xffffff, 0.03);
    this.boardInset.fillRoundedRect(bx + 20, by + 20, bw - 40, bh - 40, 18);
    this.boardInset.lineStyle(2, 0xffffff, 0.08);
    this.boardInset.strokeRoundedRect(bx + 20, by + 20, bw - 40, bh - 40, 18);

    this.boardGlow.clear();
    this.boardGlow.fillStyle(Phaser.Display.Color.HexStringToColor(theme.glow).color, 0.09);
    this.boardGlow.fillEllipse(this.boardCenter.x, this.boardCenter.y, bw * 0.72, bh * 0.56);
  }

  createSnapPreview() {
    this.snapPreviewShadow = this.add.ellipse(0, 0, 118, 34, 0x000000, 0.1)
      .setVisible(false)
      .setDepth(48);
    this.snapPreview = this.add.image(0, 0, 'tile-back')
      .setVisible(false)
      .setAlpha(0.38)
      .setDepth(52);
  }

  createToast() {
    this.toastText = this.add.text(GAME_WIDTH / 2, 152, '', {
      fontFamily: 'Arial',
      fontStyle: 'bold',
      fontSize: '24px',
      color: '#ffffff',
      stroke: '#153129',
      strokeThickness: 5,
      align: 'center'
    }).setOrigin(0.5).setAlpha(0).setDepth(280);
  }

  toast(message) {
    this.toastText.setText(message);
    this.toastText.setAlpha(0);
    this.toastText.y = 162;
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({
      targets: this.toastText,
      alpha: 1,
      y: 146,
      duration: 180,
      yoyo: true,
      hold: 1100,
      ease: 'Sine.easeOut'
    });
  }

  startNewRound() {
    this.roundNumber += 1;
    this.turnLocked = true;
    this.passChain = 0;
    this.playedFirstTile = false;
    this.pendingReset = false;
    this.currentPlayerIndex = 0;
    this.currentBoardScale = this.getBoardScale(1);
    this.currentOpeningRequirement = this.previousRoundOutcome === 'batida' ? { type: 'double' } : { type: 'exact', a: 6, b: 6 };

    this.centerTile = null;
    this.centerValue = null;
    this.spinnerCenter = false;
    this.sideCounts = { left: 0, right: 0, up: 0, down: 0 };
    this.openSides = { left: null, right: null, up: null, down: null };
    this.boardTiles = [];
    this.boardState = { left: null, right: null, up: null, down: null, played: [], branches: { center: null, left: [], right: [], up: [], down: [] } };

    this.pendingAnnouncement = 0;
    this.pendingGalo = false;
    this.humanPassRequested = false;

    this.hideSnapPreview();
    this.boardContainer.removeAll(true);
    this.handsContainer.removeAll(true);
    this.players.forEach((p) => { p.hand = []; });

    this.deck = this.shuffle(this.buildDeck());
    this.updatePlayerCounters();
    this.setTurnText('Rodada ' + this.roundNumber + ' - distribuindo 28 pedras', this.players[0]);
    this.toast('Rodada ' + this.roundNumber + ' iniciada');
    this.sounds.dealStart.play();
    if (window.dominoAmazonicoUI) {
      window.dominoAmazonicoUI.addSystemMessage('Rodada ' + this.roundNumber + ' iniciada.');
    }
    this.time.delayedCall(240, () => this.dealTilesAnimated());
  }

  buildDeck() {
    const deck = [];
    let id = 0;
    for (let a = 0; a <= 6; a++) {
      for (let b = a; b <= 6; b++) {
        deck.push({ id: ++id, a, b, ownerId: null, sprite: null });
      }
    }
    return deck;
  }

  shuffle(deck) {
    return Phaser.Utils.Array.Shuffle(deck.slice());
  }

  dealTilesAnimated() {
    let dealIndex = 0;
    const totalDeals = 28;

    const dealNext = () => {
      if (dealIndex >= totalDeals) {
        this.players.forEach((p) => this.sortHand(p));
        this.layoutHands(true);
        this.time.delayedCall(420, () => this.beginRoundAfterDeal());
        return;
      }

      const player = this.players[dealIndex % this.players.length];
      const tile = this.deck.pop();
      tile.ownerId = player.id;
      player.hand.push(tile);

      const target = this.getHandPosition(player, player.hand.length - 1, 7);
      const temp = this.add.image(this.boardCenter.x, this.boardCenter.y, 'tile-back')
        .setScale(0.82)
        .setDepth(180)
        .setAngle(Phaser.Math.Between(-10, 10));

      this.playTileSfx(0.32);
      this.tweens.add({
        targets: temp,
        x: target.x,
        y: target.y,
        angle: target.angle || 0,
        duration: 115,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          temp.destroy();
          this.layoutHands(false);
          dealIndex += 1;
          this.time.delayedCall(8, dealNext);
        }
      });
    };

    dealNext();
  }

  beginRoundAfterDeal() {
    const starter = this.selectStartingPlayer();
    this.currentPlayerIndex = starter.playerIndex;
    this.startingTile = starter.tile;
    this.currentOpeningRequirement = starter.requirement;
    this.setTurnText(starter.message, starter.player);
    this.toast(starter.message);
    this.sounds.turn.play();
    if (window.dominoAmazonicoUI) {
      window.dominoAmazonicoUI.addSystemMessage(starter.message);
      if (starter.extraMessage) window.dominoAmazonicoUI.addSystemMessage(starter.extraMessage);
    }

    if (starter.player.isHuman) {
      this.turnLocked = false;
      const humanHint = !starter.tile
        ? 'Você não tem carroça para sair. Use PASSEI para passar a saída.'
        : starter.requirement && starter.requirement.type === 'double'
        ? 'Você venceu a rodada anterior. Abra com uma carroça.'
        : 'Arraste a pedra inicial obrigatória para o centro da mesa';
      this.toast(humanHint);
    } else {
      this.time.delayedCall(620, () => {
        if (starter.tile) {
          this.playTile(starter.player, starter.tile, 'center', true);
        } else {
          this.handlePass(starter.player);
        }
      });
    }
  }

  selectStartingPlayer() {
    const senaStarter = this.findSenaStarter();

    if (this.previousRoundOutcome === 'first' || this.previousRoundOutcome === 'blocked' || this.lastRoundWinnerId === null || this.lastRoundWinnerId === undefined) {
      const starter = senaStarter || this.findBestDoubleStarter();
      return {
        player: starter.player,
        tile: starter.tile,
        playerIndex: starter.player.id,
        requirement: { type: 'exact', a: 6, b: 6 },
        message: starter.player.name + ' começa com a carroça de sena (6|6).'
      };
    }

    const lastWinner = this.players.find((player) => player.id === this.lastRoundWinnerId) || this.players[0];
    const winnerDouble = this.findHighestDouble(lastWinner);
    if (winnerDouble) {
      return {
        player: lastWinner,
        tile: winnerDouble,
        playerIndex: lastWinner.id,
        requirement: { type: 'double' },
        message: lastWinner.name + ' bateu a rodada anterior e abre com uma carroça.'
      };
    }

    const winnerPosition = this.players.findIndex((player) => player.id === lastWinner.id);
    const nextPlayer = this.players[(winnerPosition + 1) % this.players.length] || this.players[0];
    const nextPlayerDouble = this.findHighestDouble(nextPlayer);

    return {
      player: nextPlayer,
      tile: nextPlayerDouble,
      playerIndex: nextPlayer.id,
      requirement: { type: 'double' },
      message: nextPlayer.name + ' assume a saída com carroça.',
      extraMessage: lastWinner.name + ' não tinha carroça e passou a saída para o próximo jogador.'
    };
  }

  sortHand(player) {
    player.hand.sort((t1, t2) => {
      const v1 = t1.a + t1.b + (t1.a === t1.b ? 20 : 0);
      const v2 = t2.a + t2.b + (t2.a === t2.b ? 20 : 0);
      return v2 - v1 || t2.b - t1.b;
    });
  }

  layoutHands(animate = true) {
    this.players.forEach((player) => {
      player.hand.forEach((tile, index) => {
        const textureKey = player.isHuman ? this.getFaceTextureKey(tile) : 'tile-back';
        let sprite = tile.sprite;
        if (!sprite) {
          sprite = this.add.image(this.boardCenter.x, this.boardCenter.y, textureKey)
            .setDepth(player.isHuman ? 110 : 90);
          sprite.tileData = tile;
          tile.sprite = sprite;
          this.handsContainer.add(sprite);
        }

        if (player.isHuman) {
          this.enableTileInteraction(sprite, tile);
        } else {
          sprite.removeInteractive();
        }

        sprite.setTexture(textureKey);
        const target = this.getHandPosition(player, index, player.hand.length);
        const scale = player.isHuman ? HAND_TILE_SCALE : BOT_TILE_SCALE;

        const applyTarget = () => {
          sprite.setPosition(target.x, target.y);
          sprite.setRotation(target.rotation || 0);
          sprite.setScale(scale);
          sprite.homeX = target.x;
          sprite.homeY = target.y;
          sprite.homeRotation = target.rotation || 0;
          sprite.homeScale = scale;
          sprite.setDepth(player.isHuman ? 110 + index : 90 + index);
        };

        if (animate) {
          this.tweens.add({
            targets: sprite,
            x: target.x,
            y: target.y,
            rotation: target.rotation || 0,
            scale,
            duration: 220,
            ease: 'Sine.easeOut',
            onComplete: applyTarget
          });
        } else {
          applyTarget();
        }
      });
    });
    this.updatePlayerCounters();
  }

  getHandPosition(player, index, total) {
    const cfg = player.panelConfig;
    // Espaçamento horizontal e vertical igual ao tamanho da pedra, para ficarem encostadas
    if (cfg.handAxis === 'x') {
      const spacing = TILE_H * HAND_TILE_SCALE; // 54 * 1 = 54
      const startX = player.panel.x + cfg.handCenterX - ((total - 1) * spacing) / 2;
      return {
        x: startX + index * spacing,
        y: player.panel.y + cfg.handCenterY,
        rotation: Math.PI / 2,
        angle: 90
      };
    }
    const spacing = TILE_H * HAND_TILE_SCALE; // 54 * 1 = 54
    const startY = player.panel.y + cfg.handCenterY - ((total - 1) * spacing) / 2;
    return {
      x: player.panel.x + cfg.handCenterX,
      y: startY + index * spacing,
      rotation: 0,
      angle: 0
    };
  }

  updatePlayerCounters() {
    this.syncPlayerScoresWithTeams();
    this.players.forEach((player) => {
      const teamScore = this.teamScores[this.getTeamId(player)] || 0;
      player.scoreText.setText(String(teamScore));
      if (player.scoreLabelText) player.scoreLabelText.setText('equipe');
      player.piecesText.setText(this.getPlayerStatusLabel(player));
      if (player.nameText) player.nameText.setText(player.name);
    });
    if (window.dominoAmazonicoUI && window.dominoAmazonicoUI.syncSettingsState) {
      window.dominoAmazonicoUI.syncSettingsState();
    }
  }

  cyclePlayerAvatar(playerId) {
    const player = this.players.find((entry) => entry.id === playerId);
    if (!player) return;
    const options = this.avatarOptions || AVATAR_OPTIONS;
    const currentIndex = Math.max(0, options.findIndex((option) => option.key === player.avatarKey));
    const next = options[(currentIndex + 1) % options.length];
    this.applyAvatarToPlayer(player, next.key);
    this.toast(player.name + ' agora usa ' + next.name);
  }

  applyHumanAvatarPreset(avatarKey) {
    const human = this.players[0];
    if (!human) return;
    const options = this.avatarOptions || AVATAR_OPTIONS;
    const selected = options.find((option) => option.key === avatarKey) || options[0];
    if (!selected) return;
    this.applyAvatarToPlayer(human, selected.key);
    this.persistHumanProfileAvatar(selected.key);
    this.toast('Avatar do perfil: ' + selected.name);
  }

  applyAvatarToPlayer(player, avatarKey) {
    player.avatarKey = avatarKey;
    if (player.avatarSprite) {
      player.avatarSprite.setTexture(avatarKey);
    }
  }

  persistHumanProfileAvatar(avatarKey) {
    try {
      const key = 'domino_player_profile';
      const current = JSON.parse(window.localStorage.getItem(key) || '{}');
      const next = {
        ...current,
        avatarType: 'preset',
        avatarPresetId: avatarKey,
        avatarImage: null
      };
      const serialized = JSON.stringify(next);
      window.localStorage.setItem(key, serialized);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: serialized }));
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'player-profile-updated', profile: next }, '*');
      }
    } catch (error) {
      console.warn('Failed to persist avatar preset:', error);
    }
  }


  buildAvatarCatalog() {
    const generated = [
      { key: 'avatar_jaguar_guard', name: 'Jaguar Guardião', palette: { bg1: '#264335', bg2: '#12261e', ring: '#d8b36a', face: '#f1c27d', hair: '#2d1b14', mark: '#7a4a21', eyes: '#102018', accent: '#7dd3a7' }, glyph: 'JG' },
      { key: 'avatar_vitoria_regia', name: 'Vitória-Régia', palette: { bg1: '#355c3f', bg2: '#173122', ring: '#f0d48d', face: '#f6d7b8', hair: '#1f2e1f', mark: '#3f6f4d', eyes: '#0f1f16', accent: '#a7f3d0' }, glyph: 'VR' },
      { key: 'avatar_solim_es', name: 'Solimões', palette: { bg1: '#24506b', bg2: '#102636', ring: '#d7c47a', face: '#edc39c', hair: '#13212b', mark: '#3a7ca5', eyes: '#07131c', accent: '#8fd3ff' }, glyph: 'SO' },
      { key: 'avatar_curu_mirim', name: 'Curu-Mirim', palette: { bg1: '#5a3b27', bg2: '#24160f', ring: '#f1c27d', face: '#f2c18f', hair: '#3a2317', mark: '#b56b3b', eyes: '#1d120c', accent: '#ffd166' }, glyph: 'CM' },
      { key: 'avatar_igarape', name: 'Igarapé', palette: { bg1: '#225b52', bg2: '#10312c', ring: '#bfe7d3', face: '#f1ca9a', hair: '#173329', mark: '#2b8c7a', eyes: '#0f1e18', accent: '#6ee7c8' }, glyph: 'IG' }
    ];

    generated.forEach((avatar) => this.generateAvatarTexture(avatar.key, avatar.palette, avatar.glyph));
    this.avatarOptions = AVATAR_OPTIONS;
  }

  generateAvatarTexture(key, palette, glyph) {
    if (this.textures.exists(key)) this.textures.remove(key);
    const canvas = this.textures.createCanvas(key, 256, 256);
    const ctx = canvas.context;

    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, palette.bg1);
    grad.addColorStop(1, palette.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(128, 128, 102, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = palette.ring;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(128, 104, 48, 0, Math.PI * 2);
    ctx.fillStyle = palette.face;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(76, 96);
    ctx.quadraticCurveTo(128, 34, 180, 96);
    ctx.quadraticCurveTo(178, 72, 160, 58);
    ctx.quadraticCurveTo(128, 38, 96, 58);
    ctx.quadraticCurveTo(78, 72, 76, 96);
    ctx.fillStyle = palette.hair;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(110, 106, 5, 0, Math.PI * 2);
    ctx.arc(146, 106, 5, 0, Math.PI * 2);
    ctx.fillStyle = palette.eyes;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(110, 130);
    ctx.quadraticCurveTo(128, 142, 146, 130);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#7a3f2c';
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(70, 146, 116, 70, 34);
    ctx.fillStyle = palette.accent;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(128, 168, 54, 0, Math.PI, true);
    ctx.fillStyle = palette.face;
    ctx.fill();

    ctx.fillStyle = palette.mark;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(glyph, 128, 226);

    canvas.refresh();
  }

  enableTileInteraction(sprite, tile) {
    if (sprite._dragReady) return;
    sprite._dragReady = true;
    sprite.setInteractive({ useHandCursor: true, draggable: true });
    this.input.setDraggable(sprite);

    sprite.on('pointerover', () => {
      if (!this.turnLocked && this.currentPlayerIndex === 0 && !sprite.dragging) {
        sprite.setScale((sprite.homeScale || HAND_TILE_SCALE) * 1.06);
        sprite.y = (sprite.homeY || sprite.y) - 10;
      }
    });

    sprite.on('pointerout', () => {
      if (!sprite.dragging) {
        sprite.setScale(sprite.homeScale || HAND_TILE_SCALE);
        sprite.y = sprite.homeY || sprite.y;
      }
    });

    sprite.on('dragstart', () => {
      if (this.turnLocked || this.currentPlayerIndex !== 0 || this.pendingReset) return;
      const validSides = this.getValidSides(tile);
      if (!validSides.length) {
        this.toast('Essa pedra não encaixa nas pontas abertas');
        return;
      }
      sprite.dragging = true;
      sprite.pendingSide = null;
      sprite.setDepth(300);
      sprite.setScale((sprite.homeScale || HAND_TILE_SCALE) * 1.08);
    });

    sprite.on('drag', (_pointer, dragX, dragY) => {
      if (!sprite.dragging || this.turnLocked || this.currentPlayerIndex !== 0) return;
      sprite.x = dragX;
      sprite.y = dragY;
      this.updateDragSnap(tile, dragX, dragY);
    });

    sprite.on('dragend', () => {
      if (!sprite.dragging) return;
      sprite.dragging = false;
      const chosenSide = sprite.pendingSide;
      sprite.pendingSide = null;
      this.hideSnapPreview();
      if (chosenSide) {
        this.playTile(this.players[0], tile, chosenSide);
      } else {
        this.returnTileHome(sprite);
      }
    });
  }

  updateDragSnap(tile, dragX, dragY) {
    const validSides = this.getValidSides(tile);
    let bestSide = null;
    let bestPlacement = null;
    let bestDistance = Number.MAX_SAFE_INTEGER;

    validSides.forEach((side) => {
      const placement = this.computePlacement(tile, side, false, this.getBoardScale(this.boardTiles.length + 1));
      const dist = Phaser.Math.Distance.Between(dragX, dragY, placement.x, placement.y);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestSide = side;
        bestPlacement = placement;
      }
    });

    if (bestSide && bestDistance <= SNAP_DISTANCE) {
      tile.sprite.pendingSide = bestSide;
      this.showSnapPreview(tile, bestPlacement);
    } else {
      tile.sprite.pendingSide = null;
      this.hideSnapPreview();
    }
  }

  showSnapPreview(tile, placement) {
    this.snapPreview.setTexture(this.getFaceTextureKey(tile));
    this.snapPreview.setPosition(placement.x, placement.y);
    this.snapPreview.setRotation(placement.rotation);
    this.snapPreview.setScale(placement.scale || this.currentBoardScale);
    this.snapPreview.setVisible(true);
    this.snapPreviewShadow.setPosition(placement.x, placement.y + 14);
    this.snapPreviewShadow.setDisplaySize(
      84 * (placement.scale || this.currentBoardScale),
      22 * (placement.scale || this.currentBoardScale)
    );
    this.snapPreviewShadow.setVisible(true);
  }

  hideSnapPreview() {
    this.snapPreview.setVisible(false);
    this.snapPreviewShadow.setVisible(false);
  }

  returnTileHome(sprite) {
    this.hideSnapPreview();
    this.tweens.add({
      targets: sprite,
      x: sprite.homeX,
      y: sprite.homeY,
      rotation: sprite.homeRotation || 0,
      scale: sprite.homeScale || HAND_TILE_SCALE,
      duration: 180,
      ease: 'Sine.easeOut',
      onComplete: () => {
        sprite.setDepth(120);
        sprite.setPosition(sprite.homeX, sprite.homeY);
      }
    });
  }

  getValidSides(tile) {
    const domino = { left: tile.a, right: tile.b };
    if (!this.playedFirstTile) {
      if (!this.isValidOpeningTile(tile)) return [];
      return ['center'];
    }

    const valid = [];
    const sides = ['left', 'right', 'up', 'down'];
    for (const side of sides) {
      if (canPlayDomino(domino, this.boardState, side)) {
        valid.push(side);
      }
    }
    return valid;
  }

  matchesSide(tile, side) {
    const open = this.openSides[side];
    if (open === null || open === undefined) return false;
    return tile.a === open || tile.b === open;
  }

  canUseSpinnerLaterals() {
    return !!(this.spinnerCenter && this.sideCounts.left > 0 && this.sideCounts.right > 0);
  }

  getBoardScale(tileCount = this.boardTiles ? this.boardTiles.length : 0) {
    return Phaser.Math.Clamp(1.04 - Math.max(0, tileCount - 1) * 0.016, 0.62, 1.04);
  }

  computePlacement(tile, side, isOpening = false, scaleOverride) {
    const scale = scaleOverride !== undefined && scaleOverride !== null ? scaleOverride : this.currentBoardScale;
    const projected = this.computeBoardPlacements(scale, { tile, side, isOpening });
    return projected.byTileId[tile.id];
  }

  computeBoardPlacements(scale, pendingMove) {
    const byTileId = {};
    const grouped = { left: [], right: [], up: [], down: [] };
    const existingCenter = this.boardTiles.find((entry) => entry.side === 'center');
    const openingEntry = pendingMove && pendingMove.side === 'center'
      ? { tile: pendingMove.tile, side: 'center', isOpening: pendingMove.isOpening }
      : existingCenter;

    this.boardTiles.forEach((entry) => {
      if (entry.side !== 'center') grouped[entry.side].push(entry);
    });

    if (pendingMove && pendingMove.side !== 'center') {
      grouped[pendingMove.side] = grouped[pendingMove.side].concat([{ tile: pendingMove.tile, side: pendingMove.side, pending: true }]);
    }

    if (!openingEntry) {
      return { byTileId, grouped };
    }

    const openingTile = openingEntry.tile;
    const centerRotation = openingEntry.pending
      ? (openingTile.a === openingTile.b ? Math.PI / 2 : 0)
      : (openingEntry.rotation ?? (openingTile.a === openingTile.b ? Math.PI / 2 : 0));
    byTileId[openingTile.id] = {
      x: this.boardCenter.x,
      y: this.boardCenter.y,
      rotation: centerRotation,
      scale,
      slotIndex: 0,
      lineDir: openingEntry.pending
        ? (openingTile.a === openingTile.b ? 'v' : 'h')
        : (openingEntry.lineDir ?? (openingTile.a === openingTile.b ? 'v' : 'h')),
      side: 'center',
      newOpenLeft: openingTile.a,
      newOpenRight: openingTile.b
    };

    const branchStartOpen = {
      left: openingTile.a,
      right: openingTile.a === openingTile.b ? openingTile.a : openingTile.b,
      up: openingTile.a,
      down: openingTile.a
    };

    BOARD_SIDES.forEach((side) => {
      this.layoutBranch(side, grouped[side], openingTile, branchStartOpen[side], scale, byTileId);
    });

    return { byTileId, grouped };
  }

  layoutBranch(side, entries, openingTile, startOpen, scale, byTileId) {
    if (!entries || !entries.length) return;

    const centerExtents = this.getCenterExtents(openingTile, scale);
    let connector = this.getBranchOrigin(side, centerExtents);
    let state = this.getInitialBranchState(side);
    let currentOpen = startOpen;

    entries.forEach((entry, index) => {
      const pathState = this.getBranchPathState(side, index);
      const placement = this.placeTileOnDominoPath(connector, state, pathState, entry.tile, scale);
      const computedRotation = this.getTileRotation(entry.tile, placement.lineDir, currentOpen, side, placement.state);
      const rotation = computedRotation;
      const newOpen = this.resolveNextOpen(entry.tile, currentOpen);

      byTileId[entry.tile.id] = {
        x: placement.x,
        y: placement.y,
        rotation,
        scale,
        slotIndex: index,
        lineDir: placement.lineDir,
        layoutState: { ...placement.state },
        side,
        newOpen
      };

      connector = placement.connector;
      state = placement.state;
      currentOpen = newOpen;
    });
  }

  getCenterExtents(tile, scale) {
    const isDouble = tile.a === tile.b;
    if (isDouble) {
      return { halfW: (TILE_VISIBLE_H * scale) / 2, halfH: (TILE_VISIBLE_W * scale) / 2 };
    }
    return { halfW: (TILE_VISIBLE_W * scale) / 2, halfH: (TILE_VISIBLE_H * scale) / 2 };
  }

  getBranchOrigin(side, extents) {
    if (side === 'left') return { x: this.boardCenter.x - extents.halfW, y: this.boardCenter.y };
    if (side === 'right') return { x: this.boardCenter.x + extents.halfW, y: this.boardCenter.y };
    if (side === 'up') return { x: this.boardCenter.x, y: this.boardCenter.y - extents.halfH };
    return { x: this.boardCenter.x, y: this.boardCenter.y + extents.halfH };
  }

  getInitialBranchState(side) {
    if (side === 'left') return { lineDir: 'h', hDir: -1, vDir: -1 };
    if (side === 'right') return { lineDir: 'h', hDir: 1, vDir: 1 };
    if (side === 'up') return { lineDir: 'v', hDir: 1, vDir: -1 };
    return { lineDir: 'v', hDir: -1, vDir: 1 };
  }

  getBranchPathState(side, index) {
    const slot = index + 1;

    if (side === 'right') {
      if (slot <= 6) return { lineDir: 'h', hDir: 1, vDir: 1 };
      if (slot <= 10) return { lineDir: 'v', hDir: 1, vDir: 1 };
      return { lineDir: 'h', hDir: -1, vDir: 1 };
    }

    if (side === 'left') {
      if (slot <= 6) return { lineDir: 'h', hDir: -1, vDir: -1 };
      if (slot <= 10) return { lineDir: 'v', hDir: -1, vDir: -1 };
      return { lineDir: 'h', hDir: 1, vDir: -1 };
    }

    if (side === 'up') {
      if (slot <= 3) return { lineDir: 'v', hDir: 1, vDir: -1 };
      if (slot <= 10) return { lineDir: 'h', hDir: 1, vDir: -1 };
      return { lineDir: 'v', hDir: 1, vDir: 1 };
    }

    if (slot <= 3) return { lineDir: 'v', hDir: -1, vDir: 1 };
    if (slot <= 10) return { lineDir: 'h', hDir: -1, vDir: 1 };
    return { lineDir: 'v', hDir: -1, vDir: -1 };
  }

  getTurnAdjustedConnector(connector, previousState, nextState, tile, scale) {
    if (!previousState || previousState.lineDir === nextState.lineDir) return connector;

    const metrics = this.getTileMetrics(tile, nextState.lineDir, scale);
    const adjusted = { ...connector };

    if (previousState.lineDir === 'h' && nextState.lineDir === 'v') {
      adjusted.x += previousState.hDir * metrics.halfW;
      return adjusted;
    }

    if (previousState.lineDir === 'v' && nextState.lineDir === 'h') {
      adjusted.y += previousState.vDir * metrics.halfH;
      return adjusted;
    }

    return adjusted;
  }

  placeTileOnDominoPath(connector, previousState, nextState, tile, scale) {
    if (tile.a === tile.b && previousState && previousState.lineDir !== nextState.lineDir) {
      return this.placeTurningDouble(connector, previousState, nextState, tile, scale);
    }

    const adjustedConnector = this.getTurnAdjustedConnector(connector, previousState, nextState, tile, scale);
    return this.tryPlaceWithState(adjustedConnector, nextState, tile, scale);
  }

  placeTurningDouble(connector, previousState, nextState, tile, scale) {
    const metrics = this.getTileMetrics(tile, nextState.lineDir, scale);
    let x = connector.x;
    let y = connector.y;

    if (previousState.lineDir === 'h') {
      x += previousState.hDir * metrics.halfW;
    } else {
      y += previousState.vDir * metrics.halfH;
    }

    const nextConnector = nextState.lineDir === 'h'
      ? { x: x + nextState.hDir * metrics.halfW, y }
      : { x, y: y + nextState.vDir * metrics.halfH };

    return {
      x,
      y,
      lineDir: nextState.lineDir,
      connector: nextConnector,
      state: { ...nextState },
      fits: this.isInsideBoard(x, y, metrics.halfW, metrics.halfH)
    };
  }

  placeNextBranchTile(connector, state, tile, scale) {
    const attempts = this.getPlacementAttempts(state);

    const placements = attempts.map((attempt) => this.tryPlaceWithState(connector, attempt, tile, scale));
    const fittingPlacement = placements.find((placement) => placement.fits);
    if (fittingPlacement) return fittingPlacement;

    return placements.reduce((best, placement) => {
      const overflow = this.getPlacementOverflow(placement, tile, scale);
      return !best || overflow < best.overflow ? { ...placement, overflow } : best;
    }, null);
  }

  placeExistingBranchTile(connector, state, entry, scale) {
    const storedState = entry.layoutState || (entry.lineDir ? { ...state, lineDir: entry.lineDir } : null);
    if (storedState) {
      return this.tryPlaceWithState(connector, storedState, entry.tile, scale);
    }
    return this.placeNextBranchTile(connector, state, entry.tile, scale);
  }

  getPlacementAttempts(state) {
    return [
      state,
      this.turnState(state),
      this.invertPerpendicular(this.turnState(state)),
      this.invertPerpendicular(state)
    ];
  }

  tryPlaceWithState(connector, state, tile, scale) {
    const metrics = this.getTileMetrics(tile, state.lineDir, scale);
    // gap zero, travel é só metade da pedra
    const travel = metrics.along / 2;

    let x = connector.x;
    let y = connector.y;
    if (state.lineDir === 'h') x += state.hDir * travel;
    else y += state.vDir * travel;

    const fits = this.isInsideBoard(x, y, metrics.halfW, metrics.halfH);
    const nextConnector = state.lineDir === 'h'
      ? { x: x + state.hDir * (metrics.along / 2), y }
      : { x, y: y + state.vDir * (metrics.along / 2) };

    return {
      x,
      y,
      lineDir: state.lineDir,
      connector: nextConnector,
      state: { ...state },
      fits
    };
  }

  turnState(state) {
    if (state.lineDir === 'h') {
      return { lineDir: 'v', hDir: state.hDir, vDir: state.vDir };
    }
    return { lineDir: 'h', hDir: state.hDir, vDir: state.vDir };
  }

  invertPerpendicular(state) {
    if (state.lineDir === 'h') {
      return { ...state, vDir: -state.vDir };
    }
    return { ...state, hDir: -state.hDir };
  }

  clampPlacement(placement, tile, scale) {
    const metrics = this.getTileMetrics(tile, placement.lineDir, scale);
    const bounds = this.boardBounds;
    const x = Phaser.Math.Clamp(placement.x, bounds.x + metrics.halfW, bounds.right - metrics.halfW);
    const y = Phaser.Math.Clamp(placement.y, bounds.y + metrics.halfH, bounds.bottom - metrics.halfH);
    const connector = placement.lineDir === 'h'
      ? { x: x + placement.state.hDir * (metrics.along / 2), y }
      : { x, y: y + placement.state.vDir * (metrics.along / 2) };
    return { ...placement, x, y, connector, fits: true };
  }

  getPlacementOverflow(placement, tile, scale) {
    const metrics = this.getTileMetrics(tile, placement.lineDir, scale);
    const bounds = this.boardBounds;
    let overflow = 0;
    overflow += Math.max(0, bounds.x - (placement.x - metrics.halfW));
    overflow += Math.max(0, (placement.x + metrics.halfW) - bounds.right);
    overflow += Math.max(0, bounds.y - (placement.y - metrics.halfH));
    overflow += Math.max(0, (placement.y + metrics.halfH) - bounds.bottom);
    return overflow;
  }

  isInsideBoard(x, y, halfW, halfH) {
    const bounds = this.boardBounds;
    const pad = 12;
    return x - halfW >= bounds.x + pad
      && x + halfW <= bounds.right - pad
      && y - halfH >= bounds.y + pad
      && y + halfH <= bounds.bottom - pad;
  }

  getTileMetrics(tile, lineDir, scale) {
    const isDouble = tile.a === tile.b;
    const along = (isDouble ? TILE_VISIBLE_H : TILE_VISIBLE_W) * scale;
    const cross = (isDouble ? TILE_VISIBLE_W : TILE_VISIBLE_H) * scale;
    const halfW = lineDir === 'h' ? along / 2 : cross / 2;
    const halfH = lineDir === 'h' ? cross / 2 : along / 2;
    return { along, cross, halfW, halfH, isDouble };
  }

  getBranchGap(scale) {
    return 0;
  }

  getTileAlongLen(tile, lineDir, scale) {
    return this.getTileMetrics(tile, lineDir, scale).along;
  }

  getTileCrossLen(tile, lineDir, scale) {
    return this.getTileMetrics(tile, lineDir, scale).cross;
  }

  getTileRotation(tile, lineDir, connectValue, side, state) {
    const isDouble = tile.a === tile.b;

    if (isDouble) {
      return lineDir === 'h' ? Math.PI / 2 : 0;
    }

    const openValue = this.resolveNextOpen(tile, connectValue);
    const ports = this.getConnectionPorts(lineDir, state);
    const candidates = lineDir === 'h'
      ? [0, Math.PI]
      : [Math.PI / 2, (Math.PI * 3) / 2];

    for (const rotation of candidates) {
      const facing = this.getFacingValues(tile, rotation);
      if (facing[ports.connect] === connectValue && facing[ports.open] === openValue) {
        return rotation;
      }
    }

    return candidates[0];
  }

  getConnectionPorts(lineDir, state) {
    if (lineDir === 'h') {
      return state && state.hDir >= 0
        ? { connect: 'left', open: 'right' }
        : { connect: 'right', open: 'left' };
    }

    return state && state.vDir >= 0
      ? { connect: 'up', open: 'down' }
      : { connect: 'down', open: 'up' };
  }

  getFacingValues(tile, rotation) {
    const angle = this.normalizeRotation(rotation);
    if (Math.abs(angle) < 0.001) {
      return { left: tile.a, right: tile.b, up: null, down: null };
    }
    if (Math.abs(angle - Math.PI) < 0.001) {
      return { left: tile.b, right: tile.a, up: null, down: null };
    }
    if (Math.abs(angle - Math.PI / 2) < 0.001) {
      return { up: tile.a, down: tile.b, left: null, right: null };
    }
    return { up: tile.b, down: tile.a, left: null, right: null };
  }

  normalizeRotation(rotation) {
    let value = rotation % (Math.PI * 2);
    if (value < 0) value += Math.PI * 2;
    if (Math.abs(value - Math.PI * 2) < 0.001) value = 0;
    return value;
  }

  resolveNextOpen(tile, connectValue) {
    // Determina qual lado fica aberto após a conexão
    // Exemplo: [2|6] conecta no 2, então 6 fica aberto
    // Exemplo: [6|5] conecta no 6, então 5 fica aberto
    if (tile.a === tile.b) return tile.a; // Dupla: sempre o mesmo valor
    return tile.a === connectValue ? tile.b : tile.a; // Não-dupla: o outro lado
  }

  evaluateAnnouncement(tablePoints, announced) {
    const informed = Math.max(0, Math.floor(Number(announced) || 0));
    if (tablePoints <= 0) {
      return {
        points: 0,
        status: informed > 0 ? 'over' : 'none',
        message: informed > 0
          ? 'Pontos informados errados: a mesa não pontuava. Nenhum ponto contabilizado.'
          : 'Sem pontuação na mesa nesta jogada.'
      };
    }
    if (informed <= 0) {
      return {
        points: 0,
        status: 'missed',
        message: 'Havia ' + tablePoints + ' ponto(s) na mesa, mas nada foi informado.'
      };
    }
    if (informed < tablePoints) {
      return {
        points: informed,
        status: 'under',
        message: 'Você anunciou menos. Contabilizado +' + informed + ' de ' + tablePoints + '.'
      };
    }
    if (informed > tablePoints) {
      return {
        points: tablePoints,
        status: 'over',
        message: 'Pontos informados errados: você anunciou ' + informed + ', mas a mesa valia ' + tablePoints + '. Contabilizado +' + tablePoints + '.'
      };
    }
    return {
      points: tablePoints,
      status: 'exact',
      message: 'Pontos anunciados confirmados: +' + tablePoints + '.'
    };
  }

  formatTile(tile) {
    return tile.a + '|' + tile.b;
  }

  getTableRawSum() {
    return getOpenEnds(this.boardState).reduce((sum, value) => sum + value, 0);
  }

  publishMoveScoring(player, tile, announced, rawSum, tablePoints, awardedPoints, result, usedGalo) {
    if (!window.dominoAmazonicoUI) return;

    const informed = Math.max(0, Math.floor(Number(announced) || 0));
    const tileLabel = this.formatTile(tile);
    const prefix = player.name + ' jogou ' + tileLabel + '. Pontas somam ' + rawSum + '. ';
    let text = '';

    if (usedGalo && awardedPoints > 0) {
      text = prefix + 'GALO confirmado: +' + awardedPoints + ' ponto(s).';
    } else if (result && result.status === 'exact') {
      text = prefix + 'Informou ' + informed + ' e fez +' + awardedPoints + ' ponto(s).';
    } else if (result && result.status === 'under') {
      text = prefix + 'Mesa valia ' + tablePoints + ', informou ' + informed + '. Contabilizado +' + awardedPoints + ' ponto(s).';
    } else if (result && result.status === 'over') {
      text = prefix + 'Pontos informados errados: informou ' + informed + ', mesa valia ' + tablePoints + '. Contabilizado +' + awardedPoints + ' ponto(s).';
    } else if (result && result.status === 'missed') {
      text = prefix + 'Mesa valia ' + tablePoints + ', mas nada foi informado. Pontos perdidos.';
    } else if (awardedPoints > 0) {
      text = prefix + 'Fez +' + awardedPoints + ' ponto(s).';
    }

    if (!text) return;
    window.dominoAmazonicoUI.addMessage('Mesa', text, awardedPoints > 0 ? 'system' : 'player');
  }

  playTile(player, tile, requestedSide, isOpening = false) {
    if (this.pendingReset) return;

    const validSides = this.getValidSides(tile);
    if (!validSides.includes(requestedSide)) {
      if (player.isHuman && validSides.length === 1) {
        requestedSide = validSides[0];
      } else {
        return;
      }
    }

    this.turnLocked = true;
    this.hideSnapPreview();

    const nextScale = this.getBoardScale(this.boardTiles.length + 1);
    this.currentBoardScale = nextScale;

    const projected = this.computeBoardPlacements(nextScale, { tile, side: requestedSide, isOpening });
    const placement = projected.byTileId[tile.id];
    if (!placement) return;

    if (this.boardTiles.length > 0) {
      this.relayoutBoardTiles(150, projected.byTileId);
    }

    const sprite = tile.sprite;
    if (sprite) {
      this.tweens.killTweensOf(sprite);
      sprite.removeInteractive();
      sprite.setTexture(this.getFaceTextureKey(tile));
      sprite.setDepth(280);
      this.boardContainer.add(sprite);
    }

    player.hand = player.hand.filter((entry) => entry.id !== tile.id);
    this.updatePlayerCounters();
    this.layoutHands(true);
    this.playTileSfx();

    this.tweens.add({
      targets: sprite,
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
      scale: nextScale,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        sprite.setDepth(140 + this.boardTiles.length);
        this.boardTiles.push({
          tile,
          side: requestedSide,
          sprite,
          playerId: player.id,
          slotIndex: placement.slotIndex || 0,
          rotation: placement.rotation,
          lineDir: placement.lineDir,
          layoutState: placement.layoutState ? { ...placement.layoutState } : null
        });
        player.lastTilePlayed = tile;

        this.applyPlacementState(tile, requestedSide, placement, isOpening);
        this.playedFirstTile = true;

        const tablePoints = this.calculateMovePoints();
        const rawSum = this.getTableRawSum();
        const teamId = this.getTeamId(player);
        const isRoundEnding = player.hand.length === 0;
        const isCarrocaFinish = isRoundEnding && tile.a === tile.b;
        let awardedPoints = 0;
        let infoMessage = '';
        let announcementResult = null;
        let announced = 0;
        let usedGalo = false;

        if (player.isHuman) {
          announced = this.pendingAnnouncement || 0;
          if (this.pendingGalo) {
            if (!this.isGaloStateForPlayer(player)) {
              announcementResult = { points: 0, status: 'galo-missed', message: 'GALO não confirmado. Sem bônus de 50 pontos; a jogada segue.' };
              infoMessage = announcementResult.message;
              this.animateGaloBurst(placement.x, placement.y, 'GALO não confirmado');
            } else {
              usedGalo = true;
              awardedPoints += 50;
              this.animateGaloBurst(placement.x, placement.y);
              announcementResult = this.evaluateAnnouncement(tablePoints, announced);
              if (!isCarrocaFinish) awardedPoints += announcementResult.points;
              infoMessage = announcementResult.points > 0 && !isCarrocaFinish
                ? 'GALO confirmado: +50 e +' + announcementResult.points + ' da mesa.'
                : 'GALO confirmado: +50 pontos.';
            }
          } else if (announced > 0) {
            announcementResult = this.evaluateAnnouncement(tablePoints, announced);
            awardedPoints = isCarrocaFinish ? 0 : announcementResult.points;
            infoMessage = isCarrocaFinish
              ? 'Batida com carroça: pontos da mesa entram junto com a batida.'
              : announcementResult.message;
          } else if (tablePoints > 0) {
            announcementResult = this.evaluateAnnouncement(tablePoints, announced);
            infoMessage = isCarrocaFinish
              ? 'Batida com carroça: pontos da mesa entram junto com a batida.'
              : 'Havia pontos na mesa, mas nada foi informado. Jogada sem pontuação.';
          }

          this.pendingAnnouncement = 0;
          this.pendingGalo = false;
          this.updatePointsDisplay();
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'points-reset' }, '*');
          }
        } else {
          announced = tablePoints;
          announcementResult = tablePoints > 0 ? this.evaluateAnnouncement(tablePoints, tablePoints) : null;
          awardedPoints = isCarrocaFinish ? 0 : tablePoints;
          if (this.isGaloStateForPlayer(player)) {
            usedGalo = true;
            awardedPoints += 50;
            this.animateGaloBurst(placement.x, placement.y, player.name + ' GALO +50');
            infoMessage = player.name + ' fez GALO e recebeu +50.';
          }
        }

        if (awardedPoints > 0) {
          this.awardPointsToTeam(teamId, awardedPoints);
          this.animateMovePoints(player, awardedPoints, placement.x, placement.y);
          this.sounds.score.play();
          this.updatePlayerCounters();
        } else if (announcementResult && announcementResult.status === 'over' && tablePoints <= 0) {
          this.animateGaloBurst(placement.x, placement.y, 'Sem pontos na mesa');
        }

        if (infoMessage) this.toast(infoMessage);
        this.publishMoveScoring(player, tile, announced, rawSum, tablePoints, awardedPoints, announcementResult, usedGalo);
        if (!player.isHuman) this.maybeBotChat(player, 'play');

        if (isRoundEnding) {
          this.finishRound(player, false, { tablePoints: isCarrocaFinish ? tablePoints : 0 });
          return;
        }

        this.passChain = 0;
        this.advanceTurn();
      }
    });
  }

  relayoutBoardTiles(duration = 0, placementMap) {
    const computed = placementMap || this.computeBoardPlacements(this.currentBoardScale).byTileId;
    this.boardTiles.forEach((entry, index) => {
      const target = computed[entry.tile.id];
      if (!target || !entry.sprite) return;

      this.tweens.killTweensOf(entry.sprite);
      const lockedRotation = target.rotation;
      entry.slotIndex = target.slotIndex || 0;
      entry.rotation = lockedRotation;
      entry.lineDir = target.lineDir;
      entry.layoutState = target.layoutState ? { ...target.layoutState } : entry.layoutState;
      entry.sprite.setRotation(lockedRotation);

      if (duration > 0) {
        this.tweens.add({
          targets: entry.sprite,
          x: target.x,
          y: target.y,
          scale: this.currentBoardScale,
          duration,
          ease: 'Sine.easeOut',
          onComplete: () => {
            entry.sprite.setRotation(lockedRotation);
            entry.sprite.setDepth(140 + index);
          }
        });
      } else {
        entry.sprite
          .setPosition(target.x, target.y)
          .setScale(this.currentBoardScale)
          .setRotation(lockedRotation)
          .setDepth(140 + index);
      }
    });
  }

  applyPlacementState(tile, side, placement, isOpening) {
    const domino = { left: tile.a, right: tile.b };
    if (side === 'center' || isOpening || !this.playedFirstTile) {
      this.centerTile = tile;
      this.centerValue = tile.a;
      this.spinnerCenter = tile.a === tile.b;

      this.sideCounts = { left: 0, right: 0, up: 0, down: 0 };
      this.openSides.left = tile.a;
      this.openSides.right = tile.a === tile.b ? tile.a : tile.b;
      this.openSides.up = this.spinnerCenter ? tile.a : null;
      this.openSides.down = this.spinnerCenter ? tile.a : null;

      this.boardState = {
        left: null,
        right: null,
        up: null,
        down: null,
        played: [domino],
        branches: {
          center: domino,
          left: [],
          right: [],
          up: [],
          down: [],
        }
      };
      return;
    }

    this.sideCounts[side] += 1;
    this.openSides[side] = placement.newOpen;
    this.boardState = placeDominoOnBoard(this.boardState, domino, side);
  }

  getActiveOpenValues() {
    if (!this.playedFirstTile) return [];
    if (!this.spinnerCenter) return [this.openSides.left, this.openSides.right].filter((value) => value !== null);

    const values = [this.openSides.left, this.openSides.right].filter((value) => value !== null);
    const lateralUnlocked = this.canUseSpinnerLaterals();

    if (this.sideCounts.up > 0 || lateralUnlocked) values.push(this.openSides.up);
    if (this.sideCounts.down > 0 || lateralUnlocked) values.push(this.openSides.down);
    return values.filter((value) => value !== null);
  }

  calculateMovePoints() {
    return calculateScore(this.boardState);
  }

  advanceTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.turnLocked = false;
    const player = this.players[this.currentPlayerIndex];

    if (player.isHuman) {
      this.setTurnText('Sua vez', player);
    } else {
      this.setTurnText('Vez de ' + player.name, player);
    }

    this.flashPlayerPanel(player);
    this.sounds.turn.play();

    if (player.isHuman) {
      const hasMove = player.hand.some((tile) => this.getValidSides(tile).length > 0);
      if (!hasMove) {
        this.toast('Você não tem pedra para jogar. Clique em PASSEI para declarar o passe.');
        if (window.dominoAmazonicoUI) {
          window.dominoAmazonicoUI.addSystemMessage('Sua vez: sem pedra válida. Declare PASSEI para passar.');
        }
      } else {
        this.toast('Arraste a pedra para a ponta desejada');
      }
      return;
    }

    this.time.delayedCall(760, () => this.takeAiTurn(player));
  }

  takeAiTurn(player) {
    if (this.pendingReset) return;
    const candidates = [];
    player.hand.forEach((tile) => {
      this.getValidSides(tile).forEach((side) => {
        candidates.push({ tile, side, score: this.evaluateAiMove(tile, side) });
      });
    });
    candidates.sort((a, b) => b.score - a.score || (b.tile.a + b.tile.b) - (a.tile.a + a.tile.b));
    if (!candidates.length) {
      this.handlePass(player);
      return;
    }
    this.playTile(player, candidates[0].tile, candidates[0].side);
  }

  evaluateAiMove(tile, side) {
    const preview = placeDominoOnBoard(this.boardState, { left: tile.a, right: tile.b }, side);
    const movePoints = calculateScore(preview);
    const strength = tile.a + tile.b + (tile.a === tile.b ? 7 : 0);
    const spinnerBonus = (side === 'up' || side === 'down') ? 8 : 0;
    return movePoints * 10 + strength + spinnerBonus;
  }

  getProjectedOpenValues(tile, side, newOpen) {
    const nextOpenSides = { ...this.openSides };
    if (side === 'center') {
      if (tile.a === tile.b) return [tile.a, tile.a];
      return [tile.a, tile.b];
    }

    nextOpenSides[side] = newOpen;
    const nextCounts = { ...this.sideCounts };
    nextCounts[side] += 1;

    if (!this.spinnerCenter) {
      return [nextOpenSides.left, nextOpenSides.right].filter((value) => value !== null);
    }

    const values = [nextOpenSides.left, nextOpenSides.right].filter((value) => value !== null);
    if (nextCounts.up > 0) values.push(nextOpenSides.up);
    if (nextCounts.down > 0) values.push(nextOpenSides.down);
    return values.filter((value) => value !== null);
  }

  handlePass(player) {
    if (this.pendingReset) return;

    const hasPlayableTile = player.hand.some((tile) => this.getValidSides(tile).length > 0);
    const firstPassInChain = this.passChain === 0;
    const isOpeningPass = !this.playedFirstTile;
    if (isOpeningPass) {
      this.toast(player.name + ' passou a saída');
      if (window.dominoAmazonicoUI) {
        window.dominoAmazonicoUI.addSystemMessage(player.name + ' passou a saída sem bonificação.');
      }
    } else if (firstPassInChain) {
      const opponentTeam = this.getOpponentTeamId(this.getTeamId(player));
      this.awardPointsToTeam(opponentTeam, 20);
      this.animateScoreGain(this.getTeamRepresentative(opponentTeam), 20);
      this.toast(hasPlayableTile ? 'PASSE com pedra jogável. Dupla adversária +20 pontos.' : 'Passe registrado. Dupla adversária +20 pontos.');
      if (window.dominoAmazonicoUI) {
        window.dominoAmazonicoUI.addSystemMessage(
          hasPlayableTile
            ? player.name + ' passou mesmo tendo pedra jogável. Dupla adversária recebeu +20.'
            : player.name + ' passou. Dupla adversária recebeu +20.'
        );
      }
    } else {
      this.toast(player.name + ' passou a vez');
    }

    this.pendingAnnouncement = 0;
    this.pendingGalo = false;
    this.updatePointsDisplay();
    this.passChain += 1;
    this.setTurnText(player.name + ' passou', player);
    if (!player.isHuman) this.maybeBotChat(player, 'pass');

    this.time.delayedCall(650, () => {
      if (this.passChain >= this.players.length) {
        this.finishRound(this.getBlockedRoundWinner(), true);
      } else {
        this.advanceTurn();
      }
    });
  }

  getBlockedRoundWinner() {
    const sums = [0, 0];
    this.players.forEach((player) => {
      sums[this.getTeamId(player)] += player.hand.reduce((sum, tile) => sum + tile.a + tile.b, 0);
    });
    const winnerTeam = sums[0] <= sums[1] ? 0 : 1;
    return this.getTeamRepresentative(winnerTeam);
  }

  finishRound(winner, blocked, options = {}) {
    if (this.pendingReset) return;
    this.pendingReset = true;
    this.turnLocked = true;
    this.hideSnapPreview();

    const winnerTeam = this.getTeamId(winner);
    const loserTeam = this.getOpponentTeamId(winnerTeam);
    const loserPoints = this.players
      .filter((player) => this.getTeamId(player) === loserTeam)
      .reduce((sum, player) => sum + player.hand.reduce((acc, tile) => acc + tile.a + tile.b, 0), 0);
    let roundPoints = this.floorToFive(loserPoints);

    // Verifica se o jogador bateu com uma carroça (dupla)
    let bateuComCarroca = false;
    if (winner && winner.lastTilePlayed) {
      const tile = winner.lastTilePlayed;
      if (tile.a === tile.b) {
        bateuComCarroca = true;
      }
    }

    // Se não houver lastTilePlayed, tenta buscar a última pedra jogada
    if (!bateuComCarroca && this.boardTiles && this.boardTiles.length > 0) {
      const lastBoardTile = this.boardTiles[this.boardTiles.length - 1];
      if (lastBoardTile && lastBoardTile.tile && lastBoardTile.tile.a === lastBoardTile.tile.b && lastBoardTile.playerId === winner.id) {
        bateuComCarroca = true;
      }
    }

    const carrocaTablePoints = bateuComCarroca ? Math.max(0, Number(options.tablePoints) || 0) : 0;

    if (bateuComCarroca) {
      roundPoints += 20 + carrocaTablePoints;
      const parts = ['+20 pela carroça'];
      if (carrocaTablePoints > 0) parts.push('+' + carrocaTablePoints + ' da mesa');
      if (loserPoints > 0) parts.push('+' + this.floorToFive(loserPoints) + ' da mão adversária');
      this.toast('Bateu com carroça! ' + parts.join(' / ') + '.');
    }

    this.awardPointsToTeam(winnerTeam, roundPoints);
    this.animateScoreGain(this.getTeamRepresentative(winnerTeam), roundPoints);
    this.updatePlayerCounters();

    const teamName = this.getTeamLabel(winnerTeam);
    const msg = teamName + ' venceu ' + (blocked ? 'por travamento' : 'a rodada') + ' (+' + roundPoints + ')';
    this.setTurnText(msg, winner);
    this.toast(teamName + ' ganhou ' + roundPoints + ' pontos');
    this.sounds.score.play();

    if (winnerTeam === 0) {
      this.sounds.victory.play();
    } else {
      this.sounds.defeat.play();
      this.maybeBotChat(winner, 'win');
    }

    const teamScore = this.teamScores[winnerTeam] || 0;
    const endMsg = teamScore >= MATCH_TARGET_SCORE
      ? teamName + ' venceu a partida com ' + teamScore + ' pontos!'
      : 'Próxima rodada em instantes';

    this.previousRoundOutcome = blocked ? 'blocked' : 'batida';
    this.lastRoundWinnerId = winner.id;

    if (window.dominoAmazonicoUI) window.dominoAmazonicoUI.addSystemMessage(endMsg);

    if (teamScore >= MATCH_TARGET_SCORE) {
      this.finishMatchCelebration(winnerTeam, teamScore);
      return;
    }

    this.time.delayedCall(2400, () => {
      this.toast(endMsg);
      this.startNewRound();
    });
  }

  finishMatchCelebration(winnerTeam, teamScore) {
    const champions = this.players.filter((player) => this.getTeamId(player) === winnerTeam);
    const championNames = champions.map((player) => player.name).join(' e ');
    const message = 'Parabéns jogadores ' + championNames + '! Vocês venceram o jogo com ' + teamScore + ' pontos.';

    this.pendingReset = true;
    this.turnLocked = true;
    this.setTurnText(message, champions[0] || this.players[0]);
    this.toast(message);
    this.sounds.victory.play();
    this.animateMatchVictory(message);

    if (window.dominoAmazonicoUI) {
      window.dominoAmazonicoUI.addSystemMessage(message);
    }

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'match-finished',
        winnerPlayerIndex: champions[0]?.id ?? 0,
        winnerTeam,
        message
      }, '*');
    }

    this.time.delayedCall(5200, () => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'request-exit' }, '*');
      } else {
        window.location.href = '/lobby';
      }
    });
  }

  animateMatchVictory(message) {
    const overlay = this.add.container(this.boardCenter.x, this.boardCenter.y).setDepth(520);
    const bg = this.add.rectangle(0, 0, 980, 310, 0x06130f, 0.88)
      .setStrokeStyle(3, 0xffe48f, 0.95);
    const title = this.add.text(0, -58, 'VITORIA DA PARTIDA', {
      fontFamily: 'Arial',
      fontStyle: 'bold',
      fontSize: '44px',
      color: '#fff7b2',
      stroke: '#3b2208',
      strokeThickness: 7,
      align: 'center'
    }).setOrigin(0.5);
    const body = this.add.text(0, 26, message, {
      fontFamily: 'Arial',
      fontStyle: 'bold',
      fontSize: '28px',
      color: '#ffffff',
      stroke: '#0f241b',
      strokeThickness: 5,
      align: 'center',
      wordWrap: { width: 840 }
    }).setOrigin(0.5);
    overlay.add([bg, title, body]);
    overlay.setScale(0.72);
    overlay.setAlpha(0);

    this.tweens.add({
      targets: overlay,
      scale: 1,
      alpha: 1,
      duration: 360,
      ease: 'Back.easeOut'
    });

    for (let index = 0; index < 28; index += 1) {
      const angle = (Math.PI * 2 * index) / 28;
      const spark = this.add.circle(this.boardCenter.x, this.boardCenter.y, 6, 0xffe48f, 0.95).setDepth(519);
      this.tweens.add({
        targets: spark,
        x: this.boardCenter.x + Math.cos(angle) * Phaser.Math.Between(260, 520),
        y: this.boardCenter.y + Math.sin(angle) * Phaser.Math.Between(120, 260),
        alpha: 0,
        scale: 0.2,
        duration: 1300,
        delay: index * 32,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy()
      });
    }
  }

  animateMovePoints(player, points, x, y) {
    const burst = this.add.text(x, y - 8, '+' + points, {
      fontFamily: 'Arial',
      fontStyle: 'bold',
      fontSize: '34px',
      color: '#ffe48f',
      stroke: '#4a2d10',
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(290);
    this.tweens.add({
      targets: burst,
      y: y - 48,
      alpha: 0,
      scale: 1.15,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => burst.destroy()
    });
    this.flashPlayerPanel(player);
  }

  animateScoreGain(player, points) {
    const cfg = player.panelConfig;
    const x = player.panel.x + cfg.scoreBadge.x;
    const y = player.panel.y + cfg.scoreBadge.y - 48;
    const burst = this.add.text(x, y, '+' + points, {
      fontFamily: 'Arial',
      fontStyle: 'bold',
      fontSize: '30px',
      color: '#ffe48f',
      stroke: '#4a2d10',
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(290);
    const value = { score: player.score - points };
    this.tweens.add({
      targets: value,
      score: player.score,
      duration: 800,
      ease: 'Quad.easeOut',
      onUpdate: () => { player.scoreText.setText(String(Math.round(value.score))); },
      onComplete: () => { player.scoreText.setText(String(player.score)); }
    });
    this.tweens.add({
      targets: burst,
      y: y - 40,
      alpha: 0,
      scale: 1.1,
      duration: 850,
      ease: 'Sine.easeOut',
      onComplete: () => burst.destroy()
    });
    this.flashPlayerPanel(player);
  }

  resetMatchScores() {
    this.teamScores = [0, 0];
    this.players.forEach((player) => { player.score = 0; });
    this.updatePlayerCounters();
  }

  flashPlayerPanel(player) {
    this.tweens.killTweensOf(player.panel);
    player.panel.setScale(1);
    this.tweens.add({
      targets: player.panel,
      scaleX: 1.03,
      scaleY: 1.03,
      duration: 180,
      yoyo: true,
      ease: 'Sine.easeOut'
    });
  }

  setTurnText(text, player) {
    showGameMessage(text);
    // Se quiser ocultar o badge visual antigo, descomente a linha abaixo:
    // this.turnBadge.setVisible(false);
  }

  positionTurnBadge(player) {
    if (player.id === 0) {
      const cfg = player.panelConfig;
      this.turnBadge.setPosition(player.panel.x + cfg.turnBadge.x, player.panel.y + cfg.turnBadge.y);
      return;
    }
    const cfg = player.panelConfig;
    this.turnBadge.setPosition(player.panel.x + cfg.turnBadge.x, player.panel.y + cfg.turnBadge.y);
  }

  playTileSfx(volume = 0.55) {
    if (!this.soundEnabled) return;
    try {
      const available = this.tileSfxKeys.filter((key) => this.cache.audio && this.cache.audio.exists(key));
      if (!available.length) return;
      const key = Phaser.Utils.Array.GetRandom(available);
      // Usa volume máximo para o som das pedras
      this.sound.play(key, { volume: 1.0, detune: Phaser.Math.Between(-70, 70) });
    } catch (error) {
      console.warn('Failed to play tile sound:', error);
    }
  }

  generateAllTileTextures() {
    const themeIndex = this.currentTileThemeIndex;
    for (let a = 0; a <= 6; a += 1) {
      for (let b = a; b <= 6; b += 1) {
        const key = 'tile-face-' + themeIndex + '-' + a + '-' + b;
        if (this.textures.exists(key)) this.textures.remove(key);
        this.generateDominoTexture(key, a, b, TILE_THEMES[themeIndex]);
      }
    }
    if (this.textures.exists('tile-back')) this.textures.remove('tile-back');
    this.generateBackTexture('tile-back', TILE_THEMES[themeIndex]);
  }

  generateDominoTexture(key, a, b, theme) {
    const canvas = this.textures.createCanvas(key, TILE_W, TILE_H);
    const ctx = canvas.context;
    const radius = 14;

    ctx.clearRect(0, 0, TILE_W, TILE_H);
    ctx.save();
    // ctx.shadowColor = 'rgba(0,0,0,0.28)';
    // ctx.shadowBlur = 9;
    // ctx.shadowOffsetY = 3;
    this.roundRect(ctx, 5, 4, TILE_W - 10, TILE_H - 10, radius);
    ctx.fillStyle = theme.edge;
    ctx.fill();
    ctx.restore();

    const grad = ctx.createLinearGradient(0, 0, 0, TILE_H);
    grad.addColorStop(0, theme.shine);
    grad.addColorStop(0.35, theme.face);
    grad.addColorStop(1, theme.accent);
    this.roundRect(ctx, 7, 6, TILE_W - 14, TILE_H - 14, radius - 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.56)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, 8, 7, TILE_W - 16, TILE_H - 16, radius - 3);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(TILE_W / 2, 12);
    ctx.lineTo(TILE_W / 2, TILE_H - 12);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(70,50,30,0.32)';
    ctx.stroke();

    this.drawPips(ctx, a, 7, 6, TILE_W / 2 - 7, TILE_H - 12, theme.pip);
    this.drawPips(ctx, b, TILE_W / 2, 6, TILE_W / 2 - 7, TILE_H - 12, theme.pip);

    ctx.beginPath();
    ctx.arc(TILE_W / 2, TILE_H / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,95,60,0.28)';
    ctx.fill();

    canvas.refresh();
  }

  generateBackTexture(key, theme) {
    const canvas = this.textures.createCanvas(key, TILE_W, TILE_H);
    const ctx = canvas.context;
    const radius = 14;

    ctx.clearRect(0, 0, TILE_W, TILE_H);
    ctx.save();
    // ctx.shadowColor = 'rgba(0,0,0,0.24)';
    // ctx.shadowBlur = 9;
    // ctx.shadowOffsetY = 3;
    this.roundRect(ctx, 5, 4, TILE_W - 10, TILE_H - 10, radius);
    ctx.fillStyle = theme.edge;
    ctx.fill();
    ctx.restore();

    const bg = ctx.createLinearGradient(0, 0, TILE_W, TILE_H);
    bg.addColorStop(0, theme.shine);
    bg.addColorStop(0.42, theme.face);
    bg.addColorStop(1, theme.accent);
    this.roundRect(ctx, 7, 6, TILE_W - 14, TILE_H - 14, radius - 2);
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, 10, 9, TILE_W - 20, TILE_H - 18, radius - 4);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(TILE_W / 2, TILE_H / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = theme.edge;
    ctx.globalAlpha = 0.34;
    ctx.fill();
    ctx.globalAlpha = 1;
    canvas.refresh();
  }

  drawPips(ctx, count, x, y, w, h, color) {
    const positions = PIP_LAYOUTS[count];
    const radius = Math.min(w, h) * 0.078;
    positions.forEach(([px, py]) => {
      const cx = x + px * w;
      const cy = y + py * h;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 1, cy - 1, radius * 0.44, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.11)';
      ctx.fill();
    });
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  getFaceTextureKey(tile) {
    return 'tile-face-' + this.currentTileThemeIndex + '-' + tile.a + '-' + tile.b;
  }

  refreshAllTileSprites() {
    this.players.forEach((player) => {
      player.hand.forEach((tile) => {
        if (tile.sprite) tile.sprite.setTexture(player.isHuman ? this.getFaceTextureKey(tile) : 'tile-back');
      });
    });
    this.boardTiles.forEach((entry) => {
      if (entry.sprite) entry.sprite.setTexture(this.getFaceTextureKey(entry.tile));
    });
  }

  applyTileTheme(index, preservePreset = false) {
    this.currentTileThemeIndex = index;
    if (!preservePreset) this.currentVisualMode = 'custom';
    this.generateAllTileTextures();
    this.refreshAllTileSprites();
    this.toast('Pedras: ' + TILE_THEMES[index].name);
    if (window.dominoAmazonicoUI) window.dominoAmazonicoUI.syncSettingsState();
  }

  applyBgTheme(index, preservePreset = false) {
    this.currentBgThemeIndex = index;
    if (!preservePreset) this.currentVisualMode = 'custom';
    this.drawBackground(BG_THEMES[index]);
    this.relayoutBoardTiles(120);
    this.toast('Mesa: ' + BG_THEMES[index].name);
    if (window.dominoAmazonicoUI) window.dominoAmazonicoUI.syncSettingsState();
  }

  applyVisualPreset(mode) {
    if (mode === 'dark') {
      this.currentVisualMode = 'dark';
      this.applyTileTheme(4, true);
      this.applyBgTheme(4, true);
      this.toast('Modo escuro ativado');
    } else {
      this.currentVisualMode = 'light';
      this.applyTileTheme(0, true);
      this.applyBgTheme(0, true);
      this.toast('Modo claro ativado');
    }
    if (window.dominoAmazonicoUI) window.dominoAmazonicoUI.syncSettingsState();
  }

  toggleSoundEnabled() {
    this.soundEnabled = !this.soundEnabled;
    this.sound.mute = !this.soundEnabled;
    this.toast(this.soundEnabled ? 'Som ativado' : 'Som desativado');
  }

  restartRoundFromUI() {
    this.toast('Nova rodada iniciada');
    this.startNewRound();
  }

  animateGaloBurst(x, y, label = '50 pontos GALO') {
    const burst = this.add.text(x, y - 12, label, {
      fontFamily: 'Arial',
      fontStyle: 'bold',
      fontSize: '30px',
      color: '#fff7b2',
      stroke: '#6b3f10',
      strokeThickness: 6,
      align: 'center'
    }).setOrigin(0.5).setDepth(292);
    this.tweens.add({
      targets: burst,
      y: y - 84,
      alpha: 0,
      scale: 1.16,
      duration: 1150,
      ease: 'Sine.easeOut',
      onComplete: () => burst.destroy()
    });
  }

  onHumanChat(text) {
    this.toast('Mensagem enviada');
    const seat = Phaser.Utils.Array.GetRandom(this.players.slice(1));
    const reply = Phaser.Utils.Array.GetRandom(CHAT_REPLIES.human);
    this.time.delayedCall(650, () => {
      if (window.dominoAmazonicoUI) window.dominoAmazonicoUI.addMessage(seat.name, reply, 'player');
    });
  }

  maybeBotChat(player, type) {
    const pool = CHAT_REPLIES[type] || CHAT_REPLIES.play;
    const msg = Phaser.Utils.Array.GetRandom(pool);
    if (window.dominoAmazonicoUI) window.dominoAmazonicoUI.addMessage(player.name, msg, 'player');
  }

  // Funções para controles da UI
  adjustPendingAnnouncement(delta) {
    if (this.currentPlayerIndex !== 0 || !this.players[0].isHuman) return;
    const newValue = Math.max(0, Math.min(200, (this.pendingAnnouncement || 0) + delta));
    this.pendingAnnouncement = newValue;
    // Sincroniza input visual imediatamente
    const pointsInput = document.getElementById('points-input');
    if (pointsInput) pointsInput.value = String(newValue);
    this.updatePointsDisplay();
    // Feedback claro
    if (window.dominoAmazonicoUI) window.dominoAmazonicoUI.addSystemMessage('Pontuação anunciada: ' + newValue);
  }

  requestHumanPass() {
    if (this.currentPlayerIndex !== 0 || !this.players[0].isHuman) return;
    if (this.turnLocked) return;
    this.humanPassRequested = true;
    this.handlePass(this.players[0]);
  }

  toggleGaloAnnouncement() {
    if (this.currentPlayerIndex !== 0 || !this.players[0].isHuman) return;
    const nextState = !this.pendingGalo;
    this.pendingGalo = nextState;
    this.toast(this.pendingGalo ? 'GALO armado. Será validado após a pedra jogada.' : 'GALO cancelado');
    this.updatePointsDisplay();
  }

  getTeamId(playerOrId) {
    const id = typeof playerOrId === 'number' ? playerOrId : playerOrId.id;
    return id % 2 === 0 ? 0 : 1;
  }

  getOpponentTeamId(teamId) {
    return teamId === 0 ? 1 : 0;
  }

  syncPlayerScoresWithTeams() {
    if (!Array.isArray(this.players) || !Array.isArray(this.teamScores)) return;
    this.players.forEach((player) => {
      player.score = this.teamScores[this.getTeamId(player)] || 0;
    });
  }

  floorToFive(value) {
    return Math.max(0, Math.floor(value / 5) * 5);
  }

  awardPointsToTeam(teamId, points) {
    if (!points || points <= 0) return;
    this.teamScores[teamId] = (this.teamScores[teamId] || 0) + points;
    this.syncPlayerScoresWithTeams();
  }

  getTeamRepresentative(teamId) {
    return this.players.find((player) => this.getTeamId(player) === teamId) || this.players[0];
  }

  getTeamLabel(teamId) {
    return this.players
      .filter((player) => this.getTeamId(player) === teamId)
      .map((player) => player.name)
      .join(' & ');
  }

  getPlayerStatusLabel(player) {
    if (player.isHuman) {
      if (player.rankPosition) return 'Ranking #' + player.rankPosition + ' · ' + this.getCompetitiveTierLabel(player.competitivePoints || 0);
      return (player.competitivePoints || 0) + ' pts competitivos';
    }
    if (player.isStandIn) return 'Bot assumindo';
    return (player.competitivePoints || 0) + ' pts · oponente';
  }

  getCompetitiveTierLabel(points) {
    if (points >= 120) return 'Lenda';
    if (points >= 70) return 'Craque';
    if (points >= 30) return 'Bom jogador';
    if (points >= 10) return 'Em evolução';
    return 'Iniciante';
  }

  findSenaStarter() {
    for (const player of this.players) {
      const tile = player.hand.find((entry) => entry.a === 6 && entry.b === 6);
      if (tile) return { player, tile };
    }
    return null;
  }

  findHighestDouble(player) {
    return player.hand
      .filter((tile) => tile.a === tile.b)
      .sort((a, b) => b.a - a.a)[0] || null;
  }

  chooseStarterFromTeam(teamId) {
    const candidates = this.players
      .filter((player) => this.getTeamId(player) === teamId)
      .map((player) => ({ player, tile: this.findHighestDouble(player) }))
      .filter((entry) => entry.tile);
    candidates.sort((a, b) => b.tile.a - a.tile.a || a.player.id - b.player.id);
    return candidates[0] || null;
  }

  findBestDoubleStarter() {
    const candidates = this.players
      .map((player) => ({ player, tile: this.findHighestDouble(player) }))
      .filter((entry) => entry.tile);
    candidates.sort((a, b) => b.tile.a - a.tile.a || a.player.id - b.player.id);
    return candidates[0];
  }

  isValidOpeningTile(tile) {
    const requirement = this.currentOpeningRequirement;
    if (!requirement) return true;
    if (requirement.type === 'double') return tile.a === tile.b;
    return tile.a === requirement.a && tile.b === requirement.b;
  }

  isGaloStateForPlayer(player) {
    const playerHand = player.hand.map(tile => ({ left: tile.a, right: tile.b }));
    const otherHands = this.players.filter(p => p.id !== player.id).map(p => p.hand.map(tile => ({ left: tile.a, right: tile.b })));
    return hasExclusiveNextPlay(playerHand, otherHands, this.boardState);
  }

  finishMatchByWrongGalo(player) {
    this.pendingAnnouncement = 0;
    this.pendingGalo = false;
    this.updatePointsDisplay();
    this.animateGaloBurst(this.boardCenter.x, this.boardCenter.y, 'GALO não confirmado');
    const msg = 'GALO não confirmado. Sem bônus de 50 pontos; a jogada segue normalmente.';
    this.toast(msg);
    if (window.dominoAmazonicoUI) window.dominoAmazonicoUI.addSystemMessage(msg);
  }

  finishMatchByWrongPass(player) {
    const opponentTeam = this.getOpponentTeamId(this.getTeamId(player));
    this.pendingReset = true;
    this.turnLocked = true;
    this.pendingAnnouncement = 0;
    this.pendingGalo = false;
    this.updatePointsDisplay();
    this.teamScores[opponentTeam] = Math.max(MATCH_TARGET_SCORE, this.teamScores[opponentTeam] || 0);
    this.syncPlayerScoresWithTeams();
    this.updatePlayerCounters();
    const msg = 'PASSE errado: havia pedra jogável na mão. ' + this.getTeamLabel(opponentTeam) + ' vence a partida imediatamente.';
    this.toast(msg);
    if (window.dominoAmazonicoUI) window.dominoAmazonicoUI.addSystemMessage(msg);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'points-reset' }, '*');
    }
    this.time.delayedCall(2600, () => {
      this.resetMatchScores();
      this.previousRoundOutcome = 'first';
      this.lastRoundWinnerId = null;
      this.startNewRound();
    });
  }

  applyUploadedAvatarToHuman(dataUrl, persist = false) {
    const key = 'avatar_uploaded_human';
    const image = new Image();
    image.onload = () => {
      if (this.textures.exists(key)) this.textures.remove(key);
      const canvas = this.textures.createCanvas(key, 256, 256);
      const ctx = canvas.context;
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 256, 256);
      const ratio = Math.max(256 / image.width, 256 / image.height);
      const drawW = image.width * ratio;
      const drawH = image.height * ratio;
      const dx = (256 - drawW) / 2;
      const dy = (256 - drawH) / 2;
      ctx.drawImage(image, dx, dy, drawW, drawH);
      canvas.refresh();
      this.applyAvatarToPlayer(this.players[0], key);
      if (persist) this.persistHumanProfileImage(dataUrl);
    };
    image.src = dataUrl;
  }

  persistHumanProfileImage(dataUrl) {
    try {
      const key = 'domino_player_profile';
      const current = JSON.parse(window.localStorage.getItem(key) || '{}');
      const next = {
        ...current,
        avatarType: 'upload',
        avatarImage: dataUrl
      };
      const serialized = JSON.stringify(next);
      window.localStorage.setItem(key, serialized);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: serialized }));
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'player-profile-updated', profile: next }, '*');
      }
    } catch (error) {
      console.warn('Failed to persist avatar image:', error);
    }
  }

  applyExternalProfile(payload) {
    if (!Array.isArray(this.players) || !this.players[0]) return;
    const profile = payload && payload.profile ? payload.profile : payload;
    const stats = payload && payload.stats ? payload.stats : null;
    if (!profile) return;
    const human = this.players[0];
    human.name = profile.displayName || human.name;
    if (human.nameText) human.nameText.setText(human.name);
    if (profile.avatarType === 'upload' && profile.avatarImage) {
      this.applyUploadedAvatarToHuman(profile.avatarImage);
    } else if (profile.avatarPresetId) {
      const options = this.avatarOptions || AVATAR_OPTIONS;
      const preset = options.find((option) => option.key === profile.avatarPresetId) || options[0];
      if (preset) this.applyAvatarToPlayer(human, preset.key);
    }
    if (stats) {
      human.competitivePoints = stats.totalPoints || 0;
      human.rankPosition = stats.rank || null;
    }
    this.updatePlayerCounters();
  }

  applyExternalPlayers(players = []) {
    if (!Array.isArray(this.players)) return;
    const others = Array.isArray(players) ? players.slice(1, 4) : [];
    others.forEach((entry, index) => {
      const player = this.players[index + 1];
      if (!player) return;
      const shouldUseBot = !entry || entry.isOnline === false;
      const previousName = player.name;
      if (shouldUseBot) {
        player.name = 'Bot Amazônico ' + (index + 1);
        player.isStandIn = true;
      } else {
        player.name = entry.name || ('Jogador ' + (index + 2));
        player.isStandIn = false;
      }
      if (player.nameText) player.nameText.setText(player.name);
      if (shouldUseBot && previousName !== player.name) {
        this.toast('Jogador ausente. ' + player.name + ' assumiu automaticamente.');
      }
    });
    this.updatePlayerCounters();
  }

  updatePointsDisplay() {
    if (window.dominoAmazonicoUI && window.dominoAmazonicoUI.syncSettingsState) {
      window.dominoAmazonicoUI.syncSettingsState();
    }
  }
}
