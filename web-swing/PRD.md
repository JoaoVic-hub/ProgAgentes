# PRD — Web Swing (web-swing)

## 1. Visão Geral

**Nome do Produto:** Web Swing  
**Versão:** 0.2.0 (Etapa 2 concluída)  
**Tipo:** Jogo single-player 3D de navegador (percurso linear)  
**Stack:** TypeScript + Vite + three.js 0.186 (WebGL) + Vitest, sem frameworks de UI e sem assets externos  
**Público-alvo:** Jogador de desktop com mouse e teclado; sessões de 1–3 min por nível

---

## 2. Objetivo do Produto

Entregar a **sensação de se balançar por teias** entre prédios, com controle fino e legível:
- mirar no prédio e segurar para prender a teia;
- soltar no momento certo para ganhar impulso;
- encadear balanços sem tocar a rua.

A pontuação vem de **anéis coletáveis** e de um **combo de estilo**; o tempo nunca vira pontos. Cada nível é uma avenida com início e linha de chegada, e os 5 níveis ficam progressivamente mais difíceis.

---

## 3. Funcionalidades (Features)

### 3.1 Implementado — Etapas 0 e 1 (movimento e teia)

| ID | Feature | Descrição |
|---:|---------|-----------|
| FR-01 | **Avenida procedural** | 5 níveis declarativos (`LevelSpec`) com seed fixa. O gerador puro cria prédios dos dois lados, becos, recuos e prédios de vidro, além de paredes invisíveis nos limites. |
| FR-02 | **Movimento no chão** | Corrida até 11 m/s no referencial da câmera (diagonal não é mais rápida), pulo de 11 m/s, *coyote time* de 0,1 s e *buffer* de pulo de 0,12 s. |
| FR-03 | **Colisão robusta** | Caixa do jogador contra AABBs, com varredura por eixo em subpassos de no máximo 0,3 m (sem túnel a 60 m/s). Desliza na parede, sobe beirais de até 1,2 m automaticamente e dá *bonk* acima de 22 m/s contra a parede (solta a teia e atordoa por 0,4 s). |
| FR-04 | **Mira da teia** | Raio da câmera lógica (centro da tela), com alcance de 60 m. A âncora precisa estar pelo menos 2,5 m acima do peito. Vidro bloqueia sem ancorar. Acerto na fachada até 10 m abaixo do topo sobe para a quina. |
| FR-05 | **Assistência de mira** | Quando o raio direto não serve, escolhe a melhor quina de telhado voltada para a avenida num cone de 8° (depois 20°), com linha de visada livre, histerese para não "piscar" e nunca atrás. Um clique sem alvo fica pendente por 0,15 s. |
| FR-06 | **Corda** | Inextensível (PBD) em 4 subpassos por tick, como uma "catraca": recolhe a folga e nunca dá trancos. Tem *auto-reel* até um comprimento-alvo que mantém o fundo do arco ≥ 2 m acima da rua: suave no ar (6 m/s) e rápido ao sair do chão (14 m/s). A âncora virtual faz o arco seguir a avenida. Anexar do chão dá um pulinho. |
| FR-07 | **Soltura, impulso e flip** | A soltura dá um boost proporcional à qualidade (ideal: saída a 35° acima do horizonte; "perfeita" com q ≥ 0,8). Espaço com teia presa dá impulso tangencial (1× por teia). Espaço até 0,4 s após soltar no ar faz um flip. Boost, flip e impulso exigem teia presa por ≥ 0,35 s, o que impede voar com spam de cliques. A teia solta sozinha acima da âncora ou após 0,5 s encostado numa parede. |
| FR-08 | **Câmera em 3ª pessoa** | Pivô sobre o ombro que nunca entra em paredes, com suavização independente de FPS e *feed-forward* (sem atraso em velocidade constante: o retículo coincide com a mira). Distância de 5,5 → 8 m e FOV de 70° → 85° conforme a velocidade. O braço da câmera colide com os prédios. |
| FR-09 | **Boneco procedural** | Feito de primitivas (1,8 m), com 8 estados: idle, run, jump, fall, swing, flip, land e bonk. Tem crossfade entre estados. No swing, o corpo inclina para a teia e o braço aponta para ela. |
| FR-10 | **Pausa** | Controle por *pointer lock*. O overlay "Clique para jogar / Pausado" aparece, e o clique que retoma não dispara teia. |

### 3.2 Implementado — Etapa 2 (pontuação, níveis e recordes)

