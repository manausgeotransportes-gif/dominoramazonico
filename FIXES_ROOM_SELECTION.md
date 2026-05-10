# Correção: Seleção de Posições em Salas

## Problema Identificado
Usuários offline (como "testee") continuavam aparecendo nas posições das salas mesmo sem estar online, criando "posições presas" que impediam outros jogadores de usar aqueles lugares.

## Soluções Implementadas

### 1. **Backend - Server (roomsRouter.ts)**

#### Função: `cleanupOfflinePlayersFromRoom()`
- Remove automaticamente usuários offline (não-bot) que ocupam posições
- Atualiza a contagem de jogadores na sala
- Fecha salas privadas vazias
- Chamada antes de processar `joinRoom`
- Chamada ao retornar `getRoomPlayers`

#### Validação em `joinRoom`
```typescript
// Validar que o usuário está online
const currentUser = await drizzle.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
if (!currentUser[0]?.isOnline) {
  throw new TRPCError({ code: "UNAUTHORIZED", message: "Usuário deve estar online para entrar em uma sala" });
}

// Limpar posições offline antes de processar
await cleanupOfflinePlayersFromRoom(roomId);
```

#### Atualização de `getRoomPlayers`
- Agora retorna informação `isBot` para identificar bots
- Limpa automaticamente offline players antes de retornar
- Dados enriquecidos com status online/offline
- Ordenação por seatPosition

#### Novos Procedimentos
1. **`cleanupRoom`** - Procedimento manual para limpar uma sala (apenas criador/admin)
2. **`validateRoomIntegrity`** - Valida integridade da sala e lista problemas

### 2. **Backend - Local Store (localStore.ts)**

#### Função: `cleanupOfflinePlayersLocal()`
- Mesmo comportamento da versão DB
- Remove usuários offline (não-bot) de posições
- Atualiza contagem local
- Chamada no `joinRoomLocal`

#### Atualização de `getRoomPlayersLocal`
- Agora inclui `email`, `loginMethod`, `isBot`
- Compatível com dados do BD

### 3. **Frontend - Cliente (Lobby.tsx)**

#### RoomPanel - Lógica de Slots
```typescript
// Apenas considerar como preenchido se o jogador está online
const filled = Boolean(player) && player?.isOnline;
```

#### Cálculo de `isFull`
```typescript
// Contar apenas jogadores online
const onlinePlayersCount = slots.filter((player: any) => Boolean(player) && player?.isOnline).length;
const isFull = onlinePlayersCount >= (room.maxPlayers ?? 4);
```

#### Validação de Posição Bloqueada
```typescript
// Slot bloqueado se está preenchido por outro usuário online
const selectedSlotBlocked = Boolean(selectedSlot && selectedSlot?.isOnline && selectedSlot.userId !== currentUserId);
```

## Fluxo de Limpeza

### Quando Ocorre

1. **Ao entrar em uma sala** (`joinRoom`)
   - Valida se usuário está online
   - Limpa posições offline da sala
   - Processa a entrada

2. **Ao listar jogadores** (`getRoomPlayers`)
   - Limpa posições offline automaticamente
   - Retorna apenas dados válidos

3. **No cliente** (refetch a cada 3 segundos)
   - Recalcula posições apenas para usuários online
   - Habilita/desabilita slots baseado em status real

## Casos de Uso Corrigidos

### Antes
- ❌ "testee" offline aparecia na posição 2
- ❌ Posição ficava bloqueada para outros
- ❌ Novo jogador não conseguia ocupar posição vazia
- ❌ Sala contava incorreto (4 ocupados mas apenas 2 online)

### Depois
- ✅ "testee" offline é removido automaticamente
- ✅ Posição fica disponível para outros
- ✅ Novo jogador pode entrar na posição
- ✅ Contagem se sincroniza com online reais

## Queries do Banco de Dados

### SQL para Debug
```sql
-- Ver jogadores offline em salas
SELECT 
  rp.roomId, 
  rp.seatPosition, 
  u.name, 
  u.isOnline, 
  u.loginMethod,
  r.currentPlayers, 
  r.maxPlayers
FROM room_players rp
JOIN users u ON rp.userId = u.id
JOIN rooms r ON rp.roomId = r.id
WHERE u.isOnline = false AND u.loginMethod != 'bot'
ORDER BY rp.roomId, rp.seatPosition;
```

## Nova API

### Limpeza Manual de Sala
```typescript
trpc.rooms.cleanupRoom.mutate(roomId); // Requer ser criador ou admin
```

### Validação de Integridade
```typescript
const validation = await trpc.rooms.validateRoomIntegrity.query(roomId);
// Retorna:
// {
//   isValid: boolean,
//   issues: string[],
//   offlineCount: number,
//   totalPlayers: number,
//   roomStatus: string
// }
```

## Melhorias Futuras

1. **Webhook de Status** - Quando usuário sair, marcar isOnline = false
2. **Heartbeat** - ping periódico para validar usuário ainda está ativo
3. **Game Lock** - Ao iniciar partida, marcar posições como bloqueadas
4. **Analytics** - Log de limpeza para debug

## Testing

Para testar:
1. Criar sala privada com 2+ jogadores
2. Parar a conexão de um jogador (fechar browser/alt+F4)
3. Observar que posição é liberada após alguns segundos
4. Outro jogador consegue entrar na posição

**Nota**: O sistema refetch a cada 3 segundos, então máximo 3s de delay
