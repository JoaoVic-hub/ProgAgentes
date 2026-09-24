# Changelog — web-swing

## 0.4.0 — Etapa 4: áudio, partículas e "juice" (2026-09-24)

### Adicionado
- **Áudio sintetizado** (ADR-026):
  - `audio/mapping.ts` (puro): evento → som, com tom do impulso subindo pela pentatônica, atenuação por distância para lançadores e explosões, vento pela velocidade, bipe de proximidade de míssil e bipes do countdown;
  - `audio/engine.ts` (WebAudio): síntese com osciladores e ruído filtrado, compressor, teto de vozes e vento em loop;
  - o contexto nasce no primeiro gesto; a demonstração do título é muda;
  - **M** liga/desliga o som (salvo no navegador).
- **Partículas** (`render/fx`): pool fixo puro + 2 `InstancedMesh`. Poeira ao agarrar e ao pousar, faíscas no bonk, anel de brilho ao subir de impulso, brilho na soltura perfeita, faíscas e fumaça no acerto de míssil.
- **Câmera viva** (`app/juice.ts`): tremor por trauma (trauma², ruído determinístico, decai a 0) e roll de até 3° para dentro da curva, aplicados por cima da pose (a mira não muda).
- **Speed lines** (`ui/speed-lines.ts`) acima de ~30 m/s.
- Retículo com brilho dourado na soltura perfeita; aviso no HUD ao mudar o som.
- `prefers-reduced-motion` desliga tremor, roll e speed lines.
- Dev: `__webSwing.audio()` mostra o estado do contexto e os últimos sons; o atalho K também dispara som, partículas e tremor.

### Medições
- **Testes:** 223 (Vitest), todos verdes.
- **Bundle de produção:** 666 kB → **178,6 kB gzip** (orçamento: 250 kB).
- **Chrome headless:** todos os sons esperados disparados na ordem certa, contexto só depois do gesto, speed lines visíveis, sem erros no console.

## 0.3.0 — Etapa 3: telas de abertura, pausa, resultados e fim de campanha (2026-09-24)

### Adicionado
- `app/screens.ts`: fluxo de telas como reducer puro com efeitos (ADR-025). Tabela completa de transições testada; ações inválidas são ignoradas; o pointer lock só é pedido nos gestos de "jogar".
- `ui/menus.ts`:
  - título com a demonstração ao fundo;
  - seleção de nível (estrelas, recorde, metas, ameaças, bloqueio até concluir o anterior, teclas 1–5);
  - recordes (campanha + melhor por nível, com destaque);
  - como jogar;
  - pausa (Continuar, Reiniciar nível, Como jogar, Menu);
  - resultados do nível (Próximo com Enter, Tentar de novo com R, Menu);
  - fim de campanha com entrada de nome.
- `app/demo.ts`: o replay dourado do L1 roda atrás dos menus, sem o countdown e em loop.
- `renderer.compile` ao carregar cada nível (sem travada de shader no primeiro míssil).
- `__webSwing.getScreen()` no console (dev).

### Mudado
- **O relógio da campanha nunca volta:** reiniciar/tentar de novo soma o tempo da tentativa abandonada (`restartLevel`).
- Resultados do nível viraram tela própria, com o mouse livre; a faixa central ficou só com countdown, "Já!" e queda.
- `?level=N` e `?cam=free` (dev) pulam o título; os atalhos N/J/K/R só valem na tela de jogo.

### Removido
- `ui/overlay.ts` ("Clique para jogar"/"Pausado") e `ui/scoreboard.ts` (substituídos pelos menus).

### Medições
- **Testes:** 207 (Vitest), todos verdes.
- **Bundle de produção:** 652 kB → **173 kB gzip** (orçamento: 250 kB; +8 kB: menus e a gravação da demonstração).
- **Chrome headless:** o fluxo completo do título ao título, sem erros no console (VERIFICACAO.md).

## 0.2.0 — Etapa 2 (redesenho): contra o relógio, impulso e mísseis (2026-09-24)

Pedido do dono do projeto: tirar a pontuação por anéis. O objetivo passa a ser **terminar cada nível no menor tempo**, jogar bem deixa o herói **mais rápido**, e **mísseis quase teleguiados** perseguem o jogador. A versão com anéis ficou no checkpoint `web-swing-v0.2.0-aneis` (seção abaixo).