| ID | Feature | Descrição |
|---:|---------|-----------|
| FR-11 | **Anéis** | 14–30 anéis por nível numa rota suave no meio da avenida. Os "de risco" ficam baixos, perto da rua, ou sobre os vãos; os dourados (400 pts) são sempre de risco. Anel vale base × (1 + bônus de velocidade: +50% a 26 m/s, +100% a 34 m/s) × multiplicador. A coleta é contínua (o corpo cruza o disco entre ticks), então nenhum anel é "pulado" em alta velocidade. |
| FR-12 | **Combo de estilo** | Swing válido (10), soltura perfeita (50), flip (100/200) e sequência de velocidade (40 a cada 2 s acima de 26 m/s), multiplicados. O multiplicador sobe ×0,5 a cada 4 eventos, até ×5. Quebra com > 150 ms na rua, > 1,2 s num teto, 3 s sem evento, bonk ou queda. |
| FR-13 | **Campanha** | 3 vidas. Countdown 3-2-1 antes de cada nível. Cair num vão custa uma vida e volta ao último checkpoint (anéis mantidos, combo zerado). Chegar sem a **cota de anéis** custa uma vida e reinicia o nível. 0 vidas → fim de jogo; concluir o L5 → vitória. A pontuação da campanha é a soma dos níveis concluídos. |
| FR-14 | **Fim de nível** | Bônus: +1000 com todos os anéis e +500 sem nunca pousar na rua. Estrelas: ★ concluiu; ★★ com ≥ 75% dos anéis; ★★★ com pontuação ≥ par. O tempo aparece só como estatística. |
| FR-15 | **Vãos e gruas** | A partir do L3, trechos sem chão (40–80 m) com gruas ancoráveis. A cidade garante sempre uma âncora a 8–45 m à frente (há teste), e nunca há vidro dos dois lados ao mesmo tempo. |
| FR-16 | **Recordes** | Top 10 da campanha (nome de 1–12 caracteres; empate → quem fez primeiro) e melhor resultado por nível (pontos, estrelas, tempo). Salvos no navegador (`web-swing:v1:save`), com versão, migração e backup se o dado estiver corrompido. Runs com flags de debug não entram. |
| FR-17 | **HUD** | Pontos do nível e da campanha, multiplicador com barra de progresso, anéis/cota, vidas, nome do nível e popups de cada ponto ganho ou combo perdido. |

### 3.3 Planejado

| Etapa | Features |
|---|---|
| 3 | Tela de abertura, seleção de nível, pausa com menu, resultados, game over e vitória |
| 4 | Áudio sintetizado, partículas, *speed lines*, tremor de câmera |
| 5 | Configurações (sensibilidade, inverter Y, FOV, volumes, qualidade, reduzir movimento), nível de treino |
| 6 | Performance, CI e deploy (GitHub Pages) |

### 3.4 Controles

| Ação | Tecla |
|---|---|
| Olhar e mirar | Mouse (*pointer lock*) |
| Teia | Segurar o botão esquerdo = prende; soltar = larga |
| Mover / direcionar o balanço | `W` `A` `S` `D` (`W` na descida = bombear; `S` = frear) |
| Pular / impulso na teia / flip após soltar | `Espaço` |
| Pausar | `Esc` |
| Continuar depois do resumo do nível | `Enter` |

### 3.5 Visual & UX

| ID | Requisito |
|---:|-----------|
| FR-20 | Paleta de entardecer centralizada em `render/palette.ts`, sem cores fixas no código de render. |
| FR-21 | Prédios instanciados com janelas procedurais no shader (padrão suavizado ao longe). O vidro tem visual próprio, porque o jogador precisa reconhecer de longe o que não segura teia. |
| FR-22 | Retículo: ○ com alvo, azul quando a assistência escolheu o alvo, ✕ sem alvo, com o motivo ("fora de alcance", "baixo demais", "vidro não segura teia"). Um marcador 3D mostra o ponto real da âncora. |
| FR-23 | HUD e overlays em DOM (acessíveis, com texto nítido), fontes do sistema. |
| FR-24 | DPR limitado a 2 e redimensionamento via `ResizeObserver`. |
| FR-25 | Anéis coloridos por tipo (ciano comum, rosa de risco, dourado), com pulso e "estouro" ao coletar; gruas amarelas; água escura no fundo dos vãos; faixa luminosa nos checkpoints. |

---

## 4. Requisitos Não-Funcionais

| ID | Categoria | Requisito |
|---:|-----------|-----------|
| NFR-01 | **Determinismo** | Mesma seed + mesmos inputs → mesmo estado a cada tick (`hashState`). Estado serializável; PRNG Mulberry32. |
| NFR-02 | **Camadas** | `logic/` é puro. `render/`, `input/` e `ui/` só fazem `import type` de `logic/` (exceto `logic/math/*`). `app/` é cola pura. Tudo verificado por `architecture.test.ts`. |
| NFR-03 | **Testabilidade** | Física, mira, gerador, pontuação, progressão, recordes, câmera, relógio, flags e animação têm testes Vitest em Node, sem DOM. Um **replay dourado** do L1 garante que a partida gravada termina com a mesma pontuação. |
| NFR-04 | **Performance** | Física a 60 Hz fixos com interpolação no render. Meta: 60 FPS, < 80 *draw calls*, bundle < 250 kB gzip. |
| NFR-05 | **Build/Dev** | `npm run dev`, `npm run verify` (typecheck + build + testes), `npm run feel` (métricas de *feel*) e `npm run golden` (regrava o replay dourado). |
| NFR-06 | **TypeScript strict** | `strict`, `noUnusedLocals`, `noImplicitReturns`, `isolatedModules`. |

