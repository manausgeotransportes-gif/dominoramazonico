import { getDb } from "./db";
import { games, gamePlayers, moves, chatMessages, rooms as gameRooms, roomPlayers, playerStats, users } from "../drizzle/schema";
import { asc, desc, eq, and } from "drizzle-orm";
import {
  distributeHands,
  findCarrocaSena,
  hasAnyCarroca,
  canPlayDomino,
  calculateScore,
  calculateOpenEndsSum,
  calculateLevel,
  calculateWinRate,
  hasValidMoves,
  getBotMove,
  createEmptyBoardState,
  placeDominoOnBoard,
  getTableScoringSnapshot,
  isDouble,
  type Domino,
  type BoardState,
  type BoardSide,
} from "./gameEngine";

import type { LocalGameState } from "./localStore";
import { getRoomByIdLocal, createRoomLocal, joinRoomLocal, leaveRoomLocal, getLocalUserById, createGameLocal, setGameLocal, recomputeTeamScores, getTeamIndex, ensureRoomReadyWithBots, getGameByRoomLocal, recordFinishedGame, getGameByIdLocal, appendMessage, recordRoomMatchResultLocal } from "./localStore";

const roomGameStartLocks = new Map<number, Promise<GameState | LocalGameState | null>>();

const STANDARD_BOT_SLOTS = [
  { openId: "bot-padrao-1", name: "Bot Norte", email: "bot-padrao-1@domino.local" },
  { openId: "bot-padrao-2", name: "Bot Centro", email: "bot-padrao-2@domino.local" },
  { openId: "bot-padrao-3", name: "Bot Sul", email: "bot-padrao-3@domino.local" },
  { openId: "bot-padrao-4", name: "Bot Oeste", email: "bot-padrao-4@domino.local" },
];

async function ensureDbBotUser(slotIndex: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const normalizedSlot = ((slotIndex % STANDARD_BOT_SLOTS.length) + STANDARD_BOT_SLOTS.length) % STANDARD_BOT_SLOTS.length;
  const spec = STANDARD_BOT_SLOTS[normalizedSlot];
  const existing = await db.select().from(users).where(eq(users.openId, spec.openId)).limit(1);

  if (existing[0]) {
    await db.update(users).set({ name: spec.name, loginMethod: "bot", isOnline: true, isPlaying: true }).where(eq(users.id, existing[0].id));
    return { ...existing[0], name: spec.name, loginMethod: "bot", isOnline: true, isPlaying: true };
  }

  await db.insert(users).values({
    openId: spec.openId,
    name: spec.name,
    email: spec.email,
    loginMethod: "bot",
    role: "user",
    isOnline: true,
    isPlaying: true,
  });

  const created = await db.select().from(users).where(eq(users.openId, spec.openId)).limit(1);
  const bot = created[0];
  if (!bot) throw new Error("Não foi possível criar bot");
  return bot;
}

async function ensureDbRoomReadyWithBots(roomId: number, maxPlayers: number) {
  const db = await getDb();
  if (!db) return [];

  const seated = await db
    .select()
    .from(roomPlayers)
    .where(eq(roomPlayers.roomId, roomId))
    .orderBy(asc(roomPlayers.seatPosition));
  const occupiedPositions = new Set(seated.map((player) => player.seatPosition).filter((position): position is number => typeof position === "number"));
  const occupiedUserIds = new Set(seated.map((player) => player.userId));

  for (let position = 1; position <= maxPlayers; position += 1) {
    if (occupiedPositions.has(position)) continue;
    const bot = await ensureDbBotUser(position - 2);
    if (occupiedUserIds.has(bot.id)) continue;
    await db.insert(roomPlayers).values({ roomId, userId: bot.id, seatPosition: position });
    occupiedPositions.add(position);
    occupiedUserIds.add(bot.id);
  }

  await db.update(gameRooms).set({ currentPlayers: maxPlayers, status: "playing" }).where(eq(gameRooms.id, roomId));
  return db.select().from(roomPlayers).where(eq(roomPlayers.roomId, roomId)).orderBy(asc(roomPlayers.seatPosition));
}

async function getDbPlayerBotFlags(playerIds: number[]) {
  const db = await getDb();
  if (!db) return new Array(playerIds.length).fill(false);

  const flags: boolean[] = [];
  for (const playerId of playerIds) {
    const rows = await db.select().from(users).where(eq(users.id, playerId)).limit(1);
    flags.push((rows[0]?.loginMethod ?? "") === "bot");
  }
  return flags;
}
function evaluateAnnouncement(actualPoints: number, announcedPoints: number | null) {
  if (actualPoints <= 0) {
    if (announcedPoints !== null && announcedPoints > 0) {
      return {
        awardedPoints: 0,
        call: true,
        message: `Chamada! O jogador anunciou ${announcedPoints} ponto(s), mas a mesa não pontuava.`,
      };
    }
    return {
      awardedPoints: 0,
      call: false,
      message: "Sem pontuação na mesa nesta jogada.",
    };
  }
  if (announcedPoints === null) {
    return {
      awardedPoints: 0,
      call: false,
      message: `A mesa valia ${actualPoints}, mas nada foi anunciado. O ponto foi perdido.`,
    };
  }
  if (announcedPoints === actualPoints) {
    return {
      awardedPoints: actualPoints,
      call: false,
      message: `Pontuação confirmada: ${actualPoints} ponto(s).`,
    };
  }

  if (announcedPoints < actualPoints) {
    return {
      awardedPoints: announcedPoints,
      call: false,
      message: `Você anunciou menos. Registrado ${announcedPoints} ponto(s) de ${actualPoints} disponíveis.`,
    };
  }
  if (announcedPoints > actualPoints) {
    return {
      awardedPoints: actualPoints,
      call: true,
      message: `Chamada! Você anunciou ${announcedPoints} ponto(s), mas a mesa valia ${actualPoints}. Registrado ${actualPoints} ponto(s).`,
    };
  }
  return {
    awardedPoints: 0,
    call: true,
    message: `Chamada! O jogador informou ${announcedPoints}, mas a mesa valia ${actualPoints}. Nenhum ponto foi concedido.`,
  };
}