### Adicionado
- **Impulso** (`logic/momentum.ts`, ADR-022):
  - medidor de 0 a 5 que sobe com swings bem soltos, solturas perfeitas e flips;
  - cai com teia no vazio, soltura ruim e flip atrasado; mantém só uma parte ao tocar a rua, num bonk ou num míssil; zera na queda; escorre sem manobras;
  - vira velocidade pela config efetiva do tick (`applyMomentum`): teto do balanço, boost, assistência, bombeio e arrasto. O mesmo arco vai de 32,5 para 44,9 m/s (+38%).
- **Mísseis** (`logic/threats.ts`, ADR-023):
  - lançadores nos telhados ou no topo das gruas, com aviso de 0,9 s (laser + lâmpada), salvas e recarga;
  - guiagem com curva limitada e previsão da trajetória; explodem ao bater em prédios (cobertura); acerto contínuo (sem túnel a 57 m/s) com atordoamento, empurrão e invulnerabilidade;
  - dificuldade por fase: 3 → 14 lançadores, salva de 1 → 3, 38 → 57 m/s, curva de 1,0 → 2,2 rad/s, previsão de 0 → 100%, fogo cruzado no L4+.
- **Contra o relógio** (ADR-024): sem vidas nem fim de jogo; queda no vão = checkpoint com o relógio correndo; estrelas por tempo (ouro/prata por nível); tempo parcial nos checkpoints.
- **Recordes por tempo:** top 10 dos menores tempos de campanha completa; melhor tempo e estrelas por nível; save v2 com migração do v1 (anéis) e backup.
- **Visual** (`render/threats.ts`): lançadores que seguem o jogador, laser e lâmpada de aviso, mísseis com brilho e rastro de fumaça, explosões. Tudo instanciado (8 draw calls).
- **UI:**
  - HUD com cronômetro, próxima estrela em jogo, recorde, velocidade, medidor de impulso e combo; popups de ganho/perda e checkpoint; flash ao levar míssil;
  - **radar de ameaças** em volta do retículo (`app/threat-radar.ts` puro + `ui/threat-indicator.ts`);
  - resumo do nível com tempo, estrelas, diferença para o recorde e quanto faltou para a próxima estrela;
  - placar de campanha com a tabela de tempos;
  - `ui/format.ts` (tempos truncados em centésimos).
- **Debug:** J avança 60 m (testar trechos com lançadores/vãos); K simula um acerto de míssil; o painel mostra impulso, mísseis e o estado de cada lançador.
- **Ferramentas:** o piloto automático clica só com alvo válido, faz flips e mede tempo, impulso, mísseis e acertos; `npm run feel` roda 3 modos por nível.

### Removido
- Anéis, `logic/scoring.ts`, `render/rings.ts`, vidas, cota, bônus de pontos e as fases `level_failed` e `game_over`.
- `segmentCrossesDisc` (só servia para os anéis).

### Mudado
- Estrelas por tempo no lugar de anéis/par (`LevelSpec.goldTime`/`silverTime`, provisórios).
- `LevelSpec.threats` no lugar de anéis e cota; `Level.launchers`.
- Lançadores 0,5 m da quina e 2 m acima do telhado: com 1 m / 1,5 m, a própria laje tapava a vista (só ~50% das posições no alcance eram visíveis; o smoke test no navegador não via míssil nenhum).
- Replay dourado regravado sem god mode (cobre os mísseis do L1); confere tempo, estrelas, acertos, flips e impulso.
- `hashState` inclui impulso, ameaças e o relógio.

### Medições
- **Testes:** 196 (Vitest), todos verdes.
- **Bundle de produção:** 616 kB → **165 kB gzip** (orçamento: 250 kB).
- **Piloto** (`npm run feel`): L1–L5 concluídos. Mísseis por nível 3/5/14/12/30; acertos (sem desviar) 0/1/2/3/6.
- **Desvio** (teste): combinações que escapam, de 36: 34/34/29/21/15 do L1 ao L5.

## 0.2.0-aneis — Etapa 2 (1ª versão, substituída): pontuação, níveis e recordes (2026-09-24)

> Checkpoint `web-swing-v0.2.0-aneis`. Substituída pelo redesenho acima; mantida aqui como histórico.