---

## 5. Fora do Escopo (v0.2)

- Multiplayer, mobile/touch, gamepad
- Mundo aberto, modo infinito, pontuação por tempo
- Modelos ou texturas externas (glTF, Mixamo)
- Wall-run, reel manual e perigos móveis (backlog)

---

## 6. Critérios de Aceite (Definition of Done)

### Etapa 2
- [x] `npm run verify` verde (172 testes, typecheck, build)
- [x] Anéis coletados de forma contínua, combo e multiplicador com as regras do §3.2 (testes)
- [x] Campanha: countdown, vidas, checkpoints, cota, bônus, estrelas, fim de jogo e vitória (testes + navegador)
- [x] Alcançabilidade garantida nos 5 níveis, inclusive sobre os vãos (teste)
- [x] Replay dourado do L1 reproduz a pontuação exata (teste; `npm run golden` regrava)
- [x] Recordes persistem no navegador; save corrompido não quebra o jogo (testes + navegador)
- [ ] Roteiro manual de `VERIFICACAO.md` (Etapa 2) executado por uma pessoa

### Etapa 1

- [x] `npm run verify` verde (typecheck, build e testes)
- [x] Cidade dos 5 níveis gerada de forma determinística; `?level=N` e `?seed=N` funcionam
- [x] Andar, pular, colidir e deslizar sem atravessar prédios (inclui teste de fuzz)
- [x] Teia prende, balança, solta com boost; flip e impulso funcionam
- [x] L1 atravessável sem tocar a rua (`npm run feel`)
- [x] Boneco com 8 estados de animação sem membros invertidos (`?view=pose`)
- [ ] Roteiro manual de `VERIFICACAO.md` executado por uma pessoa em Chrome, Firefox e Edge

---

## 7. Métricas de Feel (medidas com `npm run feel`)

As metas vêm do plano aprovado. Os valores foram medidos pelo piloto automático, que usa uma estratégia simples; um jogador humano tende a ir melhor.

| Métrica | Meta do plano | Medido (L1 · L1–L5) | Situação |
|---|---|---|---|
| Velocidade máxima no 1º swing a partir do repouso | ~~18–22 m/s~~ 28–36 m/s (revisada, ver nota) | 29 · 28–36 m/s | ✅ aceito |
| Velocidade de cruzeiro | 25–35 m/s | 32,8 · 26–33 m/s | ✅ |
| Duração do arco | 1,2–1,8 s | 1,87 · 1,7–2,2 s | ⚠️ levemente acima |
| Atravessar o L1 sem tocar a rua | 0 toques | 0 | ✅ |
| *Bonks* no L1 | — | 0 | ✅ |
| Os 5 níveis concluídos pelo piloto | — | 5/5 (L1 em 31,6 s) | ✅ |

> **Nota (decidido em 2026-09-24: aceitar ~29 m/s):**
>
> A energia do 1º swing a partir da rua vem do *reel*. Ele precisa recolher 10–17 m de corda para o arco não raspar o asfalto, e esse trabalho vira 25–35 m/s.
>
> Baixar para 18–22 m/s exigiria uma de três coisas (descartadas):
> - aceitar que o 1º arco arraste na rua (medido: 45 ticks raspando com reel de 6 m/s);
> - mirar âncoras mais próximas e baixas;
> - trocar o "zip" de saída por outra mecânica (ex.: impulso vertical maior sem reel).
>
> Os números detalhados estão no ADR-016.

### Etapa 2 (piloto automático em god mode, sem mirar nos anéis)

| Nível | Concluiu | Quedas no vão | Anéis | Pontos (par) |
|---|---|---|---|---|
| L1 | ✅ 34,6 s | — | 1/14 | 1.260 (4.000) |
| L2 | ✅ 45,8 s | — | 0/18 | 680 (6.000) |
| L3 | ✅ 53,5 s | 0 | 2/22 | 1.055 (8.500) |
| L4 | ✅ 65,6 s | 0 | 0/26 | 1.285 (11.000) |
| L5 | ✅ 86,2 s | 2 | 0/30 | 530 (14.000) |

> O piloto não mira nos anéis, então os pontos dele não servem para calibrar o **par** (3ª estrela).
> Medindo onde ele cruza cada anel, as rotas passam a 3–10 m do centro, na faixa de altura das trajetórias (5–30 m): os anéis são pegáveis com mira, mas **o par é provisório** e deve ser calibrado com partidas reais (ADR-019).

