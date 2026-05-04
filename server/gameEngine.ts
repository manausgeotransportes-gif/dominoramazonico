// ...existing code...

export type TableScoringSnapshot = {
  openEnds: number[];
  rawSum: number;
  score: number;
  centerCountsAsDouble: boolean;
  hasLeftBranch: boolean;
  hasRightBranch: boolean;
  hasUpBranch: boolean;
  hasDownBranch: boolean;
};

function getBranchOpenValues(branch: Domino[], side: BoardSide): number[] {
  const openValue = getOuterValueFromBranch(branch, side);
  if (openValue === null) return [];
  const end = branch[branch.length - 1];
  return end && isDouble(end) ? [openValue, openValue] : [openValue];
}

function isVerticalScoringOpen(branches: BoardBranches, side: "up" | "down"): boolean {
  return branches[side].length > 0;
}

export function getTableScoringSnapshot(boardState: BoardState): TableScoringSnapshot {
  const center = getCenterDomino(boardState);
  const branches = ensureBranches(boardState);

  if (!center) {
    return {
      openEnds: [],
      rawSum: 0,
      score: 0,
      centerCountsAsDouble: false,
      hasLeftBranch: false,
      hasRightBranch: false,
      hasUpBranch: false,
      hasDownBranch: false,
    };
  }

  const hasLeftBranch = branches.left.length > 0;
  const hasRightBranch = branches.right.length > 0;
  const hasUpBranch = branches.up.length > 0;
  const hasDownBranch = branches.down.length > 0;

  const leftOpen = getBranchOpenValues(branches.left, "left");
  const rightOpen = getBranchOpenValues(branches.right, "right");
  const upOpen = getBranchOpenValues(branches.up, "up");
  const downOpen = getBranchOpenValues(branches.down, "down");

  const openEnds: number[] = [];
  const hasBothLaterals = hasLeftBranch && hasRightBranch;

  if (isDouble(center) && !hasBothLaterals) {
    if (hasLeftBranch) openEnds.push(...leftOpen);
    if (hasRightBranch) openEnds.push(...rightOpen);
    openEnds.push(center.left, center.right);
  } else {
    openEnds.push(...(leftOpen.length > 0 ? leftOpen : [center.left]));
    openEnds.push(...(rightOpen.length > 0 ? rightOpen : [center.right]));
  }

  if (isVerticalScoringOpen(branches, "up")) {
    openEnds.push(...(upOpen.length > 0 ? upOpen : [center.left]));
  }
  if (isVerticalScoringOpen(branches, "down")) {
    openEnds.push(...(downOpen.length > 0 ? downOpen : [center.right]));
  }

  const rawSum = openEnds.reduce((sum, value) => sum + value, 0);
  const score = rawSum > 0 && rawSum % 5 === 0 ? rawSum : 0;

  return {
    openEnds,
    rawSum,
    score,
    centerCountsAsDouble: false, // Não usado mais
    hasLeftBranch,
    hasRightBranch,
    hasUpBranch,
    hasDownBranch,
  };
}
export interface Domino {
  left: number;
  right: number;
}

export type BoardSide = "left" | "right" | "up" | "down";

export interface BoardBranches {
  center: Domino | null;
  left: Domino[];
  right: Domino[];
  up: Domino[];
  down: Domino[];
}

export interface BoardState {
  left: Domino | null;
  right: Domino | null;
  up: Domino | null;
  down: Domino | null;
  played: Domino[];
  branches?: BoardBranches;
  openingRule?: "sena" | "anyCarroca";
}

export function createEmptyBoardState(openingRule: BoardState["openingRule"] = "sena"): BoardState {
  return {
    left: null,
    right: null,
    up: null,
    down: null,
    played: [],
    openingRule,
    branches: {
      center: null,
      left: [],
      right: [],
      up: [],
      down: [],
    },
  };
}

export function cloneDomino(domino: Domino): Domino {
  return { left: domino.left, right: domino.right };
}

export function reverseDomino(domino: Domino): Domino {
  return { left: domino.right, right: domino.left };
}

export function isDouble(domino: Domino): boolean {
  return domino.left === domino.right;
}

export function sameDomino(a: Domino, b: Domino): boolean {
  return a.left === b.left && a.right === b.right;
}

function ensureBranches(boardState: BoardState): BoardBranches {
  return boardState.branches ?? {
    center: boardState.played[0] ? cloneDomino(boardState.played[0]) : null,
    left: boardState.left ? [cloneDomino(boardState.left)] : [],
    right: boardState.right ? [cloneDomino(boardState.right)] : [],
    up: boardState.up ? [cloneDomino(boardState.up)] : [],
    down: boardState.down ? [cloneDomino(boardState.down)] : [],
  };
}

export function createDominoes(): Domino[] {
  const dominoes: Domino[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      dominoes.push({ left: i, right: j });
    }
  }
  return dominoes;
}

export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function distributeHands(playerCount: number = 4): Domino[][] {
  const dominoes = shuffle(createDominoes());
  const hands: Domino[][] = [];
  for (let i = 0; i < playerCount; i++) {
    hands.push(dominoes.slice(i * 7, (i + 1) * 7));
  }
  return hands;
}

export function findCarrocaSena(hand: Domino[]): Domino | null {
  return hand.find((d) => d.left === 6 && d.right === 6) || null;
}

export function hasAnyCarroca(hand: Domino[]): boolean {
  return hand.some((d) => isDouble(d));
}

export function getCenterDomino(boardState: BoardState): Domino | null {
  const branches = ensureBranches(boardState);
  return branches.center ?? (boardState.played[0] ? cloneDomino(boardState.played[0]) : null);
}

