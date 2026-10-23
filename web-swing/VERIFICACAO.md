# Verificação — web-swing

Roteiro para conferir cada etapa no navegador.

- **Antes de começar:** rode `npm install` (uma vez) e `npm run verify`, que precisa ficar verde.
- **Servidor:** `npm run dev`, depois abra o endereço que o Vite mostrar (normalmente `http://localhost:5173/`).
- **Registro:** anote o resultado na tabela do fim (data, navegador, ok/falha e observações).

> Dica: `?debug=1` mostra o FPS e o painel de números. Dá para combinar flags: `?debug=1&level=3`.

---

## Etapa 0 — Fundação

| # | Faça | Deve acontecer |
|---|---|---|
| 0.1 | `npm run verify` | Typecheck, build e testes verdes (172 testes). |
| 0.2 | Abra a página e redimensione a janela | A cena não distorce e não aparece barra de rolagem. |
| 0.3 | Abra o DevTools → Console | Nenhum erro. |
| 0.4 | `?debug=1` | Medidor de FPS no canto (≈ 60 num PC comum) e painel de texto. |

## Etapa 1A — Campo do jogo

| # | Faça | Deve acontecer |
|---|---|---|
| 1A.1 | `?cam=free` | Vista de cima da avenida. Arraste com o botão esquerdo para andar, use o direito para girar e a roda para zoom. |
| 1A.2 | Voe até o fim (≈ 800 m no L1) | Arco vermelho "CHEGADA" atravessando a avenida. |
| 1A.3 | `?cam=free&level=1` … `level=5` | Cada nível é diferente: mais longo, mais largo, alturas mais variadas e mais prédios de **vidro** (verde-azulados, com grade). |
| 1A.4 | Recarregue o mesmo `?level=3` | A cidade é idêntica (seed fixa). Com `&seed=7`, a cidade muda. |
| 1A.5 | `?cam=free&debug=1`, aperte **F1** | Wireframes coloridos batendo com os prédios (verde-água = prédio, azul = vidro, vermelho = parede invisível). |
| 1A.6 | Olhe as fachadas ao longe | Janelas sem "chuvisco" (moiré). |
| 1A.7 | `?cam=free&debug=1` no L1 | "draw calls" ≤ 20 (em `?cam=free` só a cidade é desenhada). |

## Etapa 1B — Movimento, controlador e câmera

| # | Faça | Deve acontecer |
|---|---|---|
| 1B.1 | Abra sem flags e clique em "Clique para jogar" | O cursor some (pointer lock) e o mouse gira a câmera. |
| 1B.2 | `W A S D` | O boneco anda na direção da câmera, na mesma velocidade na diagonal. |
| 1B.3 | `Espaço` | Pula. Um pulo logo depois de sair de uma beirada ainda vale. Apertado logo antes de pousar, pula ao pousar. |
| 1B.4 | Ande de encontro a um prédio | Para na parede e desliza ao longo dela, sem atravessar. |
| 1B.5 | Encoste a câmera numa parede (vire de costas para um prédio) | A câmera se aproxima do boneco em vez de atravessar a parede. |
| 1B.5b | Ande colado numa fachada que fique à sua **direita** e mire um prédio atrás dela | A câmera não entra no prédio e a teia não gruda "através" da parede. |
| 1B.6 | `Esc` | Aparece "Pausado — clique para continuar". O boneco para de animar. Ao clicar, volta **sem** disparar teia e sem salto de câmera. Clicando logo após o Esc, o Chrome recusa: aparece o aviso para clicar de novo. |
| 1B.6b | Segure `W`, aperte `Esc` e clique em continuar sem soltar o `W` | O boneco volta a andar na hora. |
| 1B.7 | `?debug=1&slowmo=0.25` | Tudo em câmera lenta e ainda suave. **F3** congela, `.` avança um tick. |
| 1B.8 | Monitor de 120/144 Hz (se tiver) | O movimento continua suave (interpolação). |

## Etapa 1C.1 — Teia (núcleo)