function generatePointsMessage(
  gameState: LocalGameState,
  playerIndex: number,
  awardedPoints: number,
  isBonus50: boolean,
  tablePoints: number,
  isCarrocaBlow: boolean,
  carrocaBonus: number,
  handBonusPoints: number
): string {
  const playerName = gameState.playerNames[playerIndex];
  const teamIndex = getTeamIndex(playerIndex, gameState.playerIds.length);
  const teammateName = gameState.playerNames.find((_, idx) => getTeamIndex(idx, gameState.playerIds.length) === teamIndex && idx !== playerIndex);
  
  // Mensagem para GALO
  if (isBonus50) {
    return `🐓 ${playerName} fez 50 pontos GALO${tablePoints > 0 ? ` + ${tablePoints} pontos da mesa` : ''}`;
  }
  
  // Mensagem para CARROÇA (batida com carroça)
  if (isCarrocaBlow) {
    const totalBatida = carrocaBonus + handBonusPoints;
    if (teammateName) {
      return `🎯 ${playerName} e ${teammateName} bateram com carroça e fizeram ${totalBatida} pontos (20 carroça + ${handBonusPoints} sobras)`;
    }
    return `🎯 ${playerName} bateu com carroça e fez ${totalBatida} pontos (20 carroça + ${handBonusPoints} sobras)`;
  }
  
  // Mensagem para PASSE (20 pontos para oponentes)
  if (awardedPoints === 0 && !isBonus50) {
    const oppositeTeam = 1 - teamIndex;
    const oppositePlayerIndex = gameState.playerIds.findIndex((_, idx) => getTeamIndex(idx, gameState.playerIds.length) === oppositeTeam);
    const oppositePlayerName = oppositePlayerIndex >= 0 ? gameState.playerNames[oppositePlayerIndex] : "Oponentes";
    return `⏭️ ${playerName} passou. 20 pontos para ${oppositePlayerName} e sua dupla`;
  }
  
  // Mensagem para jogada normal com pontos
  if (awardedPoints > 0) {
    return `✅ ${playerName} fez ${awardedPoints} ponto(s)`;
  }
  
  // Mensagem padrão (sem pontos)
  return `${playerName} jogou uma pedra`;
}

export interface GameState {
  gameId: number;
  roomId: number;
  roomName?: string;
  status: "waiting" | "playing" | "finished" | "abandoned";
  currentPlayerIndex: number;
  roundNumber: number;
  boardState: BoardState;
  playerHands: Domino[][];
  playerScores: number[];
  playerIds: number[];
  playerNames?: string[];
  isBotPlayer: boolean[];
  winnerId: number | null;
  winnerTeam?: number | null;
  teamScores?: number[];
  passCount?: number;
  announcements?: string[];
  pendingGaloPlayerId?: number | null; // jogador que anunciou galo pendente
  lastMove: {
    playerIndex: number;
    playerName?: string;
    domino: Domino;
    side: BoardSide;
    pointsEarned?: number;
    announcedPoints?: number;
    tablePoints?: number;
    awardedPoints: number;
    isBonus50: boolean;
    call?: boolean;
    message?: string;
  } | null;
}

function isLocalGameState(gameState: GameState | LocalGameState): gameState is LocalGameState {
  return Array.isArray((gameState as LocalGameState).playerNames);
}

function getExactTablePoints(boardState: BoardState): number {
  return calculateOpenEndsSum(boardState);
}

function normalizeAnnouncedPoints(announcedPoints: number | undefined | null) {
  if (announcedPoints === undefined || announcedPoints === null) return null;
  if (!Number.isFinite(announcedPoints)) return null;
  return Math.max(0, Math.floor(announcedPoints));
}


function hasExclusiveNextPlay(playerHand: Domino[], otherHands: Domino[][], boardState: BoardState) {
  if (playerHand.length === 0) return false;
  if (!hasValidMoves(playerHand, boardState)) return false;
  return otherHands.every((hand) => !hasValidMoves(hand, boardState));
}

function isBoardEmpty(boardState: BoardState) {
  return !boardState.left &&
    !boardState.right &&
    !boardState.up &&
    !boardState.down &&
    boardState.played.length === 0;
}

function getStartPlayerIndexBySena(hands: Domino[][]) {
  const index = hands.findIndex((hand) => Boolean(findCarrocaSena(hand)));
  return index >= 0 ? index : 0;
}

function getStartPlayerIndexAfterBatida(hands: Domino[][], preferredPlayerIndex: number) {
  return hasAnyCarroca(hands[preferredPlayerIndex])
    ? preferredPlayerIndex
    : (preferredPlayerIndex + 1) % hands.length;
}

function getRepresentativePlayerIndex(gameState: LocalGameState, teamIndex: number, preferredPlayerIndex?: number) {
  if (preferredPlayerIndex !== undefined && getTeamIndex(preferredPlayerIndex, gameState.playerIds.length) === teamIndex) {
    return preferredPlayerIndex;
  }
  return gameState.playerIds.findIndex((_, index) => getTeamIndex(index, gameState.playerIds.length) === teamIndex);
}

function addPointsToTeam(gameState: LocalGameState, teamIndex: number, points: number, preferredPlayerIndex?: number) {
  if (points <= 0) return;
  const representative = getRepresentativePlayerIndex(gameState, teamIndex, preferredPlayerIndex);
  if (representative >= 0) {
    gameState.playerScores[representative] = (gameState.playerScores[representative] ?? 0) + points;
  }
  recomputeTeamScores(gameState);
}

