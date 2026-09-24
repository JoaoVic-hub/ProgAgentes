/**
 * Contratos de dados compartilhados entre as camadas (só tipos).
 *
 * render/, input/ e ui/ importam daqui com `import type`. Todo estado é
 * plain-object serializável (Princípio III): nada de classes, Map ou Set.
 */

import type { Vec3 } from './math/vec3';

export type { Vec3 } from './math/vec3';

// ---------------------------------------------------------------- mundo

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

/**
 * street   — laje da rua (chão; não ancora)
 * building — prédio comum (ancora)
 * glass    — prédio de vidro (colide, bloqueia a mira, NÃO ancora)
 * crane    — torre de guindaste nos vãos sem chão (ancora; o apoio sobre o vão)
 * bounds   — parede invisível nos limites do nível (colide, não bloqueia a mira)
 */
export type SolidKind = 'street' | 'building' | 'glass' | 'crane' | 'bounds';

export interface Solid {
  readonly id: number;
  readonly box: Aabb;
  readonly kind: SolidKind;
  readonly anchorable: boolean;
  /** Lado da avenida (-1 esquerda, +1 direita, 0 = não se aplica). */
  readonly side: -1 | 0 | 1;
}

export type Range = readonly [min: number, max: number];

/** Trecho da avenida ao longo de Z (ex.: um vão sem chão). */
export interface ZRange {
  readonly start: number;
  readonly end: number;
}

/** Anel coletável: disco que o jogador precisa atravessar. */
export interface Ring {
  readonly id: number;
  readonly center: Vec3;
  /** Normal unitária do disco (sentido de passagem). */
  readonly normal: Vec3;
  readonly radius: number;
  readonly gold: boolean;
  /** Em rota arriscada: baixo, perto da rua, ou sobre um vão. */
  readonly risky: boolean;
}

export interface Checkpoint {
  /** 1..n (0 é a largada). */
  readonly index: number;
  readonly z: number;
  /** Onde o jogador reaparece (parado, na rua). */
  readonly spawn: Vec3;
}

/** Parâmetros declarativos de um nível; o gerador puro produz o Level. */
export interface LevelSpec {
  readonly index: number;
  readonly name: string;
  readonly seed: number;
  /** Distância do início (z = 0) até a linha de chegada. */
  readonly length: number;
  readonly avenueWidth: number;
  readonly buildingHeight: Range;
  /** Comprimento do prédio ao longo da avenida (eixo Z). */
  readonly buildingLength: Range;
  /** Profundidade do prédio para fora da avenida (eixo X). */
  readonly buildingDepth: Range;
  /** Vão (beco) entre prédios consecutivos do mesmo lado. */
  readonly spacing: Range;
  /** Recuo da fachada em relação ao meio-fio. */
  readonly setback: Range;
  /** Probabilidade de um prédio ser de vidro (nunca dois seguidos no mesmo lado). */
  readonly glassRatio: number;
  /** Vãos sem chão (com gruas para ancorar). */
  readonly voids: { readonly count: number; readonly length: Range };
  readonly rings: {
    readonly count: number;
    readonly gold: number;
    readonly radius: number;
    /** Fração dos anéis em rota arriscada (os dourados sempre são). */
    readonly riskyRatio: number;
  };
  /** Fração mínima de anéis para concluir o nível (cota). */
  readonly minRingRatio: number;
  readonly checkpoints: number;
  /** Pontuação do nível para a 3ª estrela. */
  readonly parScore: number;
}

/** Índice espacial em faixas de Z: cells[i] lista ids de sólidos que tocam a faixa i. */
export interface Broadphase {
  readonly zOrigin: number;
  readonly cellSize: number;
  readonly cells: readonly (readonly number[])[];
}