| # | Faça | Deve acontecer |
|---|---|---|
| 1C.1 | Mire num prédio | Retículo ○ e um anel no ponto exato da fachada/quina. Mirando para o céu: ✕. |
| 1C.2 | Mire num prédio muito distante / num prédio de vidro | ✕ com "fora de alcance" / "vidro não segura teia". |
| 1C.3 | Da rua, segure o clique mirando numa quina à frente | Pulinho + puxão. A teia sai da mão até o prédio e o boneco balança **sem raspar a rua**. |
| 1C.4 | Solte perto do alto do arco, subindo | É lançado para a frente (boost). |
| 1C.5 | Encadeie 5 balanços alternando os lados | Fluxo contínuo, sem bater nas fachadas. |
| 1C.6 | Com a teia presa há mais de ~0,35 s, aperte `Espaço` | Um impulso. Um segundo `Espaço` na mesma teia não faz nada. |
| 1C.6b | Clique muito rápido várias vezes + `Espaço` | **Não** dá para "voar": toques curtos não rendem boost, flip nem impulso. |
| 1C.7 | `W` na descida / `S` | Bombeia (ganha velocidade) / freia. |
| 1C.8 | `?debug=1`, F1 durante o swing | Linha azul = corda física (âncora virtual); rosa = deslocamento até o contato; verde = velocidade. |
| 1C.9 | `?debug=1`, F2 | Painel de tuning (lil-gui). Mudar `web → pump` altera o swing na hora. "Copiar JSON" copia a config. |
| 1C.10 | `?record=1`, jogue um pouco e aperte F9 | Baixa `web-swing-L1-t….json` com os inputs. |

**Metas de feel do plano** (confira no painel `?debug=1`; `npm run feel` mede isso automaticamente):
- cruzeiro de 25–35 m/s: ✅ medido 32,8;
- concluir o L1 sem tocar a rua: ✅;
- 1º swing a partir do repouso: ✅ medido ~29 m/s (meta revisada de 18–22 para ~29, decisão de 2026-09-24; PRD §7).

## Etapa 1C.2 — Assistência de mira e manobras

| # | Faça | Deve acontecer |
|---|---|---|
| 1C2.1 | Mire um pouco acima (céu) de uma quina de telhado | O retículo fica azul (assistência) e o anel vai para a quina. |
| 1C2.2 | Varra a mira devagar entre dois prédios | O alvo não "pisca" de um para o outro (histerese). |
| 1C2.3 | Clique no céu e, em seguida (< 0,15 s), passe a mira por um prédio | A teia prende assim mesmo (buffer). |
| 1C2.4 | Solte a teia **no ar** e aperte `Espaço` logo em seguida | Flip (cambalhota para a frente). Um segundo `Espaço` não repete o flip. Soltando no chão, pular e apertar `Espaço` **não** faz flip. |
| 1C2.5 | Suba acima do ponto da teia segurando o clique | A teia solta sozinha. |
| 1C2.6 | `?debug=1` após alguns minutos jogando | "sem alvo" < 10% dos cliques. |

## Etapa 1D — Boneco e animações

| # | Faça | Deve acontecer |
|---|---|---|
| 1D.1 | `?view=pose`, teclas 1–8 | idle, run, jump, fall, swing, flip, land e bonk. Nenhum joelho ou cotovelo dobrado ao contrário. |
| 1D.2 | Jogando: parado → correr → pular → cair → pousar | Transições suaves, sem "estalos". Agacha no pouso forte. Com `?slowmo=0.25`, os pés não deslizam (a animação fica lenta junto). |
| 1D.3 | Durante o swing | O corpo inclina para a teia e o braço direito aponta para o ponto da teia. Ao anexar e ao soltar, o braço **transiciona** (sem estalo). |
| 1D.4 | Flip | Uma volta completa para a frente, sem "desgirar" no fim. |
| 1D.5 | Bata numa parede em alta velocidade | Pose de bonk (braços se debatendo) por ~0,4 s, e a teia solta. |

---

## Etapa 2 — Contra o relógio, impulso e mísseis

> A primeira versão da Etapa 2 (anéis, combo de pontos, vidas) ficou no checkpoint `web-swing-v0.2.0-aneis` e não vale mais. Este é o roteiro do redesenho.

### 2A — Relógio, impulso e HUD