function buildRoundReset(
  gameState: LocalGameState,
  options: {
    mode: "sena" | "winnerAnyCarroca";
    preferredPlayerIndex?: number;
    carryAnnouncement?: string;
  }
) {
  const hands = distributeHands(gameState.playerIds.length);
  const nextRound: LocalGameState = {
    ...gameState,
    status: "playing",
    roundNumber: gameState.roundNumber + 1,
    boardState: { ...createEmptyBoardState(options.mode === "winnerAnyCarroca" ? "anyCarroca" : "sena"), turnStartedAt: Date.now(), turnWarningAt: null } as BoardState,
    playerHands: hands,
    passCount: 0,
    announcements: [...(gameState.announcements ?? [])],
    lastMove: null,
    pendingGaloPlayerId: null, // Reseta GALO para a nova rodada
  };

  let currentPlayerIndex = getStartPlayerIndexBySena(hands);

  if (options.mode === "winnerAnyCarroca" && options.preferredPlayerIndex !== undefined) {
    currentPlayerIndex = getStartPlayerIndexAfterBatida(hands, options.preferredPlayerIndex);
    if (currentPlayerIndex !== options.preferredPlayerIndex) {
      nextRound.announcements.push(
        `${gameState.playerNames[options.preferredPlayerIndex]} não tinha carroça para sair e passou a saída para ${gameState.playerNames[currentPlayerIndex]}.`
      );
    }
  }

  nextRound.currentPlayerIndex = currentPlayerIndex;
  nextRound.announcements.push(
    options.mode === "winnerAnyCarroca"
      ? `Nova rodada ${nextRound.roundNumber}. Saída de ${nextRound.playerNames[currentPlayerIndex]} com uma carroça.`
      : `Nova rodada ${nextRound.roundNumber}. Saída volta para quem tiver a carroça de sena (6-6).`
  );

  if (options.carryAnnouncement) {
    nextRound.announcements.push(options.carryAnnouncement);
  }

  return nextRound;
}

function getRepresentativePlayerIndexForTeam(gameState: GameState, teamIndex: number, preferredPlayerIndex?: number) {
  if (preferredPlayerIndex !== undefined && getTeamIndex(preferredPlayerIndex, gameState.playerIds.length) === teamIndex) {
    return preferredPlayerIndex;
  }
  return gameState.playerIds.findIndex((_, index) => getTeamIndex(index, gameState.playerIds.length) === teamIndex);
}

function getRepresentativePlayerId(gameState: GameState, teamIndex: number, preferredPlayerIndex?: number) {
  const index = getRepresentativePlayerIndexForTeam(gameState, teamIndex, preferredPlayerIndex);
  return index >= 0 ? gameState.playerIds[index] : null;
}