function getBranchArray(boardState: BoardState, side: BoardSide): Domino[] {
  const branches = ensureBranches(boardState);
  return branches[side] ?? [];
}

function getOuterValueFromBranch(branch: Domino[], side: BoardSide): number | null {
  const end = branch[branch.length - 1];
  if (!end) return null;
  if (side === "left" || side === "up") return end.left;
  return end.right;
}

export function areVerticalSidesUnlocked(boardState: BoardState): boolean {
  const branches = ensureBranches(boardState);
  return branches.left.length > 0 && branches.right.length > 0;
}

export function getOpenValue(boardState: BoardState, side: BoardSide): number | null {
  const center = getCenterDomino(boardState);
  const branch = getBranchArray(boardState, side);
  const outerValue = getOuterValueFromBranch(branch, side);
  if (outerValue !== null) return outerValue;

  if (!center) return null;
  if (side === "left") return center.left;
  if (side === "right") return center.right;
  if (!areVerticalSidesUnlocked(boardState)) return null;
  if (side === "up") return center.left;
  return center.right;
}

export function canPlayDomino(domino: Domino, boardState: BoardState, side: BoardSide): boolean {
  const center = getCenterDomino(boardState);
  const isEmptyBoard =
    !center &&
    !boardState.left &&
    !boardState.right &&
    !boardState.up &&
    !boardState.down &&
    boardState.played.length === 0;

  if (isEmptyBoard) {
    return boardState.openingRule === "anyCarroca" ? isDouble(domino) : domino.left === 6 && domino.right === 6;
  }

  const openValue = getOpenValue(boardState, side);
  if (openValue === null) return false;
  return domino.left === openValue || domino.right === openValue;
}

export function orientDominoForSide(domino: Domino, boardState: BoardState, side: BoardSide): Domino {
  const openValue = getOpenValue(boardState, side);
  if (openValue === null) return cloneDomino(domino);

  if (side === "left" || side === "up") {
    return domino.right === openValue ? cloneDomino(domino) : reverseDomino(domino);
  }

  return domino.left === openValue ? cloneDomino(domino) : reverseDomino(domino);
}

export function placeDominoOnBoard(boardState: BoardState, domino: Domino, side: BoardSide): BoardState {
  const branches = ensureBranches(boardState);

  if (!branches.center) {
    const center = domino;
    return {
      left: side === "left" ? center : null,
      right: side === "right" ? center : null,
      up: side === "up" ? center : null,
      down: side === "down" ? center : null,
      played: [center],
      openingRule: boardState.openingRule,
      branches: {
        center,
        left: [],
        right: [],
        up: [],
        down: [],
      },
    };
  }

  const placed = orientDominoForSide(domino, boardState, side);
  const nextBranches: BoardBranches = {
    center: cloneDomino(branches.center),
    left: branches.left.map(cloneDomino),
    right: branches.right.map(cloneDomino),
    up: branches.up.map(cloneDomino),
    down: branches.down.map(cloneDomino),
  };

  nextBranches[side].push(placed);

  return {
    left: nextBranches.left[nextBranches.left.length - 1] ?? null,
    right: nextBranches.right[nextBranches.right.length - 1] ?? null,
    up: nextBranches.up[nextBranches.up.length - 1] ?? null,
    down: nextBranches.down[nextBranches.down.length - 1] ?? null,
    played: [...boardState.played, placed],
    branches: nextBranches,
  };
}

export function playDomino(domino: Domino, boardState: BoardState, side: BoardSide): BoardState {
  return placeDominoOnBoard(boardState, domino, side);
}


export function getOpenEnds(boardState: BoardState): number[] {
  return getTableScoringSnapshot(boardState).openEnds;
}


export function calculateOpenEndsSum(boardState: BoardState): number {
  return getTableScoringSnapshot(boardState).rawSum;
}


export function calculateScore(boardState: BoardState): number {
  return getTableScoringSnapshot(boardState).score;
}

export function hasValidMoves(hand: Domino[], boardState: BoardState): boolean {
  const sides: BoardSide[] = ["left", "right", "up", "down"];
  return hand.some((domino) => sides.some((side) => canPlayDomino(domino, boardState, side)));
}

export function getValidMoves(hand: Domino[], boardState: BoardState): Array<{ domino: Domino; side: BoardSide }> {
  const validMoves: Array<{ domino: Domino; side: BoardSide }> = [];
  const sides: BoardSide[] = ["left", "right", "up", "down"];
  for (const domino of hand) {
    for (const side of sides) {
      if (canPlayDomino(domino, boardState, side)) {
        validMoves.push({ domino, side });
      }
    }
  }
  return validMoves;
}

export function getBotMove(hand: Domino[], boardState: BoardState): { domino: Domino; side: BoardSide } | null {
  const validMoves = getValidMoves(hand, boardState);
  if (validMoves.length === 0) return null;

  const scored = validMoves.map((move) => {
    const preview = placeDominoOnBoard(boardState, move.domino, move.side);
    const tableScore = calculateScore(preview);
    const weight = move.domino.left + move.domino.right + (isDouble(move.domino) ? 2 : 0) + tableScore;
    return { ...move, weight };
  });

  scored.sort((a, b) => b.weight - a.weight);
  return { domino: scored[0].domino, side: scored[0].side };
}

export function calculateLevel(totalGames: number, totalWins: number = 0): number {
  const experience = totalGames + totalWins * 2;
  return 1 + Math.floor(experience / 10);
}

export function calculateWinRate(totalWins: number, totalGames: number): string {
  if (totalGames === 0) return "0.00";
  return ((totalWins / totalGames) * 100).toFixed(2);
}