| # | Faça | Deve acontecer |
|---|---|---|
| 2A.1 | Clique para jogar | "Nível 1 — Avenida Aurora", a contagem 3-2-1 e, embaixo, as metas: "★★★ 0:25.00 · ★★ 0:32.00" (e o recorde, se houver). Durante a contagem dá para olhar em volta, mas não para andar, e o cronômetro fica em 0:00.00. |
| 2A.2 | Depois do "Já!" | O cronômetro corre (alto à esquerda) e embaixo dele aparece "★★★ até 0:25.00". Passado o ouro, vira "★★ até 0:32.00"; passada a prata, só "★". |
| 2A.3 | Faça um swing e solte subindo (~35°) | Popup "Swing" (ou "Soltura perfeita!" em dourado). O 1º segmento do medidor de **Impulso** (alto à direita) enche até a metade (ou inteiro na perfeita). |
| 2A.4 | Solte e aperte Espaço logo em seguida (flip) | "Flip!" e mais meio segmento. Ao completar um segmento: "… Impulso ×N!". |
| 2A.5 | Encadeie 6–8 swings com flips sem tocar a rua | O impulso chega a ×3–×5, o medidor muda de cor (verde → amarelo → laranja) e a velocidade (m/s) dos arcos sobe perceptivelmente (≥ 40 m/s). "combo N" conta os acertos. |
| 2A.6 | Clique no céu (✕) | "Teia no vazio" e meio segmento a menos. |
| 2A.7 | Pouse na rua e fique parado | "Tocou a rua — impulso pela metade". Um raspão rápido (< 0,15 s) não perde nada. |
| 2A.8 | Com impulso, fique 3 s sem manobras (ou parado num telhado) | O impulso escorre aos poucos ("Impulso esfriando" a cada nível perdido). |
| 2A.9 | Solte a teia e, depois que a janela do flip passou, aperte Espaço no ar | "Flip atrasado" e um quarto de segmento a menos. |

### 2B — Mísseis

| # | Faça | Deve acontecer |
|---|---|---|
| 2B.1 | No L1, balance até ~70 m da largada | Num telhado à frente, um **lançador** vira para você: laser vermelho até o seu peito e uma lâmpada piscando cada vez mais rápido. Uma seta **âmbar** aparece em volta do retículo apontando para ele. |
| 2B.2 | Espere o aviso terminar | Sai um míssil (brilho laranja + rastro de fumaça) que sobe e depois vem atrás de você. A seta **vermelha** acompanha o míssil, mesmo quando ele está atrás (embaixo do retículo). |
| 2B.3 | Deixe o míssil chegar e, a ~10 m, corte para o lado | Ele passa reto e faz a curva tarde. Se chegar muito perto, o anel em volta do retículo pulsa em vermelho. |
| 2B.4 | Deixe um míssil acertar | Explosão, flash vermelho nas bordas da tela, "Atingido!", a teia solta, o herói é empurrado e fica atordoado ~0,6 s (medidor tremendo). O impulso cai para 1/4. Por 1,5 s outro míssil não acerta. |
| 2B.5 | Passe por trás de um prédio com um míssil atrás de você | O míssil bate na fachada e explode (a cidade serve de cobertura). Um lançador sem linha de visada não dispara (o laser some). |
| 2B.6 | Compare `?level=1` com `?level=4` e `?level=5` (use **J** com `?debug=1` para avançar) | L4/L5: mais lançadores, salvas de 2–3 mísseis, mísseis mais rápidos que fazem curvas mais fechadas e preveem o seu movimento, e fogo cruzado dos dois lados. Desviar exige reverter a direção no tempo certo e manter velocidade alta. |
| 2B.7 | `?god=1` | Mísseis passam por você sem acertar (run não ranqueado). |

### 2C — Campanha, vãos e estrelas