function getOppositeTeamPlayerId(gameState: GameState, playerIndex: number) {
  const team = 1 - getTeamIndex(playerIndex, gameState.playerIds.length);
  return getRepresentativePlayerId(gameState, team);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maybeRunBotTurns(gameState: GameState | LocalGameState): Promise<GameState | LocalGameState> {
  let current: GameState | LocalGameState = gameState;
  let guard = 0;

  while (current.status === "playing" && current.isBotPlayer[current.currentPlayerIndex] && guard < 30) {
    guard += 1;
    await sleep(300 + Math.random() * 700);
    const hand = current.playerHands[current.currentPlayerIndex] ?? [];
    const move = getBotMove(hand, current.boardState);

    if (!move) {
      const passed = await passMove(current, current.currentPlayerIndex);
      current = passed.gameState;
      continue;
    }

    const previewBoard = placeDominoOnBoard(current.boardState, move.domino, move.side);
    const tablePoints = calculateScore(previewBoard);
    const actualGalo = hasExclusiveNextPlay(
      hand.filter((piece, index) => index !== hand.findIndex((candidate) => candidate.left === move.domino.left && candidate.right === move.domino.right)),
      current.playerHands.filter((_, i) => i !== current.currentPlayerIndex),
      previewBoard
    );

    const announcedPoints = actualGalo ? 50 : tablePoints || undefined;
    const botResult = await playMove(current, current.currentPlayerIndex, move.domino, move.side, announcedPoints);
    current = botResult.gameState;
  }

  return current;
}

function withFreshTurnTimer<T extends GameState | LocalGameState>(gameState: T): T {
  return {
    ...gameState,
    boardState: { ...(gameState.boardState as any), turnStartedAt: Date.now(), turnWarningAt: null },
  };
}

export async function replaceTimedOutPlayerWithBot(gameState: GameState | LocalGameState, nowMs = Date.now()) {
  if (gameState.status !== "playing") return gameState;
  if (gameState.isBotPlayer[gameState.currentPlayerIndex]) return gameState;

  const boardState = gameState.boardState as BoardState & { turnStartedAt?: number; turnWarningAt?: number | null };
  if (!boardState.turnStartedAt) {
    const initialized = withFreshTurnTimer(gameState);
    if (isLocalGameState(initialized)) setGameLocal(initialized);
    return initialized;
  }

  const elapsed = nowMs - boardState.turnStartedAt;
  const playerIndex = gameState.currentPlayerIndex;
  if (elapsed < 60_000) {
    if (elapsed >= 45_000 && !boardState.turnWarningAt && isLocalGameState(gameState)) {
      const warned: LocalGameState = {
        ...gameState,
        boardState: { ...boardState, turnWarningAt: nowMs } as BoardState,
        announcements: [
          ...(gameState.announcements ?? []),
          `${gameState.playerNames[playerIndex]} precisa jogar agora ou será substituído por bot em 1 minuto de inatividade.`,
        ],
      };
      setGameLocal(warned);
      return warned;
    }
    return gameState;
  }

  if (isLocalGameState(gameState)) {
    leaveRoomLocal(gameState.roomId, gameState.playerIds[playerIndex]);
    const replaced = getGameByRoomLocal(gameState.roomId) ?? gameState;
    const updated: LocalGameState = {
      ...(replaced as LocalGameState),
      boardState: { ...(replaced.boardState as any), turnStartedAt: nowMs, turnWarningAt: null },
      announcements: [
        ...((replaced as LocalGameState).announcements ?? []),
        `${gameState.playerNames[playerIndex]} foi substituído por bot por inatividade de 1 minuto.`,
      ],
    };
    setGameLocal(updated);
    return maybeRunBotTurns(updated);
  }

  const db = await getDb();
  if (db) {
    const players = await db.select().from(gamePlayers).where(eq(gamePlayers.gameId, gameState.gameId)).orderBy(gamePlayers.playerIndex);
    const current = players.find((player) => player.playerIndex === playerIndex);
    if (!current) return gameState;
    const bot = await ensureDbBotUser(playerIndex);
    await db.update(gamePlayers).set({ userId: bot.id, isBot: true }).where(eq(gamePlayers.id, current.id));
    await db.update(roomPlayers).set({ userId: bot.id }).where(and(eq(roomPlayers.roomId, gameState.roomId), eq(roomPlayers.seatPosition, playerIndex + 1)));
    await db.update(users).set({ isPlaying: false }).where(eq(users.id, current.userId));
    await db.update(games).set({ boardState: { ...boardState, turnStartedAt: nowMs, turnWarningAt: null } }).where(eq(games.id, gameState.gameId));
    const refreshed = await getGameState(gameState.gameId);
    return refreshed ? maybeRunBotTurns(refreshed) : gameState;
  }

  return gameState;
}

export async function createGame(roomId: number, playerIds: number[], isBotPlayer: boolean[] = []): Promise<GameState | null> {
  const db = await getDb();

  if (playerIds.length !== 4) return null;

  if (!db) {
    let room = getRoomByIdLocal(roomId);
    if (!room) {
      room = createRoomLocal({
        name: `Sala Local ${roomId}`,
        isPrivate: false,
        allowBot: true,
        createdBy: playerIds[0],
      });
      for (const participantId of playerIds.slice(1)) {
        joinRoomLocal(room.id, participantId);
      }
    }

    const hands = distributeHands(4);
    const boardState: BoardState = { ...createEmptyBoardState(), turnStartedAt: Date.now(), turnWarningAt: null } as BoardState;
    const startPlayerIndex = getStartPlayerIndexBySena(hands);
    const playerNames = playerIds.map((id) => getLocalUserById(id)?.name ?? `Jogador ${id}`);
    const gameId = createGameLocal(room.id, { playerIds, status: "waiting" }).gameId;

    const localGame: LocalGameState = {
      gameId,
      roomId: room.id,
      roomName: room.name,
      status: "waiting",
      currentPlayerIndex: startPlayerIndex,
      roundNumber: 1,
      boardState,
      playerHands: hands,
      playerScores: new Array(4).fill(0),
      playerIds,
      playerNames,
      isBotPlayer: isBotPlayer.length === 4 ? isBotPlayer : new Array(4).fill(false),
      winnerId: null,
      winnerTeam: null,
      teamScores: [0, 0],
      passCount: 0,
      announcements: [
        `Primeira saída: ${playerNames[startPlayerIndex]} com a carroça de sena (6-6).`,
        `Pontuação apenas em múltiplos de 5 e somente com anúncio correto.`,
      ],
      lastMove: null,
    };

    setGameLocal(localGame);
    return localGame;
  }

  const hands = distributeHands(4);
  const boardState: BoardState = { ...createEmptyBoardState(), turnStartedAt: Date.now(), turnWarningAt: null } as BoardState;
  const startPlayerIndex = getStartPlayerIndexBySena(hands);

  const existingBeforeInsert = await db.select().from(games).where(eq(games.roomId, roomId)).orderBy(desc(games.id)).limit(1);
  if (existingBeforeInsert[0]) {
    return getGameState(existingBeforeInsert[0].id);
  }

  const insertResult = await db.insert(games).values({
    roomId,
    status: "playing",
    currentPlayerIndex: startPlayerIndex,
    roundNumber: 1,
    boardState,
  });
  // A sala deixa de ser listada como disponível assim que a partida inicia.
  await db.update(gameRooms).set({ status: "playing" }).where(eq(gameRooms.id, roomId));

  const insertedId = Array.isArray(insertResult) ? Number((insertResult[0] as any)?.insertId) : NaN;
  const gameList = Number.isFinite(insertedId) && insertedId > 0
    ? await db.select().from(games).where(eq(games.id, insertedId)).limit(1)
    : await db.select().from(games).where(eq(games.roomId, roomId)).orderBy(desc(games.id)).limit(1);
  const gameId = gameList[0]?.id;
  if (!gameId) return null;

  for (let i = 0; i < 4; i++) {
    await db.insert(gamePlayers).values({
      gameId,
      userId: playerIds[i],
      playerIndex: i,
      hand: hands[i],
      score: 0,
      isBot: isBotPlayer[i] || false,
    });
  }

  return {
    gameId,
    roomId,
    status: "playing",
    currentPlayerIndex: startPlayerIndex,
    roundNumber: 1,
    boardState,
    playerHands: hands,
    playerScores: new Array(4).fill(0),
    playerIds,
    isBotPlayer: isBotPlayer.length === 4 ? isBotPlayer : new Array(4).fill(false),
    winnerId: null,
    winnerTeam: null,
    teamScores: [0, 0],
    passCount: 0,
    announcements: [],
    lastMove: null,
  };
}

export async function createOrStartRoomGame(roomId: number, fillBots = false) {
  const existingStart = roomGameStartLocks.get(roomId);
  if (existingStart) return existingStart;

  const startPromise = createOrStartRoomGameLocked(roomId, fillBots).finally(() => {
    roomGameStartLocks.delete(roomId);
  });
  roomGameStartLocks.set(roomId, startPromise);
  return startPromise;
}

async function createOrStartRoomGameLocked(roomId: number, fillBots = false) {
  const db = await getDb();
  if (db) {
    const existingGame = await db.select().from(games).where(eq(games.roomId, roomId)).orderBy(desc(games.id)).limit(1);
    if (existingGame[0]) return getGameState(existingGame[0].id);

    const room = await db.select().from(gameRooms).where(eq(gameRooms.id, roomId)).limit(1);
    const currentRoom = room[0];
    if (!currentRoom) return null;
    if (fillBots && !currentRoom.isPrivate) return null;
    if (fillBots && !currentRoom.allowBot) return null;
    if (!fillBots && currentRoom.currentPlayers < currentRoom.maxPlayers) return null;

    const seatedPlayers = fillBots
      ? await ensureDbRoomReadyWithBots(roomId, currentRoom.maxPlayers)
      : await db
          .select()
          .from(roomPlayers)
          .where(eq(roomPlayers.roomId, roomId))
          .orderBy(asc(roomPlayers.seatPosition));
    const playerIds = seatedPlayers.map((player) => player.userId).slice(0, 4);
    if (playerIds.length !== 4) return null;
    const isBotPlayer = await getDbPlayerBotFlags(playerIds);
    const existingBeforeCreate = await db.select().from(games).where(eq(games.roomId, roomId)).orderBy(desc(games.id)).limit(1);
    if (existingBeforeCreate[0]) return getGameState(existingBeforeCreate[0].id);
    return createGame(roomId, playerIds, isBotPlayer);
  }

  const room = getRoomByIdLocal(roomId);
  if (!room) return null;
  if (fillBots && !room.isPrivate) return null;
  if (fillBots && !room.allowBot) return null;
  if (fillBots) ensureRoomReadyWithBots(roomId);
  if (!room.allowBot && room.currentPlayers < room.maxPlayers) return null;
  const existing = getGameByRoomLocal(roomId);
  if (existing) return maybeRunBotTurns(existing);
  const created = createGameLocal(roomId, { status: "playing" });
  return maybeRunBotTurns(created);
}

export async function getRoomGameState(roomId: number) {
  const db = await getDb();
  if (!db) {
    const localGame = getGameByRoomLocal(roomId);
    if (!localGame) return null;
    const checked = await replaceTimedOutPlayerWithBot(localGame);
    return maybeRunBotTurns(checked as LocalGameState);
  }

  const existingGame = await db.select().from(games).where(eq(games.roomId, roomId)).orderBy(desc(games.id)).limit(1);
  if (!existingGame[0]) return null;
  return getGameState(existingGame[0].id);
}

export async function finishRoomMatch(roomId: number, winnerPlayerIndex: number) {
  const db = await getDb();
  if (!db) {
    recordRoomMatchResultLocal(roomId, winnerPlayerIndex);
    return { success: true };
  }

  const players = await db
    .select()
    .from(roomPlayers)
    .where(eq(roomPlayers.roomId, roomId))
    .orderBy(roomPlayers.id);

  if (players.length === 0) {
    return { success: false };
  }

  const winnerTeam = getTeamIndex(winnerPlayerIndex, players.length);

  for (let playerIndex = 0; playerIndex < players.length; playerIndex += 1) {
    const player = players[playerIndex];
    const userRows = await db.select().from(users).where(eq(users.id, player.userId)).limit(1);
    const playerUser = userRows[0];
    if ((playerUser?.loginMethod ?? "") === "bot") {
      await db.update(users).set({ isPlaying: false }).where(eq(users.id, player.userId));
      continue;
    }
    const currentStats = await db.select().from(playerStats).where(eq(playerStats.userId, player.userId)).limit(1);
    const existing = currentStats[0];
    const isWinner = getTeamIndex(playerIndex, players.length) === winnerTeam;
    const totalGames = (existing?.totalGames ?? 0) + 1;
    const totalWins = (existing?.totalWins ?? 0) + (isWinner ? 1 : 0);
    const totalPoints = Math.max(0, (existing?.totalPoints ?? 0) + (isWinner ? 1 : -1));
    const level = calculateLevel(totalGames, totalWins);
    const winRate = calculateWinRate(totalWins, totalGames);

    if (existing) {
      await db.update(playerStats).set({ totalGames, totalWins, totalPoints, level, winRate }).where(eq(playerStats.userId, player.userId));
    } else {
      await db.insert(playerStats).values({ userId: player.userId, totalGames, totalWins, totalPoints, level, winRate });
    }

    await db.update(users).set({ isPlaying: false }).where(eq(users.id, player.userId));
  }

  await db.update(gameRooms).set({ status: "finished" }).where(eq(gameRooms.id, roomId));
  return { success: true };
}

export async function startGame(gameState: GameState): Promise<GameState> {
  const db = await getDb();
  if (!db && isLocalGameState(gameState)) {
    const updated = withFreshTurnTimer({ ...gameState, status: "playing" as const });
    setGameLocal(updated);
    return maybeRunBotTurns(updated);
  }

  const startPlayerIndex = getStartPlayerIndexBySena(gameState.playerHands);
  const updatedState: GameState = withFreshTurnTimer({ ...gameState, status: "playing", currentPlayerIndex: startPlayerIndex });
  if (db) {
    await db.update(games).set({ status: "playing", currentPlayerIndex: startPlayerIndex, boardState: updatedState.boardState }).where(eq(games.id, gameState.gameId));
  }
  return updatedState;
}

export async function playMove(
  gameState: GameState,
  playerIndex: number,
  domino: Domino,
  side: BoardSide,
  announcedPoints?: number | null,
  action: "normal" | "galo" = "normal"
): Promise<{ gameState: GameState; isValid: boolean; error?: string }> {
  if (playerIndex !== gameState.currentPlayerIndex) {
    return { gameState, isValid: false, error: "Não é sua vez" };
  }

  const hand = gameState.playerHands[playerIndex];
  if (!hand) {
    return { gameState, isValid: false, error: "Mão do jogador não encontrada" };
  }

  const dominoIndex = hand.findIndex((d) => d.left === domino.left && d.right === domino.right);
  if (dominoIndex === -1) {
    return { gameState, isValid: false, error: "Peça não está na sua mão" };
  }

  if (!canPlayDomino(domino, gameState.boardState, side)) {
    return { gameState, isValid: false, error: "Jogada inválida para esta ponta" };
  }

  const newHand = [...hand];
  newHand.splice(dominoIndex, 1);

  const newBoardState = placeDominoOnBoard(gameState.boardState, domino, side);
  const scoring = getTableScoringSnapshot(newBoardState);
  const tablePoints = scoring.score;
  const normalizedAnnouncement = normalizeAnnouncedPoints(announcedPoints);
  const newPlayerHands = [...gameState.playerHands];
  newPlayerHands[playerIndex] = newHand;
  const otherHands = newPlayerHands.filter((_, i) => i !== playerIndex);
  const actualGalo = hasExclusiveNextPlay(newHand, otherHands, newBoardState);
  
  // Se o jogador anunciou GALO anteriormente, use-o automaticamente
  let galoAttempt = action === "galo" || gameState.pendingGaloPlayerId === playerIndex;
  
  // Se houver GALO pendente, adicione os pontos de mesa também se ACTION não especificar
  if (gameState.pendingGaloPlayerId === playerIndex && action !== "galo") {
    // Usuario anunciou GALO mas está tentando jogar sem action="galo"
    galoAttempt = true;
  }

  let awardedPoints = 0;
  let call = false;
  let message = "Sem pontuação na mesa nesta jogada.";

  if (galoAttempt && actualGalo) {
    // Se o GALO foi bem-sucedido, adiciona 50 pontos + pontos da mesa
    awardedPoints = 50 + (tablePoints > 0 ? tablePoints : 0);
    message = `GALO confirmado! 50 ponto(s) de bonus${tablePoints > 0 ? ` + ${tablePoints} da mesa` : ''}.`;
  } else if (galoAttempt && !actualGalo) {
    awardedPoints = 0;
    call = true;
    message = "GALO não confirmado. Sem bônus de 50 pontos; a jogada segue normalmente.";
  } else {
    const announcementResult = evaluateAnnouncement(tablePoints, normalizedAnnouncement);
    awardedPoints = announcementResult.awardedPoints;
    call = announcementResult.call;
    message = announcementResult.message;
  }

  const newScores = [...gameState.playerScores];
  newScores[playerIndex] += awardedPoints;

  // Mensagem de pontos para o chat (preparar antes de persistir)
  let pointsMessage: string;
  if (isLocalGameState(gameState)) {
    pointsMessage = generatePointsMessage(gameState as LocalGameState, playerIndex, awardedPoints, galoAttempt && actualGalo, tablePoints, false, 0, 0);
    if (galoAttempt && !actualGalo) {
      pointsMessage = `⚠️ ${gameState.playerNames[playerIndex]} anunciou GALO, mas a jogada não confirmou. Sem bônus de 50 pontos.`;
    }
  } else {
    const playerName = `Jogador ${gameState.playerIds?.[playerIndex] ?? playerIndex}`;
    if (galoAttempt && actualGalo) {
      pointsMessage = `🐓 ${playerName} fez 50 pontos GALO${tablePoints > 0 ? ` + ${tablePoints} pontos da mesa` : ''}`;
    } else if (galoAttempt && !actualGalo) {
      pointsMessage = `⚠️ ${playerName} anunciou GALO, mas a jogada não confirmou. Sem bônus de 50 pontos.`;
    } else if (awardedPoints > 0) {
      pointsMessage = `✅ ${playerName} fez ${awardedPoints} ponto(s)`;
    } else {
      pointsMessage = `${playerName} jogou uma pedra`;
    }
  }

  const nextPlayerIndex = galoAttempt && actualGalo
    ? playerIndex
    : (playerIndex + 1) % gameState.playerIds.length;

  const updatedState: GameState = {
    ...gameState,
    boardState: { ...newBoardState, turnStartedAt: Date.now(), turnWarningAt: null } as BoardState,
    playerHands: newPlayerHands,
    playerScores: newScores,
    currentPlayerIndex: nextPlayerIndex,
    passCount: 0,
    pendingGaloPlayerId: null, // Reseta GALO após a jogada
    lastMove: {
      playerIndex,
      playerName: (gameState as LocalGameState).playerNames?.[playerIndex],
      domino,
      side,
      pointsEarned: tablePoints,
      announcedPoints: normalizedAnnouncement ?? undefined,
      tablePoints,
      awardedPoints,
      isBonus50: galoAttempt && actualGalo,
      call,
      message,
    },
  };

  if (isLocalGameState(updatedState)) {
    updatedState.announcements = [
      ...(updatedState.announcements ?? []),
      `${updatedState.playerNames[playerIndex]} jogou ${domino.left}-${domino.right} em ${
        side === "left" ? "esquerda" : side === "right" ? "direita" : side === "up" ? "cima" : "baixo"
      }. ${updatedState.lastMove?.message}`,
    ];

    recomputeTeamScores(updatedState);
    const teamIndex = getTeamIndex(playerIndex, updatedState.playerIds.length);

    if (newHand.length === 0) {
      const otherTeamIndex = 1 - teamIndex;
      let otherTeamHandPoints = 0;

      updatedState.playerHands.forEach((playerHand, index) => {
        if (getTeamIndex(index, updatedState.playerIds.length) === otherTeamIndex) {
          otherTeamHandPoints += playerHand.reduce((sum, piece) => sum + piece.left + piece.right, 0);
        }
      });


      const lastPlayed = domino;
      let carrocaBonus = 0;
      if (lastPlayed.left === lastPlayed.right) {
        carrocaBonus = 20;
        addPointsToTeam(updatedState, teamIndex, carrocaBonus, playerIndex);
        updatedState.announcements.push(
          `${updatedState.playerNames[playerIndex]} bateu com uma carroça! A dupla ganha 20 pontos extras.`
        );
      }

      const handBonus = Math.floor(otherTeamHandPoints / 5) * 5;
      addPointsToTeam(updatedState, teamIndex, handBonus, playerIndex);
      updatedState.announcements.push(
        `${updatedState.playerNames[playerIndex]} bateu! A dupla ganha ${handBonus} ponto(s) das mãos adversárias.`
      );

      if ((updatedState.teamScores?.[teamIndex] ?? 0) >= 200) {
        updatedState.status = "finished";
        updatedState.winnerId = updatedState.playerIds[playerIndex];
        updatedState.winnerTeam = teamIndex;
        updatedState.announcements.push(`Fim do jogo! A dupla ${teamIndex + 1} alcançou ${updatedState.teamScores?.[teamIndex] ?? 0} pontos.`);
        recordFinishedGame(updatedState);
        setGameLocal(updatedState);
        return { gameState: updatedState, isValid: true };
      }

      const nextRound = buildRoundReset(updatedState, {
        mode: "winnerAnyCarroca",
        preferredPlayerIndex: playerIndex,
        carryAnnouncement: `Rodada encerrada. ${updatedState.playerNames[playerIndex]} bateu e tenta sair na próxima rodada com uma carroça.`,
      });

      setGameLocal(nextRound);
      
      // Adicionar mensagem de batida ao chat
      const batidaMessage = generatePointsMessage(
        updatedState,
        playerIndex,
        carrocaBonus + handBonus,
        false,
        0,
        carrocaBonus > 0,
        carrocaBonus,
        handBonus
      );
      appendMessage(updatedState.gameId, -1, batidaMessage, false);
      
      return { gameState: await maybeRunBotTurns(nextRound), isValid: true };
    }

    setGameLocal(updatedState);

    // Adicionar mensagem de pontos ao chat local
    appendMessage(updatedState.gameId, -1, pointsMessage, false);

    return { gameState: await maybeRunBotTurns(updatedState), isValid: true };
  }

  const db = await getDb();
  if (db) {
    await db.update(games).set({
      boardState: updatedState.boardState,
      currentPlayerIndex: nextPlayerIndex,
      status: "playing",
    }).where(eq(games.id, gameState.gameId));

    await db.update(gamePlayers).set({ hand: newHand, score: newScores[playerIndex] }).where(
      and(eq(gamePlayers.gameId, gameState.gameId), eq(gamePlayers.playerIndex, playerIndex))
    );

    await db.insert(moves).values({
      gameId: gameState.gameId,
      userId: gameState.playerIds[playerIndex],
      moveNumber: gameState.boardState.played.length + 1,
      domino,
      side,
      pointsEarned: awardedPoints,
      isBonus50: galoAttempt && actualGalo,
    });
    // Registrar mensagem de pontos no chat (DB)
    try {
      await db.insert(chatMessages).values({
        gameId: gameState.gameId,
        userId: 0,
        message: pointsMessage,
        isOffensive: false,
      });
    } catch (e) {
      console.warn('Falha ao registrar mensagem de pontos no chat (DB):', e);
    }
  }

  return { gameState: updatedState, isValid: true };
}

export async function passMove(
  gameState: GameState,
  playerIndex: number
): Promise<{ gameState: GameState; isValid: boolean; error?: string }> {
  if (playerIndex !== gameState.currentPlayerIndex) {
    return { gameState, isValid: false, error: "Não é sua vez" };
  }

  const hand = gameState.playerHands[playerIndex];
  if (!hand) {
    return { gameState, isValid: false, error: "Mão do jogador não encontrada" };
  }

  const hasPlayableTile = hasValidMoves(hand, gameState.boardState);

  const nextPlayerIndex = (playerIndex + 1) % gameState.playerIds.length;
  const updatedState: LocalGameState = {
    ...(gameState as LocalGameState),
    currentPlayerIndex: nextPlayerIndex,
    boardState: { ...(gameState.boardState as any), turnStartedAt: Date.now(), turnWarningAt: null },
    pendingGaloPlayerId: null, // Reseta GALO se o jogador passar
  };

  if (isLocalGameState(updatedState)) {
    const nextPassCount = (updatedState.passCount ?? 0) + 1;
    updatedState.passCount = nextPassCount;
    const isOpeningPass = isBoardEmpty(updatedState.boardState);

    let announcement = hasPlayableTile
      ? `${updatedState.playerNames[playerIndex]} clicou em PASSE mesmo tendo pedra jogável.`
      : `${updatedState.playerNames[playerIndex]} clicou em PASSE.`;
    if (isOpeningPass) {
      announcement += ` Passe de saída, sem bonificação.`;
    } else if (nextPassCount === 1) {
      const oppositeTeam = 1 - getTeamIndex(playerIndex, updatedState.playerIds.length);
      addPointsToTeam(updatedState, oppositeTeam, 20);
      announcement += ` A dupla adversária recebeu 20 pontos pelo primeiro passe da sequência.`;
    } else {
      announcement += ` Passe em sequência, sem nova bonificação.`;
    }

    updatedState.announcements = [...(updatedState.announcements ?? []), announcement];

    // Preparar mensagem de passe para o chat
    const passPointsMessage = generatePointsMessage(updatedState, playerIndex, 0, false, 0, false, 0, 0);

    if (nextPassCount >= updatedState.playerIds.length) {
      const teamSums = [0, 0];
      updatedState.playerHands.forEach((playerHand, index) => {
        const teamIndex = getTeamIndex(index, updatedState.playerIds.length);
        teamSums[teamIndex] += playerHand.reduce((sum, piece) => sum + piece.left + piece.right, 0);
      });

      const winningTeam = teamSums[0] <= teamSums[1] ? 0 : 1;
      const losingTeam = 1 - winningTeam;
      const awardedPoints = Math.floor(teamSums[losingTeam] / 5) * 5;
      addPointsToTeam(updatedState, winningTeam, awardedPoints);
      updatedState.announcements.push(
        `Jogo fechado! A dupla ${winningTeam + 1} vence a tranca e recebe ${awardedPoints} ponto(s).`
      );

      if ((updatedState.teamScores?.[winningTeam] ?? 0) >= 200) {
        updatedState.status = "finished";
        updatedState.winnerTeam = winningTeam;
        const winnerIndex = getRepresentativePlayerIndex(updatedState, winningTeam);
        updatedState.winnerId = winnerIndex >= 0 ? updatedState.playerIds[winnerIndex] : null;
        recordFinishedGame(updatedState);
        setGameLocal(updatedState);
        return { gameState: updatedState, isValid: true };
      }

      const nextRound = buildRoundReset(updatedState, {
        mode: "sena",
        carryAnnouncement: "Próxima rodada inicia novamente por quem tiver a carroça de sena (6-6).",
      });
      setGameLocal(nextRound);
      // Registrar mensagem de passe/fechamento no chat local
      appendMessage(nextRound.gameId, -1, passPointsMessage, false);
      return { gameState: await maybeRunBotTurns(nextRound), isValid: true };
    }

      setGameLocal(updatedState);
      // Registrar mensagem de passe no chat local
      appendMessage(updatedState.gameId, -1, passPointsMessage, false);
    return { gameState: await maybeRunBotTurns(updatedState), isValid: true };
  }

  const nextPassCount = (gameState.passCount ?? 0) + 1;
  const isOpeningPass = isBoardEmpty(gameState.boardState);
  const nextScores = [...gameState.playerScores];
  if (!isOpeningPass && nextPassCount === 1) {
    const oppositeTeam = 1 - getTeamIndex(playerIndex, gameState.playerIds.length);
    const representativeIndex = getRepresentativePlayerIndexForTeam(gameState, oppositeTeam);
    if (representativeIndex >= 0) {
      nextScores[representativeIndex] += 20;
    }
  }

  const updatedDbState: GameState = {
    ...gameState,
    currentPlayerIndex: nextPlayerIndex,
    boardState: { ...(gameState.boardState as any), turnStartedAt: Date.now(), turnWarningAt: null } as BoardState,
    passCount: nextPassCount,
    playerScores: nextScores,
  };

  const db = await getDb();
  if (db) {
      const boardStateWithPassCount = { ...gameState.boardState, passCount: nextPassCount, turnStartedAt: Date.now(), turnWarningAt: null };
    await db.update(games).set({ currentPlayerIndex: nextPlayerIndex, boardState: boardStateWithPassCount }).where(eq(games.id, gameState.gameId));
    if (!isOpeningPass && nextPassCount === 1) {
      const oppositeTeam = 1 - getTeamIndex(playerIndex, gameState.playerIds.length);
      const representativeIndex = getRepresentativePlayerIndexForTeam(gameState, oppositeTeam);
      if (representativeIndex >= 0) {
        await db.update(gamePlayers).set({ score: nextScores[representativeIndex] }).where(
          and(eq(gamePlayers.gameId, gameState.gameId), eq(gamePlayers.playerIndex, representativeIndex))
        );
      }
    }
    // Registrar mensagem de passe no chat (DB)
    try {
      const passMsg = generatePointsMessage((gameState as LocalGameState) as LocalGameState, playerIndex, 0, false, 0, false, 0, 0);
      await db.insert(chatMessages).values({ gameId: gameState.gameId, userId: 0, message: passMsg, isOffensive: false });
    } catch (e) {
      console.warn('Falha ao registrar mensagem de passe no chat (DB):', e);
    }
  }

  return { gameState: updatedDbState, isValid: true };
}

export async function getGameState(gameId: number): Promise<GameState | null> {
  const db = await getDb();
  if (!db) {
    const localGame = getGameByIdLocal(gameId);
    if (!localGame) return null;
    const checked = await replaceTimedOutPlayerWithBot(localGame);
    return maybeRunBotTurns(checked as LocalGameState);
  }

  const gameList = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  const game = gameList[0];
  if (!game) return null;

  const playerList = await db.select().from(gamePlayers).where(eq(gamePlayers.gameId, gameId)).orderBy(gamePlayers.playerIndex);
  if (playerList.length === 0) return null;

  const persistedBoardState: BoardState & { passCount?: number } =
    (game.boardState as (BoardState & { passCount?: number }) | null) ?? createEmptyBoardState();
  const boardState: BoardState = persistedBoardState;

  const playerScores = playerList.map((p) => p.score);
  const playerIds = playerList.map((p) => p.userId);
  const playerNames: string[] = [];
  for (const playerId of playerIds) {
    const userRows = await db.select().from(users).where(eq(users.id, playerId)).limit(1);
    playerNames.push(userRows[0]?.name ?? `Jogador ${playerId}`);
  }
  const teamScores = playerScores.reduce<number[]>((scores, score, index) => {
    const team = getTeamIndex(index, playerIds.length);
    scores[team] = (scores[team] ?? 0) + score;
    return scores;
  }, [0, 0]);

  const state: GameState = {
    gameId,
    roomId: game.roomId,
    status: game.status as any,
    currentPlayerIndex: game.currentPlayerIndex,
    roundNumber: game.roundNumber,
    boardState,
    playerHands: playerList.map((p) => (p.hand as Domino[]) ?? []),
    playerScores,
    playerIds,
    playerNames,
    isBotPlayer: playerList.map((p) => p.isBot),
    winnerId: game.winnerId,
    winnerTeam: null,
    teamScores,
    passCount: persistedBoardState.passCount ?? 0,
    announcements: [],
    lastMove: null,
    pendingGaloPlayerId: null,
  };
  const checked = (await replaceTimedOutPlayerWithBot(state)) as GameState;
  return maybeRunBotTurns(checked);
}

/**
 * Permite ao jogador anunciar GALO como intenção
 * O GALO será validado quando ele jogar a próxima pedra
 */
export async function announceGalo(
  gameState: GameState,
  playerIndex: number
): Promise<{ gameState: GameState; isValid: boolean; error?: string }> {
  if (playerIndex !== gameState.currentPlayerIndex) {
    return { gameState, isValid: false, error: "Não é sua vez" };
  }

  const hand = gameState.playerHands[playerIndex];
  if (!hand || hand.length === 0) {
    return { gameState, isValid: false, error: "Você não pode anunciar GALO com a mão vazia" };
  }

  const updated = {
    ...gameState,
    pendingGaloPlayerId: playerIndex,
  };

  if (isLocalGameState(updated)) {
    updated.announcements = [
      ...(updated.announcements ?? []),
      `${updated.playerNames[playerIndex]} anunciou GALO! Todos esperam pela próxima jogada.`,
    ];
    setGameLocal(updated);
  }

  return { gameState: updated, isValid: true };
}
