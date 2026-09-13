# Research: Jogo de Truco Brasileiro Multijogador

**Branch**: `001-brazilian-truco-game` | **Date**: 2026-09-10 | **Plan**: [plan.md](plan.md)

Consolida as decisões técnicas levantadas na Fase 0. Nenhum `NEEDS CLARIFICATION` restante
— todas as lacunas foram resolvidas com base no input do usuário e nas premissas da spec.

## 1. Linguagem e tooling base

- **Decision**: TypeScript em toda a base (client, server, truco-rules), Node.js ≥ 20.
- **Rationale**: o módulo de regras é a parte de maior exigência de testes (constituição);
  tipos explícitos tornam as regras (carta, manilha, valor de mão) autodocumentadas e
  auto-validáveis, reduzindo bugs de regra entre servidor e cliente. TypeScript é suportado
  nativamente por Vite, Phaser 3, Socket.io e Vitest.
- **Alternatives considered**: JavaScript puro (menos boilerplate, porém sem checagem de
  tipos para a lógica crítica); Flow (ecossistema menor no contexto Phaser/Vite).

## 2. Engine, bundler e empacotamento móvel

- **Decision**: Phaser 3 (renderização/cenas), Vite (dev server e build), Capacitor
  (empacotamento Android/iOS).
- **Rationale**: stack exigida pelo usuário; Phaser 3 é mantida e madura; Vite é o bundler
  sugerido pelo ecossistema Phaser; Capacitor empacota o mesmo bundle web para iOS/Android
  sem bifurcar código — atendendo à constituição (mesma base web + mobile, sem dependência
  exclusiva de ambiente).
- **Alternatives considered**: Cocos/Unity (não cabem no requisito de poucas dependências e
  mesma base web), Cordova (mantido porém menos alinhado ao modelo atual web-first).

## 3. Arquitetura do motor de regras (gameplay puro)

- **Decision**: pacote independente `packages/truco-rules`, módulo puro (sem rede, sem UI,
  sem dependências externas) com funções determinísticas de estado (deck, manilha, mão,
  pontuação, validação).
- **Rationale**: exigência do usuário; o mesmo módulo roda no servidor (partidas online,
  autoridade) e no cliente (partidas contra bots), evitando duplicação de lógica; testes
  Vitest cobrem exclusivamente essa biblioteca (lógica crítica da constituição).
- **Alternatives considered**: lógica duplicada cliente/servidor (rejeitada: risco de
  divergência de regras), regras acopladas ao Socket.io (rejeitada: impossibilita testes
  puros e o modo solo offline).

## 4. Comunicação em tempo real e autoridade do servidor

- **Decision**: servidor autoritativo Node.js com Socket.io; o servidor conhece o estado
  completo das mãos e cada cliente recebe apenas a própria mão + estado público da mesa.
  Bots em mesas online são executados pelo servidor (`bot-runner.ts`).
- **Rationale**: padrão para jogos de cartas sincronos; evita trapaça de cliente (cartas do
  oponente nunca trafegam para o cliente) e centraliza reconexões e persistência.
- **Alternatives considered**: autoridade no cliente (rejeitada: inseguro e com problemas de
  consistência multi-dispositivo), WebRTC P2P (rejeitada por complexidade e NAT).

## 5. Hospedagem e frio do servidor (Render free)

- **Decision**: Render plano gratuito; aceitar spin-down após 15 min de inatividade e ~1 min
  de reativação; o cliente detecta a latência inicial e exibe feedback "acordando a mesa..."
  antes/durante a tentativa de conexão.
- **Rationale**: decisão do usuário alinhada ao custo zero de prototipar; o feedback explícito
  evita a percepção de "jogo travado" (SC-005/UX) enquanto o serviço reinicia.
- **Alternatives considered**: Fly/Hetzer (mais controle, porém fora do plano gratuito de
  interesse), servidor em dispositivo (não atende locais diferentes).

## 6. Persistência (modelo misto)

- **Decision**: partidas online e histórico → SQLite (better-sqlite3) no serviço da Render;
  partidas contra bots e histórico → IndexedDB no dispositivo. Aceitar que o disco do plano
  gratuito da Render é efêmero e pode perder o histórico online entre reinicializações (v1).
- **Rationale**: espelha a clarificação da spec ("misto") e a arquitetura cliente-servidor;
  a perda ocasional de histórico online é trade-off documentado e aceitável para v1, a
  revisar em plano pago. Vitest cobre a lógica de persistência dos dois lados.
- **Alternatives considered**: PostgreSQL externo grátis (mais movimento de dados e
  dependência externa adicional, contra "poucas dependências"); só memória (perde a exigência
  de persistência da constituição).

## 7. Testes (estratégia)

- **Decision**: Vitest no workspace; obrigatório para `packages/truco-rules` (regras:
  baralho, manilha, mão/valor, pontuação, validação) e para a camada de persistência
  (SQLite no servidor, IndexedDB no cliente). Camada de apresentação (cenas, animações,
  Banco de Frases, feedback) sem testes formais.
- **Rationale**: constituição define testes apenas para lógica crítica; a UI não precisa de
  testes formais, mantendo a velocidade de prototipação.
- **Alternatives considered**: cobertura ampla com testes de cena (rejeitada: custo alto,
  contra a constituição), framework separado por app (mais configuração sem ganho).

## 8. Frontend de proto múltiplo e Índice de frases

- **Decision**: Banco de Frases como catálogo estático tipado em `packages/truco-rules`?
  Não — frases são apresentação; ficam em `apps/client/src/ui` (dados estáticos de UI).
  Já as classes de pedido/resposta acionam ações de regra pelo módulo; a UI apenas renderiza.
- **Rationale**: mantém gameplay desacoplado de apresentação (constituição); as frases não
  carregam informação de regra, são puramente visuais/sonoras.
- **Alternatives considered**: frases no pacote de regras (rejeitado: acoplaria UI ao gameplay).