export interface Level {
  readonly spec: LevelSpec;
  /** Seed efetivamente usada (a da spec ou a de ?seed=). */
  readonly seed: number;
  /** Ordenados por box.min.z; solids[i].id === i. */
  readonly solids: readonly Solid[];
  readonly broadphase: Broadphase;
  /** Posição inicial dos pés do jogador. */
  readonly start: Vec3;
  readonly finishZ: number;
  /** Abaixo desta altura o jogador "caiu do nível". */
  readonly killY: number;
  /** Limites do mundo jogável em X (fachadas externas + margem). */
  readonly halfWorldWidth: number;
  /** Vãos sem chão, em ordem de Z. */
  readonly voids: readonly ZRange[];
  readonly rings: readonly Ring[];
  /** Em ordem de Z (index 1..n). */
  readonly checkpoints: readonly Checkpoint[];
  /** Anéis mínimos para concluir o nível. */
  readonly ringQuota: number;
}

// ---------------------------------------------------------------- configuração
// Durações em segundos (convertidas para ticks com tickHz) para que ?hz=120
// não mude a sensação do jogo. Valores padrão em logic/config.ts.

export interface PhysicsConfig {
  readonly gravity: number;
  readonly runMax: number;
  readonly runAccel: number;
  readonly runDecel: number;
  readonly airAccel: number;
  /** Controle aéreo só acelera até esta velocidade horizontal na direção desejada. */
  readonly airMaxSpeed: number;
  /** Arrasto quadrático: a = −k·|v|·v. */
  readonly airDragQuad: number;
  readonly terminalFall: number;
  readonly maxSpeed: number;
  readonly jumpSpeed: number;
  readonly coyoteTime: number;
  readonly jumpBufferTime: number;
  readonly halfWidth: number;
  readonly height: number;
  /** Velocidade contra a parede acima da qual há "bonk" (solta a teia, atordoa). */
  readonly bonkSpeed: number;
  readonly bonkStunTime: number;
  readonly bonkKeep: number;
  /** Degrau máximo que o jogador sobe automaticamente ao bater num beiral. */
  readonly ledgeAssist: number;
  /** Subpasso máximo da varredura de colisão (anti-túnel). */
  readonly maxSubstep: number;
}

export interface WebConfig {
  readonly maxRange: number;
  readonly minRope: number;
  /** A âncora precisa estar pelo menos isto acima do ponto de fixação (peito). */
  readonly minAnchorAbove: number;
  /** Altura do ponto de fixação da teia acima dos pés. */
  readonly attachHeight: number;
  /** Folga mínima entre os pés e a rua no fundo do arco (define Ltarget). */
  readonly streetClearance: number;
  readonly autoReel: number;
  /** Reel da teia lançada do chão: rápido o bastante para o 1º arco não raspar a rua. */
  readonly groundReel: number;
  /** Tempo para o auto-reel chegar à velocidade plena após o anexo (evita tranco). */
  readonly reelRampTime: number;
  readonly steer: number;
  readonly pump: number;
  readonly swingAssist: number;
  readonly brake: number;
  readonly swingMaxSpeed: number;
  readonly impulse: number;
  readonly releaseMinSpeed: number;
  readonly releaseBoostMin: number;
  readonly releaseBoostMax: number;
  readonly releaseUpBoost: number;
  readonly releaseIdealAngleDeg: number;
  readonly releaseAngleToleranceDeg: number;
  readonly perfectQuality: number;
  /** Solta sozinho se o ponto de fixação passar desta altura acima da âncora. */
  readonly autoReleaseAboveAnchor: number;
  /** Solta sozinho após este tempo encostado numa parede. */
  readonly wallReleaseTime: number;
  readonly flipWindowTime: number;
  readonly flipDuration: number;
  readonly flipUpSpeed: number;
  readonly flipForwardBoost: number;
  /** Subpassos da integração da corda dentro do tick (reduz a dissipação do PBD). */
  readonly ropeSubsteps: number;
  /** Fração da distância lateral (X) entre contato e jogador que a âncora física anda em direção ao jogador. */
  readonly lateralPull: number;
  /** Ao anexar a teia estando no chão, o jogador ganha pelo menos esta velocidade para cima (não raspa a rua). */
  readonly groundAttachHop: number;
  /** Teia presa por menos que isto não dá boost na soltura, não abre o flip e não permite impulso (anti-spam de cliques). */
  readonly minSwingTime: number;
  /** Perto do comprimento-alvo o reel desacelera: velocidade ≤ reelSlowdown·(L − alvo). */
  readonly reelSlowdown: number;
}

