# PRD — Web Swing (web-swing)

## 1. Visão Geral

**Nome do Produto:** Web Swing  
**Versão:** 0.4.0 (Etapa 4 concluída — áudio e "juice")  
**Tipo:** Jogo single-player 3D de navegador (percurso linear)  
**Stack:** TypeScript + Vite + three.js 0.186 (WebGL) + Vitest, sem frameworks de UI e sem assets externos  
**Público-alvo:** Jogador de desktop com mouse e teclado; sessões de 1–3 min por nível

---

## 2. Objetivo do Produto

Entregar a **sensação de se balançar por teias** entre prédios, com controle fino e legível:
- mirar no prédio e segurar para prender a teia;
- soltar no momento certo para ganhar impulso;
- encadear balanços sem tocar a rua.

O objetivo de cada nível é **chegar ao fim da avenida no menor tempo possível**. O ciclo de jogo é **velocidade × habilidade × risco**:
- swings bem soltos, solturas perfeitas e flips enchem o **impulso**, que deixa o herói **mais rápido**;
- errar a teia, soltar mal, fazer o flip atrasado, tocar a rua ou bater tira parte do impulso (ou tudo, numa queda);
- **mísseis quase teleguiados**, disparados de lançadores nos telhados, perseguem o jogador e tentam prever a trajetória dele. São desviáveis, mas cada acerto custa velocidade e tempo.

Os 5 níveis ficam progressivamente mais difíceis: avenidas mais longas e irregulares, vãos sem chão e ameaças mais duras (mais lançadores, salvas maiores, mísseis mais rápidos, mais ágeis, com mais previsão e em fogo cruzado).

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
| FR-10 | **Pausa** | Controle por *pointer lock*. Perder o lock (Esc, trocar de janela) pausa o jogo e abre o menu de pausa (Etapa 3); o clique que retoma não dispara teia. |

### 3.2 Implementado — Etapa 2 (contra o relógio, impulso, mísseis e recordes)

> A primeira versão da Etapa 2 (pontuação por anéis + combo de estilo, 3 vidas e cota de anéis) ficou no checkpoint `web-swing-v0.2.0-aneis`. Ela foi substituída por este redesenho (ADR-022 a ADR-024).

| ID | Feature | Descrição |
|---:|---------|-----------|
| FR-11 | **Impulso (momentum)** | Medidor de 0 a 5. **Ganha:** +0,5 por swing bem solto (qualidade ≥ 0,4), +1,0 por soltura perfeita e +0,5 por flip. **Perde:** −0,5 por clique sem alvo, −0,5 por soltura muito ruim (q < 0,15) e −0,25 por flip atrasado (Espaço no ar até 1 s depois de a janela fechar). **Mantém só uma parte:** 50% ao ficar > 150 ms na rua, 40% num bonk e 25% ao levar um míssil. Cair num vão zera. Sem nenhum acerto por 3 s (ou parado > 1,2 s num telhado), escorre 0,5/s. Toques curtos na teia (< 0,35 s) não contam. |
| FR-12 | **Impulso vira velocidade** | Cada nível de impulso dá +4 m/s no teto do balanço, +20% no boost da soltura e mais assistência e bombeio no arco, além de 12% a menos de arrasto do ar. O mesmo balanço vai de 32,5 m/s (impulso 0) a 44,9 m/s (impulso 5), +38%. |
| FR-13 | **Mísseis** | Lançadores nos telhados (ou no topo das gruas) miram quando o jogador entra no alcance (75 m, até 20 m depois deles) e está à vista. O **aviso** (laser + lâmpada piscando cada vez mais rápido) dura 0,9 s; depois vem a salva. O míssil sobe por 0,35 s sem guiagem e então persegue com **curva limitada** e **previsão** da trajetória. Explode ao bater num prédio (a cidade serve de cobertura) e some depois de 7 s. **Acerto:** solta a teia, atordoa por 0,6 s, empurra e deixa só 25% do impulso; depois vem 1,5 s de invulnerabilidade. |
| FR-14 | **Dificuldade das ameaças** | L1 → L5: 3 → 14 lançadores; salva de 1 → 3; míssil de 38 → 57 m/s; curva de 1,0 → 2,2 rad/s; previsão de 0 → 100%; recarga de 3,5 → 1,8 s; fogo cruzado (pares, um de cada lado) a partir do L4. Um desvio bem cronometrado sempre escapa, mas a janela encolhe: no L5, de frente e devagar, não dá (há teste). |
| FR-15 | **Campanha contra o relógio** | Sem vidas e sem fim de jogo: o castigo de qualquer erro é **tempo**. Countdown 3-2-1 antes de cada nível (o relógio só corre depois do "Já!"). Cair num vão leva ao último checkpoint parado, com o relógio correndo. Concluir o L5 → vitória. O tempo da campanha é a soma dos níveis. |
| FR-16 | **Estrelas por tempo** | ★ concluiu; ★★ até o tempo de prata; ★★★ até o tempo de ouro (L1: 25/32 s … L5: 54/70 s). O ouro pede uma média de ~30–32 m/s. Valores provisórios até o teste com jogadores. |
| FR-17 | **Vãos e gruas** | A partir do L3, trechos sem chão (40–80 m) com gruas ancoráveis. A cidade garante sempre uma âncora a 8–45 m à frente (há teste), e nunca há vidro dos dois lados ao mesmo tempo. |
| FR-18 | **Recordes por tempo** | Tabela geral: top 10 dos **menores tempos** de campanha completa (L1 → L5; empate → quem fez primeiro). Melhor por nível: menor tempo e mais estrelas, salvos a cada nível concluído. Salvos no navegador (`web-swing:v1:save`, dados v2), com migração do v1 (anéis: a tabela recomeça e o melhor tempo por nível é aproveitado) e backup se o dado estiver corrompido. Runs com flags de debug não entram. |
| FR-19 | **HUD** | À esquerda: nível, cronômetro (m:ss.cc), próxima estrela em jogo ("★★★ até 0:25.00") e recorde do nível. À direita: velocidade (m/s), medidor de impulso em 5 segmentos (cor muda com o nível; treme atordoado) e combo. Popups de ganho/perda e de checkpoint (com o tempo parcial). Flash vermelho ao levar um míssil. **Radar de ameaças:** setas em volta do retículo apontam para mísseis (vermelhas) e lançadores mirando (âmbar), e o anel pulsa quando um míssil está muito perto. |