### Adicionado
- **2A (pontuação e HUD):**
  - Anéis (comuns, de risco e dourados) numa rota suave; coleta contínua (segmento × disco), sem "pular" anéis em alta velocidade.
  - `logic/scoring.ts`: anel × bônus de velocidade × multiplicador; swing, soltura perfeita, flip e sequência de velocidade; quebras de combo.
  - `render/rings.ts` (toros instanciados com "estouro") e `ui/hud.ts` (pontos, multiplicador com progresso, anéis/cota, vidas, popups empilháveis).
  - F1 mostra os discos de coleta e os checkpoints; o painel mostra os últimos eventos.
- **2B (conclusão e progressão):**
  - `logic/progression.ts`: countdown, playing, respawning, level_complete, level_failed, game_over, victory (ADR-018).
  - 3 vidas, checkpoints, cota de anéis, bônus (+1000/+500), estrelas.
  - Vãos sem chão no L3–L5 com gruas ancoráveis, água e bordas visuais (ADR-019).
  - Faixa central com 3-2-1, "Caiu!", resumo do nível e `Enter` para seguir.
  - `?god=1` e atalhos N/K/R (tiram o run do ranking).
  - Replay dourado do L1 (`npm run golden`, ADR-021) e gravação F9 no formato v2 (RLE), reproduzível por `__webSwing.loadReplay`.
- **2C (recordes):**
  - `logic/highscores.ts` (top 10, desempate, nome saneado, melhor por nível), `logic/save-data.ts` (parse que nunca lança, versão, migração), `storage/store.ts` (localStorage com queda para memória) e `app/save.ts` (backup do save corrompido; ADR-020).
  - Placar de fim de campanha: entrada de nome, tabela e "Jogar de novo"; `?resetScores=1`.
- **Ferramentas:** piloto automático compartilhado (`tools/autopilot.ts`) com fases, respawn e métricas de pontos/anéis; `npm run golden`.

### Mudado
- Limiares de velocidade da pontuação adaptados de 28/40 para 26/34 m/s (ADR-017).
- Gerador: prédio de vidro nunca de frente para outro de vidro — o teste de alcançabilidade achou 60 m sem âncora no L4 (ADR-019). O L1 continua idêntico.
- `logic/engine.ts` virou o despacho por fase; o tick físico da Etapa 1 foi para `logic/player/simulate.ts`, sem mudar o comportamento.
- Debug: o painel e o FPS foram para baixo à esquerda (o topo é do HUD).

### Medições
- **Testes:** 172 (Vitest), todos verdes.
- **Bundle de produção:** 596,8 kB → **158,6 kB gzip** (orçamento: 250 kB).
- **Piloto** (`npm run feel`, god mode): os 5 níveis concluídos; 2 quedas nos vãos do L5.
- **Par:** provisório (o piloto não mira anéis; ver PRD §7).

## 0.1.0 — Etapa 1: campo, movimento, teia e animações (2026-09-24)

### Adicionado
- **Etapa 0 (fundação):**
  - Scaffold Vite 5 + TS 5.9 strict + Vitest 2 + three 0.186.
  - Relógio de timestep fixo com descarte de catch-up (ADR-004).
  - Flags de debug.
  - Teste de arquitetura (ADR-001).
  - Cena base com DPR ≤ 2 e `ResizeObserver`.
- **1A (campo):**
  - 5 níveis declarativos e gerador determinístico, com broadphase em faixas de Z.
  - Cidade instanciada com janelas procedurais e prédios de vidro.
  - Rua texturizada e arco de chegada.
  - Wireframes F1 e `?cam=free`.
- **1B (movimento):**
  - Corrida, pulo, coyote e buffer.
  - Colisão por varredura em eixos com subida de beiral e bonk (ADR-010).
  - Câmera em 3ª pessoa com suavização, distância/FOV por velocidade e colisão do braço.
  - Pointer lock, overlay e pausa.
  - `?slowmo`, F3 e `.`.
- **1C.1 (teia):**
  - Mira pela câmera lógica (ADR-007).
  - Corda PBD em subpassos com auto-reel (ADR-008).
  - Âncora virtual (ADR-009).
  - Soltura com boost e impulso.
  - Teia renderizada e retículo com motivo.
  - lil-gui F2 e gravação de inputs F9.
