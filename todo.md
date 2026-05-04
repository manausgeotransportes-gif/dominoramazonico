# Dominó Amazônico - TODO

## Fase 1: Arquitetura e Banco de Dados
- [x] Definir schema do banco de dados (users, rooms, games, moves, chat, rankings)
- [x] Criar migrações Drizzle para todas as tabelas
- [x] Documentar modelo de dados

## Fase 2: Autenticação e Backend Base
- [x] Implementar login via Google OAuth (já integrado no template)
- [ ] Implementar cadastro por e-mail com código de verificação
- [x] Criar endpoints de autenticação
- [x] Implementar tRPC procedures para auth
- [x] Criar helpers de banco de dados para operações CRUD

## Fase 3: Sistema de Salas
- [x] Criar modelo de dados para salas (Room)
- [x] Implementar API: criar sala
- [x] Implementar API: listar salas abertas
- [x] Implementar API: entrar em sala
- [x] Implementar API: sair de sala
- [x] Implementar API: buscar salas privadas por nome
- [ ] Implementar sistema de convites para amigos
- [ ] Implementar status online/jogando de usuários

## Fase 4: Motor de Jogo - Lógica Base
- [x] Criar modelo de dados para partidas (Game)
- [x] Implementar distribuição aleatória de 7 peças
- [x] Implementar validação de jogadas (peça válida, ponta correta)
- [x] Implementar regra: primeira jogada com carroça de sena (6-6)
- [ ] Implementar sistema de turnos
- [x] Implementar cálculo de pontuação (múltiplos de 5)
- [ ] Implementar detecção de jogo fechado (bloqueado)
- [x] Implementar bônus de 50 pontos (fechar sozinho)
- [ ] Implementar condição de vitória (200+ pontos)

## Fase 5: WebSocket e Tempo Real
- [ ] Configurar Socket.io para comunicação em tempo real
- [ ] Implementar sincronização de estado do jogo
- [ ] Implementar broadcast de movimentos para todos os jogadores
- [ ] Implementar sistema de notificações em tempo real

## Fase 6: Bot de IA
- [x] Criar modelo de dados para bot
- [x] Implementar algoritmo de decisão do bot (seguir regras do jogo)
- [ ] Implementar permissão de jogadores para incluir bot
- [x] Integrar bot com motor de jogo
- [ ] Testar bot em diferentes cenários

## Fase 7: Frontend - Lobby
- [x] Criar página de lobby com listagem de salas
- [x] Implementar filtro/busca de salas
- [x] Implementar indicador de status (2/4 jogadores)
- [x] Implementar botão de criar sala
- [x] Implementar botão de entrar em sala
- [ ] Implementar sistema de convites para amigos
- [ ] Implementar visualização de status online/jogando

## Fase 8: Frontend - Mesa de Jogo
- [x] Criar componente de mesa de jogo
- [x] Implementar visualização de peças do jogador
- [ ] Implementar drag-and-drop ou reorganização de peças
- [x] Implementar seleção de peça para jogar
- [x] Implementar seleção de ponta (esquerda/direita)
- [x] Implementar visualização de peças dos outros jogadores (quantidade)
- [x] Implementar visualização do estado da mesa (peças jogadas)
- [x] Implementar botão de passar vez
- [ ] Implementar animação de jogada

## Fase 9: Chat em Tempo Real
- [x] Criar componente de chat
- [ ] Implementar envio de mensagens via WebSocket
- [x] Implementar histórico de mensagens
- [ ] Implementar notificações de entrada/saída de jogadores

## Fase 10: Moderação de Chat por IA
- [x] Integrar LLM para análise de mensagens ofensivas
- [x] Implementar sistema de penalidades (24h, 30 dias, permanente)
- [x] Implementar bloqueio de usuários ofensores
- [ ] Implementar notificação de bloqueio ao usuário
- [x] Implementar registro de infrações

## Fase 11: Ranking e Níveis
- [x] Criar modelo de dados para ranking (stats de jogador)
- [x] Implementar cálculo de pontos por vitória
- [x] Implementar sistema de níveis (baseado em partidas jogadas/ganhas)
- [x] Criar página de ranking global
- [x] Implementar visualização de perfil do jogador com estatísticas

## Fase 12: Painel Administrativo
- [x] Criar layout do painel admin
- [x] Implementar acesso restrito (apenas admin)
- [ ] Implementar visualização de usuários
- [ ] Implementar visualização de partidas
- [ ] Implementar visualização de salas ativas
- [ ] Implementar relatório de jogadas
- [ ] Implementar gerenciamento de usuários (banir, promover, etc.)
- [ ] Implementar acesso ao banco de dados (visualização)
- [ ] Implementar relatório de infrações de chat

## Fase 13: Animações e UX
- [x] Implementar animação de bônus 50 pontos (comemorativa)
- [ ] Implementar animação de vitória
- [ ] Implementar animação de jogada (peça saindo da mão)
- [ ] Implementar animação de bloqueio de usuário
- [ ] Implementar transições suaves entre telas

## Fase 14: Testes e Polimento
- [x] Escrever testes unitários para lógica de jogo
- [x] Escrever testes para motor de pontuação
- [x] Testar fluxo completo de partida
- [ ] Testar bot em diferentes cenários
- [ ] Testar moderação de chat
- [ ] Testar responsividade em mobile
- [ ] Testar performance com múltiplas salas/partidas
- [ ] Ajustes finais de UX

## Fase 15: Redesenho do Tabuleiro (CRÍTICO)
- [ ] Redesenhar GameBoard com layout profissional de dominó
- [ ] Implementar painel central com peças da mesa em linha
- [ ] Criar componente de peça de dominó com visual realista
- [ ] Implementar mão do jogador na base com seleção interativa
- [ ] Adicionar placar dos 4 jogadores nos cantos
- [ ] Implementar indicador de turno e jogador atual
- [ ] Adicionar pontuação em tempo real
- [ ] Implementar animação de jogada (peça saindo da mão)
- [ ] Testar layout responsivo em mobile
- [ ] Testar fluxo completo de jogo

## Fase 16: Deploy e Entrega
- [ ] Criar checkpoint final
- [ ] Documentar instruções de uso
- [ ] Preparar para publicação