### 3.3 Implementado — Etapa 3 (telas)

| ID | Feature | Descrição |
|---:|---------|-----------|
| FR-30 | **Título** | Logo, "Jogar campanha", "Selecionar nível", "Recordes" e "Como jogar", com a melhor campanha e o progresso (níveis concluídos, estrelas). Ao fundo, uma **demonstração**: o replay dourado do L1 jogando de verdade (swings, flips, mísseis), em loop. |
| FR-31 | **Seleção de nível** | Cartões dos 5 níveis com estrelas, recorde, metas de ouro/prata e ameaças (lançadores, vãos). Um nível só abre depois de concluir o anterior. Teclas 1–5. Começar num nível segue a campanha a partir dele. |
| FR-32 | **Recordes** | Tabela dos 10 menores tempos de campanha completa (com o recém-salvo destacado) e o melhor tempo/estrelas de cada nível. |
| FR-33 | **Como jogar** | Controles, objetivo, impulso, mísseis e estrelas. Abre do título ou da pausa. |
| FR-34 | **Pausa** | Continuar (volta só quando o pointer lock é confirmado; se o navegador recusar, avisa), Reiniciar nível, Como jogar e Menu principal. Mostra o tempo do nível e da campanha. |
| FR-35 | **Resultados do nível** | Tela própria com o tempo, estrelas, diferença para o recorde, quanto faltou para a próxima estrela e as estatísticas; "Próximo nível" (Enter), "Tentar de novo" (R) e "Menu". O mouse fica livre. |
| FR-36 | **Fim de campanha** | Tempo total, tempos e estrelas por nível, entrada de nome se entrou no top 10 (depois leva aos recordes com o nome destacado), "Jogar de novo" e "Menu". Não há game over (ADR-024). |
| FR-37 | **O relógio da campanha nunca volta** | "Reiniciar nível" e "Tentar de novo" são livres para treinar, mas o tempo da tentativa abandonada continua somado na campanha. A tabela geral premia a campanha feita de uma vez. |
| FR-38 | **Sem travadas de shader** | Os shaders de cada nível são compilados ao carregá-lo (`renderer.compile`), durante o countdown ou o menu. |

### 3.4 Implementado — Etapa 4 (áudio, partículas e "juice")

