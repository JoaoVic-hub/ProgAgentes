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
| 0.1 | `npm run verify` | Typecheck, build e testes verdes (119 testes). |
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
- 1º swing a partir do repouso de 18–22 m/s: ⚠️ medido ~29, **decisão pendente** (PRD §7). Diga se o arranque parece forte demais.

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

## Verificação automatizada feita no desenvolvimento

| Data | Ambiente | O que foi verificado | Resultado |
|---|---|---|---|
| 2026-09-24 | Node 24 / Vitest 2.1.9 | `npm run verify` (119 testes, typecheck, build) | ✅ |
| 2026-09-24 | Revisão adversarial (3 lentes) | 30 achados brutos; os confirmados foram corrigidos, com testes (ver CHANGELOG) | ✅ |
| 2026-09-24 | Chrome headless (puppeteer-core, SwiftShader) | Overlay; pointer lock obtido pelo clique; mira direta na fachada; swing de 21 → 31 m/s; soltura + flip; pouso; F1; `?cam=free&level=5`; `?view=pose` (swing, run). Console sem erros. | ✅ (o FPS headless não é representativo; o Esc não pode ser testado headless) |
| 2026-09-24 | `npm run feel` | L1–L5 concluídos pelo piloto automático. L1: 31,6 s, cruzeiro de 32,8 m/s, 0 toques na rua, 0 bonks. | ✅ (1º swing acima da meta: pendente) |

## Registro da verificação manual

| Data | Navegador | Etapa | Resultado | Observações |
|---|---|---|---|---|
| | Chrome | 0–1D | | |
| | Firefox | 0–1D | | |
| | Edge | 0–1D | | |