export interface AimConfig {
  /** Acerto na fachada até esta distância abaixo do topo "sobe" para a quina do telhado. */
  readonly snapToTop: number;
  readonly assistEnabled: boolean;
  readonly coneDeg: number;
  readonly fallbackConeDeg: number;
  readonly preferredDistance: number;
  readonly hysteresisDeg: number;
  /** O alvo só troca se o novo for pelo menos esta fração melhor. */
  readonly switchImprovement: number;
  /** Clique sem alvo fica "pendente" por este tempo esperando um alvo aparecer. */
  readonly bufferTime: number;
  /** Nunca ancora a mais que isto (em graus) da direção para onde se olha (no plano). */
  readonly maxBehindDeg: number;
}

export interface CameraRigConfig {
  readonly pivotHeight: number;
  readonly shoulderOffset: number;
  readonly pitchMinDeg: number;
  readonly pitchMaxDeg: number;
}

export interface ScoringConfig {
  readonly ringBase: number;
  readonly goldRingBase: number;
  /** Folga além do raio do anel para contar a passagem. */
  readonly ringSlack: number;
  /** Velocidade (m/s) para +50% e +100% nos pontos do anel. */
  readonly speedBonusHalf: number;
  readonly speedBonusFull: number;
  /** A cada chainPerStep eventos de estilo o multiplicador sobe multiplierStep, até maxMultiplier. */
  readonly chainPerStep: number;
  readonly multiplierStep: number;
  readonly maxMultiplier: number;
  readonly swingPoints: number;
  readonly swingMinSpeed: number;
  readonly perfectPoints: number;
  readonly flipPoints: number;
  readonly flipAfterPerfectPoints: number;
  readonly speedStreakSpeed: number;
  readonly speedStreakTime: number;
  readonly speedStreakPoints: number;
  /** Tempo sem evento de estilo/anel até o combo quebrar. */
  readonly comboTimeout: number;
  /** Tempo apoiado na rua / num teto até o combo quebrar. */
  readonly streetGrace: number;
  readonly roofGrace: number;
  readonly allRingsBonus: number;
  readonly noStreetBonus: number;
  /** Fração de anéis para a 2ª estrela. */
  readonly twoStarRingRatio: number;
}

export interface ProgressionConfig {
  readonly lives: number;
  readonly countdownTime: number;
  readonly respawnTime: number;
}

export interface GameConfig {
  readonly tickHz: number;
  readonly physics: PhysicsConfig;
  readonly web: WebConfig;
  readonly aim: AimConfig;
  readonly rig: CameraRigConfig;
  readonly scoring: ScoringConfig;
  readonly progression: ProgressionConfig;
}

// ---------------------------------------------------------------- input

/** Intenção do jogador num tick (normalizada pela camada input/). */
export interface InputFrame {
  /** +1 = direita (D), −1 = esquerda (A). */
  readonly moveX: -1 | 0 | 1;
  /** +1 = frente (W), −1 = trás (S). */
  readonly moveZ: -1 | 0 | 1;
  /** Look absoluto em radianos; yaw = 0 olha para +Z. */
  readonly yaw: number;
  readonly pitch: number;
  readonly webHeld: boolean;
  /** Borda: Espaço foi pressionado desde o tick anterior. */
  readonly jumpPressed: boolean;
}

// ---------------------------------------------------------------- jogador