| # | Faça | Deve acontecer |
|---|---|---|
| 2C.1 | Cruze o arco de chegada | Resumo: "Nível concluído!" (ou "Novo recorde!"), o tempo, as estrelas, a diferença para o recorde (verde se melhorou), quanto faltou para a próxima estrela, impulso máximo, perfeitas/flips, mísseis levados/quedas e o tempo da campanha. `Enter` leva ao nível 2. |
| 2C.2 | Passe por um checkpoint (faixa verde na rua) | Popup "Checkpoint N · m:ss.cc" com o tempo parcial. |
| 2C.3 | `?level=3` e caia no vão (sem chão, água lá embaixo) | "Caiu! Voltando ao checkpoint — o relógio continua correndo…", e em ~1,2 s reaparece parado no último checkpoint, com o impulso zerado. O cronômetro não para. Os mísseis em voo somem. |
| 2C.4 | Nos vãos, use as gruas (torres amarelas) | A teia prende nas gruas e dá para atravessar sem cair. Sobre os vãos pode haver lançador no topo de uma grua. |
| 2C.5 | `?level=5&god=1` e aperte **N** | Resumo do L5 → `Enter` → **Campanha completa!** com o tempo total e as estrelas (run não ranqueado). |
| 2C.6 | Atalhos `?debug=1`: **J**, **K** e **R** | J avança 60 m (no ar). K simula um acerto de míssil. R volta ao checkpoint. O painel passa a dizer "NÃO ranqueado". |

### 2D — Recordes

| # | Faça | Deve acontecer |
|---|---|---|
| 2D.1 | Jogue **sem flags** do L1 ao L5 | "Campanha completa!" → "Novo recorde! Seu nome:" → digite e salve → o nome aparece destacado na tabela de **tempos** (menor primeiro). |
| 2D.2 | Aperte F5 e jogue de novo o L1 | O HUD e a contagem mostram "recorde m:ss.cc" do L1. Ao terminar, o resumo mostra a diferença. |
| 2D.3 | DevTools → Application → Local Storage → mude `web-swing:v1:save` para `{lixo` e recarregue | O jogo abre normalmente, com a tabela vazia, e o valor ruim fica guardado em `web-swing:v1:save.bak`. |
| 2D.4 | Com um save da versão por anéis (v1) no storage, recarregue | A tabela recomeça (pontos não são tempos), o melhor tempo por nível é aproveitado e o save antigo vai para o `.bak`. |
| 2D.5 | Abra numa aba anônima | Sem erros. Se o navegador bloquear o storage, o placar avisa que os recordes valem só nesta aba. |
| 2D.6 | Termine com uma flag de jogo (`?god=1`…) ou começando fora do L1 (`?level=2`) | O placar avisa que o run não entra na tabela geral e não pede nome. |
| 2D.7 | `?resetScores=1` | Os recordes somem. |

## Etapa 3 — Telas

| # | Faça | Deve acontecer |
|---|---|---|
| 3.1 | Abra o jogo (sem flags) | Título "Web Swing" à esquerda, com Jogar campanha / Selecionar nível / Recordes / Como jogar. Ao fundo, a demonstração: o herói balançando pelo L1 (há "demonstração" no canto). O HUD não aparece. |
| 3.2 | Como jogar → `Esc`; Recordes → Voltar | Cada tela abre e volta ao título. Os recordes mostram a tabela de campanhas e o melhor por nível. |
| 3.3 | Selecionar nível | 5 cartões; só o 1 (e os seguintes a um nível concluído) abre. Os bloqueados dizem "conclua o nível N". As teclas 1–5 escolhem. |
| 3.4 | Jogar campanha | O mouse é capturado no mesmo clique, começa o countdown do L1 e **nenhuma teia** é disparada pelo clique. |
| 3.5 | `Esc` durante o jogo | Menu "Pausado" com o tempo. Continuar volta a jogar. Se o navegador recusar o mouse (Esc e clique rápidos demais), aparece o aviso e dá para clicar de novo. |
| 3.6 | Pausa → Reiniciar nível | O nível recomeça do countdown. O tempo da tentativa abandonada continua na campanha (a pausa seguinte mostra "campanha"). |
| 3.7 | Conclua um nível | Tela de resultados com o mouse livre: tempo, estrelas, "vs. recorde", "faltou … s", estatísticas. Enter = Próximo nível; R = Tentar de novo; Menu principal volta ao título. |
| 3.8 | Conclua o L5 (ou `?level=5&god=1` + Continuar + N) → "Ver resultado da campanha" | "Campanha completa!" com tempo total e estrelas por nível. Numa campanha ranqueada do L1 que entra no top 10, pede o nome e depois mostra os recordes com o nome destacado. |
| 3.9 | Vá do título ao título por vários caminhos (pausa → Menu, resultados → Menu, fim de campanha → Menu) | Nunca fica preso numa tela. Ao voltar ao título, a demonstração recomeça. |
| 3.10 | Primeiros segundos de cada nível | Sem travada ao ver o primeiro míssil/explosão (os shaders já foram compilados). |