| ID | Feature | Descrição |
|---:|---------|-----------|
| FR-40 | **Áudio sintetizado** | WebAudio, sem arquivos. Cada evento tem som: teia (*thwip*), soltura (com brilho na perfeita), flip/impulso, pulo, pouso (pelo impacto), bonk, clique no vazio, checkpoint, countdown e "Já!", queda, fim de nível e fanfarra da campanha, clique de menu. |
| FR-41 | **Som do impulso** | O "plim" de ganho **sobe de tom** com o impulso (escala pentatônica); subir de nível toca um arpejo. A perda é um glissando descendente. |
| FR-42 | **Som das ameaças** | Aviso do lançador (bipe duplo, nunca some), disparo e explosão atenuados pela distância, acerto com estrondo e zumbido. Um **bipe de proximidade** acelera conforme um míssil se aproxima. |
| FR-43 | **Vento** | Ruído filtrado em loop, com volume e brilho crescendo com a velocidade. |
| FR-44 | **Mudo** | `M` liga/desliga o som, e a escolha fica salva no navegador. O áudio só nasce num gesto do usuário (clique de menu ou "Jogar"); a demonstração do título é muda. |
| FR-45 | **Partículas** | Poeira ao agarrar a fachada e ao pousar (pelo impacto); faíscas no bonk; anel de brilho ao subir de nível de impulso (na cor do medidor); brilho dourado na soltura perfeita; faíscas e fumaça ao levar um míssil. Pools fixos, 2 draw calls. |
| FR-46 | **Câmera viva** | Tremor por **trauma** (míssil > bonk > pouso duro > explosão perto; decai em < 1 s) e inclinação de até **3°** para dentro da curva. É só visual: a mira continua sendo o raio da câmera lógica. |
| FR-47 | **Speed lines** | Riscos radiais nas bordas acima de ~30 m/s, cheios a ~52 m/s (impulso alto), com o centro livre para a mira. |
| FR-48 | **Retículo** | Brilho dourado rápido na soltura perfeita. |
| FR-49 | **Reduzir movimento** | Com `prefers-reduced-motion` do sistema, sem tremor, inclinação e speed lines (a opção dentro do jogo vem na Etapa 5). |

### 3.5 Planejado

| Etapa | Features |
|---|---|
| 5 | Configurações (sensibilidade, inverter Y, FOV, volumes, qualidade, reduzir movimento), nível de treino |
| 6 | Performance, CI e deploy (GitHub Pages) |

### 3.6 Controles

| Ação | Tecla |
|---|---|
| Olhar e mirar | Mouse (*pointer lock*) |
| Teia | Segurar o botão esquerdo = prende; soltar = larga |
| Mover / direcionar o balanço | `W` `A` `S` `D` (`W` na descida = bombear; `S` = frear) |
| Pular / impulso na teia / flip após soltar | `Espaço` |
| Pausar | `Esc` |
| Som liga/desliga | `M` |
| Menus | Mouse ou `Tab` + `Enter`; `Esc` volta nos submenus; `1`–`5` na seleção de nível; `R` = tentar de novo nos resultados |

### 3.7 Visual & UX

| ID | Requisito |
|---:|-----------|
| FR-20 | Paleta de entardecer centralizada em `render/palette.ts`, sem cores fixas no código de render. |
| FR-21 | Prédios instanciados com janelas procedurais no shader (padrão suavizado ao longe). O vidro tem visual próprio, porque o jogador precisa reconhecer de longe o que não segura teia. |
| FR-22 | Retículo: ○ com alvo, azul quando a assistência escolheu o alvo, ✕ sem alvo, com o motivo ("fora de alcance", "baixo demais", "vidro não segura teia"). Um marcador 3D mostra o ponto real da âncora. |
| FR-23 | HUD e menus em DOM (acessíveis: diálogo com título, foco no botão principal, navegação por teclado), fontes do sistema. |
| FR-24 | DPR limitado a 2 e redimensionamento via `ResizeObserver`. |
| FR-25 | Lançadores com base, cabeça e cano que seguem o jogador; laser e lâmpada de aviso aditivos (visíveis de longe); mísseis com brilho do motor e rastro de fumaça; explosões aditivas com fumaça. Tudo instanciado em pool fixo (8 draw calls). Gruas amarelas, água escura no fundo dos vãos e faixa luminosa nos checkpoints. |

---

## 4. Requisitos Não-Funcionais

| ID | Categoria | Requisito |
|---:|-----------|-----------|
| NFR-01 | **Determinismo** | Mesma seed + mesmos inputs → mesmo estado a cada tick (`hashState`). Estado serializável; PRNG Mulberry32. |
| NFR-02 | **Camadas** | `logic/` é puro. `render/`, `input/` e `ui/` só fazem `import type` de `logic/` (exceto `logic/math/*`). `app/` é cola pura. Tudo verificado por `architecture.test.ts`. |
| NFR-03 | **Testabilidade** | Física, mira, gerador, impulso, mísseis, progressão, recordes, radar, câmera, relógio, flags e animação têm testes Vitest em Node, sem DOM. Um **replay dourado** do L1 garante que a partida gravada termina com o mesmo tempo e o mesmo estado. |
| NFR-04 | **Performance** | Física a 60 Hz fixos com interpolação no render. Meta: 60 FPS, < 80 *draw calls*, bundle < 250 kB gzip. |
| NFR-05 | **Build/Dev** | `npm run dev`, `npm run verify` (typecheck + build + testes), `npm run feel` (métricas de *feel*) e `npm run golden` (regrava o replay dourado). |
| NFR-06 | **TypeScript strict** | `strict`, `noUnusedLocals`, `noImplicitReturns`, `isolatedModules`. |

