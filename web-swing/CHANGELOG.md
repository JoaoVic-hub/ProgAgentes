# Changelog — web-swing

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