## Etapa 4 — Áudio, partículas e "juice"

> Use fones ou caixas. O Chrome headless não toca áudio: esta parte só uma pessoa verifica.

| # | Faça | Deve acontecer |
|---|---|---|
| 4.1 | Abra o jogo e fique no título | Silêncio (a demonstração é muda e o áudio ainda não existe). Na demonstração aparecem poeira ao agarrar as fachadas e anéis de brilho ao subir de impulso. |
| 4.2 | Clique em qualquer botão do menu | Um "tic" curto. |
| 4.3 | Jogar campanha | Bipe em 3, 2, 1 e um bipe mais agudo no "Já!". |
| 4.4 | Prenda a teia, solte subindo, faça o flip | "Thwip" ao prender (com uma nuvenzinha na fachada), sopro ao soltar e ao fazer o flip. A cada ganho de impulso, um "plim" **cada vez mais agudo**; ao subir de nível, um arpejo, um anel de brilho em volta do herói e o retículo brilhando dourado na soltura perfeita. |
| 4.5 | Erre (clique no céu), toque a rua, bata numa parede | Clique seco no vazio; som descendente ao perder impulso; baque + faíscas + tremor no bonk; poeira ao pousar forte. |
| 4.6 | Ganhe velocidade (impulso ×4–×5) | O vento cresce e fica mais brilhante; riscos (speed lines) surgem nas bordas; a câmera inclina levemente (≤ 3°) nas curvas. |
| 4.7 | Aproxime-se dos lançadores | Bipe duplo no aviso (laser); sopro no disparo; com um míssil chegando perto, bipes cada vez mais rápidos; explosões mais fracas quando longe. |
| 4.8 | Leve um míssil (ou **K** com `?debug=1`) | Estrondo com zumbido no ouvido, faíscas e fumaça, tremor forte que passa em < 1 s, flash vermelho e "Atingido!". |
| 4.9 | Checkpoint, queda num vão, fim do nível, fim da campanha | Plim duplo; assobio descendente; arpejo de chegada; fanfarra da campanha. |
| 4.10 | Aperte **M** duas vezes e recarregue a página | "Som desligado (M)" / "Som ligado (M)"; depois de recarregar, a última escolha continua valendo. |
| 4.11 | Ative "reduzir movimento" no sistema (Windows: Configurações → Acessibilidade → Efeitos visuais → Efeitos de animação desligado) e jogue | Sem tremor, sem inclinação e sem speed lines. Sons e partículas continuam. |

## Verificação automatizada feita no desenvolvimento

