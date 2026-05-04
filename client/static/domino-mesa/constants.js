export const GAME_WIDTH = 1600;
export const GAME_HEIGHT = 900;
export const TILE_W = 108;
export const TILE_H = 54;
export const HAND_TILE_SCALE = 1;
export const BOT_TILE_SCALE = 0.8;
export const BOARD_TILE_SCALE = 1;
export const MATCH_TARGET_SCORE = 200;
export const SNAP_DISTANCE = 128;

export const TILE_THEMES = [
  { name: 'Marfim', face: '#f5eedf', edge: '#c7a46a', pip: '#101010', accent: '#e5d5b6', shine: '#fffef8' },
  { name: 'Jade', face: '#d8f2e0', edge: '#4e8b68', pip: '#153421', accent: '#afddbe', shine: '#eefaf2' },
  { name: 'Safira', face: '#dde9fb', edge: '#5877a5', pip: '#15233c', accent: '#b6caeb', shine: '#f7fbff' },
  { name: 'Grafite', face: '#d8d8dd', edge: '#50545f', pip: '#121212', accent: '#b6bbc3', shine: '#f4f6f9' },
  { name: 'Ônix', face: '#1b1b1f', edge: '#565b66', pip: '#f4f5f7', accent: '#2a2d34', shine: '#373b45' },
];

export const BG_THEMES = [
  { name: 'Ambiente Atual', outer: '#081d17', rail: '#5b3b22', felt: '#188a87', glow: '#7bf0e4' },
  { name: 'Ambiente Claro', outer: '#d8f2ee', rail: '#b98a63', felt: '#7dd7cb', glow: '#ffffff' },
  { name: 'Ambiente Escuro', outer: '#030712', rail: '#1f2937', felt: '#0b1220', glow: '#7c8fb3' },
  { name: 'Noite Azul', outer: '#09121f', rail: '#3a2d24', felt: '#17406f', glow: '#4b95ff' },
  { name: 'Cacau', outer: '#1a0e09', rail: '#704329', felt: '#5a3721', glow: '#d89c52' },
  { name: 'Esmeralda', outer: '#071a16', rail: '#334e3a', felt: '#217359', glow: '#5bd7a7' },
];

export const AVATAR_OPTIONS = [
  { key: 'avatar_player', name: 'Guardiao' },
  { key: 'avatar_aru', name: 'Aru' },
  { key: 'avatar_boto', name: 'Boto' },
  { key: 'avatar_iara', name: 'Iara' },
  { key: 'avatar_onca', name: 'Onca' },
  { key: 'avatar_arara', name: 'Arara' },
  { key: 'avatar_curupira', name: 'Curupira' },
  { key: 'avatar_tucano', name: 'Tucano' }
];

export const PIP_LAYOUTS = {
  0: [],
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
  6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]]
};
