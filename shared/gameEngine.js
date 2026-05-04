// shared/gameEngine.js - Lógica centralizada do jogo, usada por backend e frontend

export function cloneDomino(domino) {
  return { left: domino.left, right: domino.right };
}

export function reverseDomino(domino) {
  return { left: domino.right, right: domino.left };
}

export function isDouble(domino) {
  return domino.left === domino.right;
}

export function sameDomino(a, b) {
  return a.left === b.left && a.right === b.right;
}

export function getCenterDomino(boardState) {
  const branches = boardState.branches ?? {
    center: boardState.played[0] ? cloneDomino(boardState.played[0]) : null,
    left: [],
    right: [],
    up: [],
    down: [],
  };
  return branches.center ?? (boardState.played[0] ? cloneDomino(boardState.played[0]) : null);
}

function getBranchArray(boardState, side) {
  const branches = boardState.branches ?? {
    center: boardState.played[0] ? cloneDomino(boardState.played[0]) : null,
    left: boardState.left ? [cloneDomino(boardState.left)] : [],
    right: boardState.right ? [cloneDomino(boardState.right)] : [],
    up: boardState.up ? [cloneDomino(boardState.up)] : [],
    down: boardState.down ? [cloneDomino(boardState.down)] : [],
  };
  return branches[side] ?? [];
}

function getOuterValueFromBranch(branch, side) {
  const end = branch[branch.length - 1];
  if (!end) return null;
  if (side === "left" || side === "up") return end.left;
  return end.right;
}

function getBranchOpenValues(branch, side) {
  const openValue = getOuterValueFromBranch(branch, side);
  if (openValue === null) return [];
  const end = branch[branch.length - 1];
  return end && isDouble(end) ? [openValue, openValue] : [openValue];
}

export function areVerticalSidesUnlocked(boardState) {
  const branches = boardState.branches ?? {
    center: boardState.played[0] ? cloneDomino(boardState.played[0]) : null,
    left: boardState.left ? [cloneDomino(boardState.left)] : [],
    right: boardState.right ? [cloneDomino(boardState.right)] : [],
    up: boardState.up ? [cloneDomino(boardState.up)] : [],
    down: boardState.down ? [cloneDomino(boardState.down)] : [],
  };
  return branches.left.length > 0 && branches.right.length > 0;
}

export function getOpenValue(boardState, side) {
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

export function canPlayDomino(domino, boardState, side) {
  const center = getCenterDomino(boardState);
  const isEmptyBoard =
    !center &&
    !boardState.left &&
    !boardState.right &&
    !boardState.up &&
    !boardState.down &&
    boardState.played.length === 0;

  if (isEmptyBoard) {
    return boardState.openingRule === "anyCarroca"
      ? isDouble(domino)
      : domino.left === 6 && domino.right === 6;
  }

  const openValue = getOpenValue(boardState, side);
  if (openValue === null) return false;
  return domino.left === openValue || domino.right === openValue;
}

export function orientDominoForSide(domino, boardState, side) {
  const openValue = getOpenValue(boardState, side);
  if (openValue === null) return cloneDomino(domino);

  if (side === "left" || side === "up") {
    return domino.right === openValue ? cloneDomino(domino) : reverseDomino(domino);
  }

  return domino.left === openValue ? cloneDomino(domino) : reverseDomino(domino);
}

export function placeDominoOnBoard(boardState, domino, side) {
  const branches = boardState.branches ?? {
    center: boardState.played[0] ? cloneDomino(boardState.played[0]) : null,
    left: boardState.left ? [cloneDomino(boardState.left)] : [],
    right: boardState.right ? [cloneDomino(boardState.right)] : [],
    up: boardState.up ? [cloneDomino(boardState.up)] : [],
    down: boardState.down ? [cloneDomino(boardState.down)] : [],
  };

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
  const nextBranches = {
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

export function getOpenEnds(boardState) {
  const center = getCenterDomino(boardState);
  const branches = boardState.branches ?? {
    center: boardState.played[0] ? cloneDomino(boardState.played[0]) : null,
    left: boardState.left ? [cloneDomino(boardState.left)] : [],
    right: boardState.right ? [cloneDomino(boardState.right)] : [],
    up: boardState.up ? [cloneDomino(boardState.up)] : [],
    down: boardState.down ? [cloneDomino(boardState.down)] : [],
  };

  if (!center) {
    return [];
  }

  const leftBranch = branches.left;
  const rightBranch = branches.right;
  const upBranch = branches.up;
  const downBranch = branches.down;

  const leftOpen = getBranchOpenValues(leftBranch, "left");
  const rightOpen = getBranchOpenValues(rightBranch, "right");
  const upOpen = getBranchOpenValues(upBranch, "up");
  const downOpen = getBranchOpenValues(downBranch, "down");

  const openEnds = [];
  const hasBothLaterals = leftBranch.length > 0 && rightBranch.length > 0;

  if (isDouble(center) && !hasBothLaterals) {
    if (leftBranch.length > 0) openEnds.push(...leftOpen);
    if (rightBranch.length > 0) openEnds.push(...rightOpen);
    openEnds.push(center.left, center.right);
  } else {
    openEnds.push(...(leftOpen.length > 0 ? leftOpen : [center.left]));
    openEnds.push(...(rightOpen.length > 0 ? rightOpen : [center.right]));
  }

  if (upBranch.length > 0) {
    openEnds.push(...(upOpen.length > 0 ? upOpen : [center.left]));
  }
  if (downBranch.length > 0) {
    openEnds.push(...(downOpen.length > 0 ? downOpen : [center.right]));
  }

  return openEnds;
}

export function calculateOpenEndsSum(boardState) {
  return getOpenEnds(boardState).reduce((sum, value) => sum + value, 0);
}

export function calculateScore(boardState) {
  const score = calculateOpenEndsSum(boardState);
  return score > 0 && score % 5 === 0 ? score : 0;
}

export function hasValidMoves(hand, boardState) {
  const sides = ["left", "right", "up", "down"];
  return hand.some((domino) => sides.some((side) => canPlayDomino(domino, boardState, side)));
}

export function getValidMoves(hand, boardState) {
  const validMoves = [];
  const sides = ["left", "right", "up", "down"];
  for (const domino of hand) {
    for (const side of sides) {
      if (canPlayDomino(domino, boardState, side)) {
        validMoves.push({ domino, side });
      }
    }
  }
  return validMoves;
}

export function hasExclusiveNextPlay(playerHand, otherHands, boardState) {
  if (playerHand.length === 0) return false;
  if (!hasValidMoves(playerHand, boardState)) return false;
  return otherHands.every((hand) => !hasValidMoves(hand, boardState));
}
