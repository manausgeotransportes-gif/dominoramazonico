import DominoAmazonicoScene from './DominoAmazonicoScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './constants.js';
import { initDominoAmazonicoUI } from './ui.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  transparent: true,
  backgroundColor: 'rgba(0,0,0,0)',
  scene: [DominoAmazonicoScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  },
  input: {
    activePointers: 3,
    smoothFactor: 0.15
  }
});

window.dominoAmazonicoGame = game;
initDominoAmazonicoUI(game);

// Exibe mensagem no campo fixo inferior direito
export function showGameMessage(text, duration = 3200) {
  let el = document.getElementById('game-messages');
  if (!el) return;
  el.innerHTML = `<div style="background:rgba(20,48,41,0.92);color:#ffe48f;padding:8px 12px;margin-bottom:6px;border-radius:10px;font-size:0.82rem;box-shadow:0 2px 8px #0005;max-width:180px;word-break:break-word;">${text}</div>`;
  el.style.display = 'block';
  clearTimeout(window._gameMsgTimeout);
  window._gameMsgTimeout = setTimeout(() => {
    el.style.display = 'none';
    el.innerHTML = '';
  }, duration);
}
window.showGameMessage = showGameMessage;