---

## 5. Fora do Escopo (v0.3)

- Multiplayer, mobile/touch, gamepad
- Mundo aberto, modo infinito, vidas/fim de jogo
- Modelos ou texturas externas (glTF, Mixamo)
- Wall-run, reel manual, drones e outros perigos além dos mísseis (backlog)

---

## 6. Critérios de Aceite (Definition of Done)

### Etapa 4
- [x] `npm run verify` verde (223 testes, typecheck, build)
- [x] Mapeamentos puros: tom limitado e subindo com o impulso, ganhos em [0, 1], atenuação por distância, vento, bipe de proximidade (testes)
- [x] Pool de partículas de tamanho fixo; trauma decai a 0; roll ≤ 3° e independente do FPS; speed lines (testes)
- [x] Áudio só nasce no gesto; cada evento toca o som certo; M muda e persiste (navegador)
- [ ] Ouvir e sentir de verdade (roteiro manual de `VERIFICACAO.md`, Etapa 4): volume, timbres e intensidade do tremor


### Etapa 3
- [x] `npm run verify` verde (207 testes na época, typecheck, build)
- [x] Tabela completa de transições das telas; ação inválida ignorada; lock só nos gestos de "jogar"; nome só quando a campanha se qualifica (testes)
- [x] Fluxo do título ao título sem beco sem saída (teste + navegador)
- [x] O clique nos botões de menu não vira teia (navegador: 0 teias após o clique que pega o lock)
- [x] Reiniciar/tentar de novo não fazem o relógio da campanha voltar (testes + navegador)
- [ ] Roteiro manual de `VERIFICACAO.md` (Etapa 3) executado por uma pessoa


### Etapa 2 (redesenho contra o relógio)
- [x] `npm run verify` verde (196 testes na época, typecheck, build)
- [x] Impulso: ganhos, perdas, perdas parciais, escoamento e efeito na velocidade (testes)
- [x] Mísseis: ciclo do lançador, linha de visada, guiagem limitada, previsão, cobertura, acerto contínuo, invulnerabilidade; desviáveis em todas as fases e mais difíceis a cada fase (testes)
- [x] Campanha contra o relógio: countdown, checkpoints com o relógio correndo, estrelas por tempo, vitória (testes + navegador)
- [x] Alcançabilidade garantida nos 5 níveis, inclusive sobre os vãos (teste)
- [x] Replay dourado do L1 reproduz o tempo e o estado exatos (teste; `npm run golden` regrava)
- [x] Recordes por tempo persistem no navegador; save v1 migra; save corrompido não quebra o jogo (testes + navegador)
- [ ] Roteiro manual de `VERIFICACAO.md` (Etapa 2) executado por uma pessoa
- [ ] Tempos de ouro/prata calibrados com partidas reais

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

### Etapa 2 (redesenho) — piloto automático

O piloto joga mal de propósito: não desvia de mísseis, bate em fachadas e às vezes empaca. Serve para comparar variantes, não para dizer o que um jogador consegue.

| Nível | Ouro / prata | Sem flip, god | Com flip, god | Com flip, levando mísseis | Mísseis | Acertos |
|---|---|---|---|---|---|---|
| L1 | 25 / 32 s | 28,0 s ★★ | 28,6 s ★★ | 28,6 s ★★ | 3 | 0 |
| L2 | 31 / 40 s | 102,6 s ★ (empacou) | 49,3 s ★ | 49,1 s ★ | 5 | 1 |
| L3 | 38 / 49 s | 46,3 s ★★ | 61,8 s ★ | 53,6 s ★ | 14 | 2 |
| L4 | 46 / 59 s | 82,4 s ★ | 73,7 s ★ | 63,7 s ★ | 12 | 3 |
| L5 | 54 / 70 s | 103,3 s ★ | 73,7 s ★ | 82,1 s ★ | 30 | 6 |

- Impulso médio do piloto: 1,0–2,1 (máximo 4–5). As perdas mais comuns são bonk e rua.
- Desvio (teste em `threats.test.ts`): de 36 combinações de velocidade × distância de reação × origem, escapam 34 (L1), 34 (L2), 29 (L3), 21 (L4) e 15 (L5).