- **1C.2 (manobras):**
  - Assistência de mira em cone com histerese e linha de visada (ADR-011).
  - Buffer de clique.
  - Flip.
  - Solturas automáticas (acima da âncora ou encostado na parede).
  - Pulinho ao anexar do chão.
- **1D (boneco):**
  - Rig de primitivas.
  - 8 poses puras e animador com crossfade (ADR-012).
  - Braço apontando para a teia.
  - `?view=pose`.
- **Ferramentas:** `npm run verify` e `npm run feel` (piloto automático de medição).

### Revisão adversarial (3 revisores + verificação), correções aplicadas
- **Câmera e mira atravessavam paredes** com o ombro encostado numa fachada → pivô seguro, linha de visada no acerto direto e a câmera nunca é empurrada para dentro da parede (ADR-007).
- **Corda frouxa e trancos de até 23 m/s por tick** → corda "catraca", que cede quando há déficit, com reel desacelerando no fim (ADR-008).
- **Spam de cliques + Espaço fazia voar** → swing mínimo de 0,35 s para boost, flip e impulso (ADR-015).
- **Pulo + flip virava pulo duplo** → o flip só abre com soltura no ar, e o pulo zera a janela.
- **Snap na quina podia descartar um acerto válido** (fora de alcance) → cai para o ponto direto.
- **Retículo desalinhado 4–6° da mira em velocidade** → *feed-forward* exato na suavização do pivô.
- **Animação:**
  - braço da teia estalava no anexo e na soltura → peso suavizado;
  - entrada do flip sem crossfade → as juntas misturam;
  - animador usava tempo real (corria na pausa, deslizava no slowmo) → usa o tempo da simulação;
  - flip em degraus a 144 Hz → progresso interpolado;
  - orientação do corpo → função pura e testada (`orientation.ts`).
- **Input:**
  - tecla segurada ao retomar só valia após o auto-repeat → as teclas são registradas sempre;
  - soltar e reapertar dentro de um tick se perdia → fila de bordas do botão.
- **Render:**
  - `InstancedMesh.dispose()` faltando;
  - DPR fixo (zoom e troca de monitor) → atualizado no resize e via `matchMedia`;
  - sombra "nadando" → foco alinhado à grade de texels, com a luz mais distante (cobre as torres de 120 m).
- **Dev tools:**
  - chunks de dev no `dist/` → removidos (`DEV && flag`);
  - F1/F2 duplicavam no duplo toque;
  - auto-repeat do F3;
  - `.` digitado no lil-gui avançava tick;
  - gravação F9 com config errada → `reproducible` + `loadReplay`.
- **Overlay:** foco no botão, `role="dialog"`, `aria-live` e aviso quando o navegador recusa o pointer lock.
- **Testes que passavam pelo motivo errado** (soltura por parede, colisão contra corda) → reescritos e checados por mutação.
- **Tuning recalibrado com medições** (ADR-016). O 1º swing a partir do repouso (~29 m/s, acima da meta original de 18–22) foi **aceito** em 2026-09-24 (PRD §7).

### Medições
- **Testes:** 119 (Vitest), todos verdes.
- **Bundle de produção:** `index.js` 569,9 kB → **149,2 kB gzip** (orçamento: 250 kB). O `dist/` só tem o jogo; as ferramentas de dev não entram.
- **Draw calls:**
  - na partida (L1, boneco + sombras): ~30. As peças pequenas do boneco não projetam sombra.
  - em `?cam=free` (aceite da 1A): só a cidade.
- **Feel** (`npm run feel`): L1 em 31,6 s, cruzeiro de 32,8 m/s, 0 toques na rua, 0 bonks; os 5 níveis foram concluídos.

### Corrigido durante o desenvolvimento
- Tranco de 60 m/s no anexo: o reel encurtava a corda de uma vez; agora encurta por subpasso, com rampa (ADR-008).
- Perda de 9% de energia por meio período no pêndulo a 60 Hz → ~2% com subpassos (ADR-008).
- Swings jogavam o jogador contra as fachadas → âncora virtual (ADR-009).
- Último prédio de cada lado podia invadir a parede de fechamento do nível.
- Moiré das janelas ao longe → padrão com `fwidth`.