| Data | Ambiente | O que foi verificado | Resultado |
|---|---|---|---|
| 2026-09-24 | Node 24 / Vitest 2.1.9 | `npm run verify` (119 testes, typecheck, build) | ✅ |
| 2026-09-24 | Revisão adversarial (3 lentes) | 30 achados brutos; os confirmados foram corrigidos, com testes (ver CHANGELOG) | ✅ |
| 2026-09-24 | Chrome headless (puppeteer-core, SwiftShader) | Overlay; pointer lock obtido pelo clique; mira direta na fachada; swing de 21 → 31 m/s; soltura + flip; pouso; F1; `?cam=free&level=5`; `?view=pose` (swing, run). Console sem erros. | ✅ (o FPS headless não é representativo; o Esc não pode ser testado headless) |
| 2026-09-24 | `npm run feel` | L1–L5 concluídos pelo piloto automático. L1: 31,6 s, cruzeiro de 32,8 m/s, 0 toques na rua, 0 bonks. | ✅ |
| 2026-09-24 | Etapa 2: `npm run verify` | 172 testes (pontuação, progressão, alcançabilidade, recordes, save, replay dourado) + build 158,6 kB gzip | ✅ |
| 2026-09-24 | Etapa 2: Chrome headless | Countdown com nome do nível → HUD somando (330 pts, ×1,5) → N → resumo com estrelas → Enter → L2 → 3×K → fim de jogo com o mouse liberado e placar (recorde persistido visível, aviso de run de teste) → save corrompido sem erro e com backup → formulário de nome recebe foco e envia. Console sem erros. | ✅ |
| 2026-09-24 | Etapa 2: `npm run feel` (god mode) | L1–L5 concluídos; 2 quedas nos vãos do L5. | ✅ |
| 2026-09-24 | Etapa 2 (redesenho): `npm run verify` | 196 testes (impulso, mísseis e desviabilidade por fase, progressão contra o relógio, radar, recordes por tempo, migração v1 → v2, replay dourado com mísseis) + build 165 kB gzip | ✅ |
| 2026-09-24 | Etapa 2 (redesenho): Chrome headless | Save v1 migrado com backup → contagem com metas e recorde migrado (0:30.00) → HUD com cronômetro, "★★★ até", velocidade e impulso (×1, combo 2 após swings e flips) → J: lançador mirando (laser + lâmpada visíveis, seta âmbar), míssil com rastro, seta vermelha → N → resumo com tempo, ★★★, "vs. recorde −17.51" → Enter → L2 → `?level=5&god=1` + N + Enter → "Campanha completa!" com o mouse liberado → save corrompido sem erro e com backup → formulário de nome recebe foco e envia. Console sem erros. | ✅ |
| 2026-09-24 | Etapa 4: `npm run verify` | 223 testes (mapeamentos de áudio, juice da câmera, pool de partículas) + build 178,6 kB gzip | ✅ |
| 2026-09-24 | Etapa 4: Chrome headless | Título sem contexto de áudio (`none`) → "Jogar" cria o contexto (`running`) → cues: ui, countdown ×3, go → swings: thwip, release, flip, gain, land, loss → K: hit (faíscas + "Atingido!") → J + queda: speed lines aparecem acima de 30 m/s → lançadores: warn e launch → M: mudo + aviso "Som desligado (M)", M de novo: som de volta, salvo no storage → N: finish. Speed lines com intensidade máxima conferidas em captura. Console sem erros. | ✅ (o áudio em si não é audível headless) |
| 2026-09-24 | Etapa 3: `npm run verify` | 207 testes (tabela completa de telas, demonstração, relógio de campanha que não volta) + build 173 kB gzip | ✅ |
| 2026-09-24 | Etapa 3: Chrome headless | Título com a demonstração andando e sem HUD → Como jogar (Esc volta) → Recordes → Seleção (L1/L2 livres, 3–5 bloqueados; tecla 3 ignorada) → Jogar campanha (lock no clique, 0 teias) → countdown com metas e recorde → perda do lock → pausa → Continuar → Reiniciar (campanha +1,58 s) → N → resultados com o mouse livre → R → N → Próximo nível (L2) → Menu (demonstração volta) → `?level=5&god=1` → Continuar → N → Ver resultado → "Campanha completa!" → Menu → formulário de nome (foco, envio) e destaque nos recordes. Console sem erros. | ✅ |
| 2026-09-24 | Etapa 2 (redesenho): `npm run feel` | L1–L5 concluídos nos 3 modos (sem flip/god, flip/god, flip levando mísseis); mísseis por nível 3/5/14/12/30, acertos 0/1/2/3/6 (o piloto não desvia). | ✅ |

## Registro da verificação manual

| Data | Navegador | Etapa | Resultado | Observações |
|---|---|---|---|---|
| | Chrome | 0–1D | | |
| | Firefox | 0–1D | | |
| | Edge | 0–1D | | |
| | Chrome | 2A–2D (redesenho) | | |
| | Firefox | 2A–2D (redesenho) | | |
| | Edge | 2A–2D (redesenho) | | |
| | Chrome | 3 | | |
| | Firefox | 3 | | |
| | Edge | 3 | | |
| | Chrome | 4 | | |
| | Firefox | 4 | | |
| | Edge | 4 | | |