export type PlayerMode = 'ground' | 'air' | 'swing';
export type GroundKind = 'street' | 'roof';

export interface Rope {
  /** Ponto de apoio FÍSICO (virtual): deslocado da fachada em direção à avenida. */
  readonly anchor: Vec3;
  /** Onde a teia realmente grudou no prédio (a linha da teia é desenhada até aqui). */
  readonly contact: Vec3;
  readonly solidId: number;
  readonly length: number;
  readonly targetLength: number;
  readonly heldTicks: number;
  readonly impulseUsed: boolean;
  /** Lançada com o jogador no chão: recolhe no ritmo do "zip" de saída (groundReel). */
  readonly fromGround: boolean;
}

export interface Player {
  /** Centro da base (pés). */
  readonly pos: Vec3;
  readonly vel: Vec3;
  readonly mode: PlayerMode;
  readonly grounded: boolean;
  readonly groundKind: GroundKind | null;
  readonly rope: Rope | null;
  readonly yaw: number;
  readonly pitch: number;
  readonly coyoteTicks: number;
  readonly jumpBufferTicks: number;
  /** >0 = clique de teia pendente esperando alvo. */
  readonly webBufferTicks: number;
  readonly flipWindowTicks: number;
  /** >0 = flip em andamento (ticks restantes). */
  readonly flipTicks: number;
  readonly flipAvailable: boolean;
  readonly lastReleasePerfect: boolean;
  readonly stunTicks: number;
  /** Ticks seguidos encostado numa parede com a teia presa. */
  readonly wallTicks: number;
  readonly airTicks: number;
  readonly prevWebHeld: boolean;
}

// ---------------------------------------------------------------- mira

export type AimSource = 'direct' | 'snap' | 'assist' | 'none';
export type AimFailReason = 'sky' | 'range' | 'low' | 'glass' | 'behind' | 'blocked' | null;

export interface AimResult {
  /** Âncora válida; null = sem alvo. */
  readonly point: Vec3 | null;
  readonly solidId: number | null;
  readonly source: AimSource;
  /** Onde o raio direto parou (ou o alcance máximo, se não acertou nada). */
  readonly rayEnd: Vec3;
  /** Por que o raio direto não serviu (null se serviu). */
  readonly fail: AimFailReason;
}

// ---------------------------------------------------------------- eventos

export type ReleaseReason = 'manual' | 'above' | 'wall';
export type StyleKind = 'swing' | 'perfect' | 'flip' | 'speed';
export type ComboBreakReason = 'street' | 'roof' | 'timeout' | 'bonk' | 'respawn';
export type LifeLossReason = 'fall' | 'quota' | 'debug';

/** Eventos efêmeros do tick: HUD, áudio, animação e (Etapa 2) pontuação consomem. */
export type GameEvent =
  | { readonly type: 'jumped' }
  | { readonly type: 'landed'; readonly speed: number; readonly kind: GroundKind }
  | { readonly type: 'web_attached'; readonly anchor: Vec3; readonly source: AimSource }
  | { readonly type: 'web_missed' }
  | {
      readonly type: 'web_released';
      readonly quality: number;
      readonly perfect: boolean;
      readonly speed: number;
      /** manual = soltou o botão; above = subiu acima da âncora; wall = encostado na parede. */
      readonly reason: ReleaseReason;
      readonly auto: boolean;
      /** Teia presa ≥ minSwingTime (só assim há boost e flip). */
      readonly fullSwing: boolean;
    }
  | { readonly type: 'web_impulse' }
  | { readonly type: 'flip'; readonly afterPerfect: boolean }
  | { readonly type: 'bonk'; readonly speed: number }
  // pontuação (Etapa 2)
  | { readonly type: 'ring_collected'; readonly ringId: number; readonly gold: boolean; readonly points: number; readonly speedBonus: number }
  | { readonly type: 'style'; readonly kind: StyleKind; readonly points: number; readonly multiplier: number }
  | { readonly type: 'combo_lost'; readonly reason: ComboBreakReason; readonly chain: number }
  // progressão (Etapa 2)
  | { readonly type: 'go' }
  | { readonly type: 'checkpoint'; readonly index: number }
  | { readonly type: 'life_lost'; readonly reason: LifeLossReason; readonly livesLeft: number }
  | { readonly type: 'respawned'; readonly checkpoint: number }
  | { readonly type: 'level_complete'; readonly result: LevelResult }
  | { readonly type: 'level_failed'; readonly rings: number; readonly quota: number }
  | { readonly type: 'game_over' }
  | { readonly type: 'victory' };

// ---------------------------------------------------------------- estado

export interface SessionStats {
  readonly webShots: number;
  readonly webMisses: number;
}

/**
 * countdown      — 3-2-1 antes de jogar (só o olhar é livre)
 * playing        — jogo rolando
 * respawning     — caiu num vão; reaparece no último checkpoint
 * level_complete — cruzou a chegada com a cota de anéis (espera o "continuar")
 * level_failed   — cruzou sem a cota: perdeu uma vida (espera o "tentar de novo")
 * game_over      — acabaram as vidas
 * victory        — concluiu o último nível
 * As 4 últimas são terminais para step(): só a cola (main) sai delas.
 */
export type GamePhase = 'countdown' | 'playing' | 'respawning' | 'level_complete' | 'level_failed' | 'game_over' | 'victory';

export interface StyleState {
  /** Eventos de estilo encadeados sem quebrar o combo. */
  readonly chain: number;
  readonly comboTimerTicks: number;
  readonly speedStreakTicks: number;
  readonly streetTicks: number;
  readonly roofTicks: number;
  readonly bestMultiplier: number;
}

/** Acumuladores do nível em andamento. */
export interface LevelProgress {
  readonly ticks: number;
  readonly ringPoints: number;
  readonly stylePoints: number;
  /** Pousou na rua em algum momento (perde o bônus "sem tocar a rua"). */
  readonly touchedStreet: boolean;
  readonly falls: number;
}

export interface LevelResult {
  readonly levelIndex: number;
  readonly levelName: string;
  /** Pontuação final do nível, com bônus. */
  readonly score: number;
  readonly ringPoints: number;
  readonly stylePoints: number;
  readonly allRingsBonus: number;
  readonly noStreetBonus: number;
  readonly rings: number;
  readonly ringsTotal: number;
  readonly stars: 1 | 2 | 3;
  /** Só estatística (o tempo não pontua). */
  readonly timeTicks: number;
  readonly bestMultiplier: number;
}

export interface GameState {
  readonly config: GameConfig;
  /** Compartilhado por referência entre estados (imutável). */
  readonly level: Level;
  readonly tick: number;
  readonly player: Player;
  readonly aim: AimResult;
  /** Só os eventos deste tick. */
  readonly events: readonly GameEvent[];
  readonly stats: SessionStats;
  readonly phase: GamePhase;
  /** Ticks restantes da fase (countdown, respawning). */
  readonly phaseTicks: number;
  readonly ringsCollected: readonly boolean[];
  readonly style: StyleState;
  readonly progress: LevelProgress;
  /** Pontos do nível em andamento (sem os bônus de fim de nível). */
  readonly levelScore: number;
  /** Soma dos níveis concluídos na campanha. */
  readonly runScore: number;
  readonly lives: number;
  /** Último checkpoint alcançado (0 = largada). */
  readonly checkpointIndex: number;
  /** false quando alguma flag de debug mudou o jogo: não entra nos recordes. */
  readonly ranked: boolean;
  /** ?god=1: não perde vidas nem precisa da cota. */
  readonly god: boolean;
  /** ?seed=N vale só para o nível inicial da campanha. */
  readonly seedOverride: number | null;
  readonly results: readonly LevelResult[];
}
