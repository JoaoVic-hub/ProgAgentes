import {
  aplicarPontos,
  criarBaralho,
  distribuirCartas,
  embaralhar,
  finalizarMao,
  iniciarMao,
  jogarCarta,
  montarTimes,
  pedirValor,
  responderPedido,
  verificarFim,
  timeDoAssento,
  type Carta,
  type MaoState,
  type PartidaScore,
  type Pedido,
  type RespostaPedido,
  type Time,
} from 'truco-rules'
import {
  adicionarHistorico,
  limparPartidaAtual,
  salvarPartidaAtual,
  type HistoricoPartida,
  type PartidaSalva,
} from '../storage/localdb'
import { botQuerPedirValor, escolherCartaBot, responderPedidoBot } from './bot'

const NOMES_BOTS = ['Manduca', 'Zefa', 'Eleutério', 'Quincas', 'Dalva']

export type SituacaoJogo = 'jogar' | 'responder' | 'fim'

export type MudancaCallback = () => void

export class JogoSolo {
  readonly partidaId: string
  readonly nJogadores: 2 | 4 | 6
  readonly formato: '1x1' | '2x2' | '3x3'
  readonly assentoHumano: number

  aoMudar: MudancaCallback | null = null

  private placar: PartidaScore = { time0: 0, time1: 0 }
  private mao: MaoState | null = null
  private situacao: SituacaoJogo = 'jogar'
  private respondenteAssento: number | null = null
  private parteContraria: [number, number] | null = null
  private vencedorTime: 'time0' | 'time1' | null = null
  private vencedorLabel: string | null = null
  private ultimaMensagem: string | null = null

  constructor(nJogadores: 2 | 4 | 6, assentoHumano: number = 0, partidaId?: string) {
    this.nJogadores = nJogadores
    this.assentoHumano = assentoHumano
    this.partidaId = partidaId ?? crypto.randomUUID()
    this.formato = montarTimes(nJogadores).formato
  }

  // ─── Estado público (leitura da UI) ───────────────────────────────────────

  get placarAtual(): PartidaScore {
    return { ...this.placar }
  }

  get valorMaoAtual(): number {
    return this.mao?.valor ?? 0
  }

  get manilhaAtual() {
    return this.mao?.manilha ?? null
  }

  get cartaViradaAtual() {
    return this.mao?.cartaVirada ?? null
  }

  get situacaoAtual(): SituacaoJogo {
    return this.situacao
  }

  get mensagemAtual(): string | null {
    return this.ultimaMensagem
  }

  get vencedorLabelAtual(): string | null {
    return this.vencedorLabel
  }

  get pedidoPendenteAtual() {
    return this.mao?.pedidoPendente ?? null
  }

  get minhaMao(): Carta[] {
    return this.mao ? [...this.mao.maos[this.assentoHumano]] : []
  }

  get minhaVez(): boolean {
    return this.situacao === 'jogar' && this.jogadorDaVez === this.assentoHumano
  }

  get vezDeQuem(): number | null {
    if (this.situacao === 'responder') return this.respondenteAssento
    if (this.situacao === 'jogar' && this.mao) return this.jogadorDaVez
    return null
  }

  get devoResponder(): boolean {
    return this.situacao === 'responder' && this.respondenteAssento === this.assentoHumano
  }

  get possoPedir(): boolean {
    return (
      this.situacao === 'jogar' &&
      this.minhaVez &&
      this.mao !== null &&
      this.mao.pedidoPendente === null &&
      this.mao.valor < 12
    )
  }

  get rodadaAtualNum(): number {
    return this.mao?.rodadaAtual ?? 1
  }

  get cartasNaMesa() {
    return this.mao?.jogadasAtuais ?? []
  }

  get rodadasFechadas() {
    return this.mao?.rodadas ?? []
  }

  nomeAssento(assento: number): string {
    if (assento === this.assentoHumano) return 'Você'
    return NOMES_BOTS[assento - 1] ?? `Bot ${assento}`
  }

  nomeTime(time: Time): string {
    const { times } = montarTimes(this.nJogadores)
    return times[time].includes(this.assentoHumano) ? 'Nós' : 'Eles'
  }

  timeDoAssento(assento: number): Time {
    return timeDoAssento(this.nJogadores, assento)
  }

  ehParceiro(assento: number): boolean {
    return this.timeDoAssento(assento) === this.timeDoAssento(this.assentoHumano)
  }

  // ─── Ações do jogador humano ──────────────────────────────────────────────

  async iniciarPartida(): Promise<void> {
    this.ultimaMensagem = 'Preparando a mesa…'
    this.iniciarNovaMao()
    await this.tick()
    this.notificar()
  }

  async jogarCartaHumano(cartaId: string): Promise<void> {
    if (this.situacao !== 'jogar') throw new Error('Não é hora de jogar carta')
    const mao = this.mao
    if (!mao) throw new Error('Mão não iniciada')
    const carta = mao.maos[this.assentoHumano].find((c) => c.id === cartaId)
    if (!carta) throw new Error('Carta não está na sua mão')

    this.jogar(carta)
    await this.tick()
    this.notificar()
  }

  async pedirTrucoHumano(pedido: Pedido): Promise<void> {
    const mao = this.mao
    if (mao === null || this.situacao !== 'jogar') throw new Error('Não é hora de pedir')
    if (mao.pedidoPendente) throw new Error('Já existe um pedido em aberto')

    this.fazerPedido(this.assentoHumano, pedido)
    await this.tick()
    this.notificar()
  }

  async responderHumano(resposta: RespostaPedido): Promise<void> {
    if (this.situacao !== 'responder' || this.respondenteAssento !== this.assentoHumano) {
      throw new Error('Não é sua vez de responder')
    }

    this.responder(resposta)
    await this.tick()
    this.notificar()
  }

  // ─── Núcleo da máquina de estados ─────────────────────────────────────────

  private async tick(): Promise<void> {
    while (true) {
      if (this.situacao === 'fim') break

      if (this.mao !== null && this.mao.encerrada) {
        this.fecharMao()
        continue
      }

      if (this.mao === null) {
        this.iniciarNovaMao()
        continue
      }

      if (this.situacao === 'responder') {
        const assento = this.respondenteAssento
        if (assento === null || assento === this.assentoHumano) break
        this.botResolverPedido(assento)
        continue
      }

      const atual = this.jogadorDaVez
      if (atual === this.assentoHumano) break
      this.botAgir(atual)
    }

    await this.persistir()
  }

  private jogar(carta: Carta): void {
    const mao = this.mao
    if (!mao) throw new Error('Mão não iniciada')
    const assento = this.jogadorDaVez
    this.mao = jogarCarta(mao, assento, carta)
    const ehHumano = assento === this.assentoHumano
    const nome = ehHumano ? 'Você' : this.nomeAssento(assento)
    this.ultimaMensagem = `${nome} jogou ${carta.valor} de ${carta.naipe}`
  }

  private fazerPedido(assento: number, pedido: Pedido): void {
    const mao = this.mao
    if (!mao) throw new Error('Mão não iniciada')
    this.mao = pedirValor(mao, assento, pedido)
    const respondente = this.proximoOponente(assento)
    this.respondenteAssento = respondente
    this.parteContraria = [assento, respondente]
    this.situacao = 'responder'
    const nome = assento === this.assentoHumano ? 'Você' : this.nomeAssento(assento)
    this.ultimaMensagem = `${nome} pediu ${pedido}`
  }

  private responder(resposta: RespostaPedido): void {
    const mao = this.mao
    if (!mao) throw new Error('Mão não iniciada')
    const assento = this.respondenteAssento ?? 0
    this.mao = responderPedido(mao, resposta)
    const nome = assento === this.assentoHumano ? 'Você' : this.nomeAssento(assento)
    const rotulo =
      resposta === 'aceitar' ? 'Quero!' : resposta === 'correr' ? 'Corro!' : 'Aumento pra mais!'
    this.ultimaMensagem = `${nome}: ${rotulo}`
    this.posResposta(resposta)
  }

  private posResposta(resposta: RespostaPedido): void {
    if (resposta === 'aumentar' && this.parteContraria) {
      const outro = this.parteContraria.find((s) => s !== this.respondenteAssento)
      if (outro !== undefined) {
        this.respondenteAssento = outro
        return
      }
    }
    this.respondenteAssento = null
    this.parteContraria = null
    if (resposta === 'correr' || this.mao?.encerrada) {
      this.fecharMao()
    } else {
      this.situacao = 'jogar'
    }
  }

  private botAgir(assento: number): void {
    const mao = this.mao
    if (!mao) return

    const pedido = botQuerPedirValor(
      mao.maos[assento],
      mao.manilha.valor,
      mao.valor,
      this.placar.time1,
    )
    if (pedido) {
      this.fazerPedido(assento, pedido)
      return
    }

    const [vitorias, derrotas] = this.vitoriasDerrotas(assento)
    const carta = escolherCartaBot(mao.maos[assento], mao.manilha.valor, vitorias, derrotas)
    this.jogar(carta)
  }

  private botResolverPedido(assento: number): void {
    const mao = this.mao
    if (!mao || !mao.pedidoPendente) return

    const resposta = responderPedidoBot(
      mao.manilha.valor,
      mao.maos[assento],
      mao.valor,
      mao.pedidoPendente.valorProposto,
      this.placar.time1,
    )
    this.responder(resposta)
  }

  private fecharMao(): void {
    const mao = this.mao
    if (!mao) return

    const resultado = finalizarMao(mao)
    this.mao = null
    this.respondenteAssento = null
    this.parteContraria = null

    if (resultado.nula) {
      this.ultimaMensagem = 'Mão nula — ninguém pontua'
      this.situacao = 'jogar'
      return
    }

    const time = resultado.vencedorTime === 'time0' ? 0 : 1
    this.placar = aplicarPontos(this.placar, time, resultado.pontos)
    this.ultimaMensagem = `${this.nomeTime(time)} leva a mão (${resultado.pontos} ponto${resultado.pontos === 1 ? '' : 's'})`

    if (verificarFim(this.placar)) {
      this.vencedorTime = resultado.vencedorTime ?? null
      this.vencedorLabel = this.nomeTime(time)
      this.situacao = 'fim'
      this.ultimaMensagem = `Fim de partida! ${this.vencedorLabel} venceram por ${this.placar.time0} a ${this.placar.time1}`
      return
    }

    this.situacao = 'jogar'
  }

  private iniciarNovaMao(): void {
    const baralho = embaralhar(criarBaralho())
    const { maos, restante } = distribuirCartas(baralho, this.nJogadores)
    const cartaVirada = restante[0]
    this.mao = iniciarMao({ nJogadores: this.nJogadores, maos }, cartaVirada)
    this.ultimaMensagem = `Mão nova! Manilha: ${this.mao.manilha.valor}`
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private get jogadorDaVez(): number {
    const mao = this.mao
    if (!mao) return 0
    return (mao.primeiroJogadorRodada + mao.jogadasAtuais.length) % mao.maos.length
  }

  private vitoriasDerrotas(assento: number): [number, number] {
    const mao = this.mao
    if (!mao) return [0, 0]
    const meuResultado: 'time0' | 'time1' = this.timeDoAssento(assento) === 0 ? 'time0' : 'time1'
    let vitorias = 0
    let derrotas = 0
    for (const r of mao.rodadas) {
      if (r.resultado === 'empate') continue
      if (r.resultado === meuResultado) vitorias++
      else derrotas++
    }
    return [vitorias, derrotas]
  }

  private proximoOponente(assento: number): number {
    for (let i = 1; i < this.nJogadores; i++) {
      const candidato = (assento + i) % this.nJogadores
      if (timeDoAssento(this.nJogadores, candidato) !== timeDoAssento(this.nJogadores, assento)) {
        return candidato
      }
    }
    throw new Error('Nenhum oponente encontrado')
  }

  private notificar(): void {
    if (this.aoMudar) this.aoMudar()
  }

  private async persistir(): Promise<void> {
    if (this.situacao === 'fim') {
      await this.salvarHistorico()
      return
    }
    await salvarPartidaAtual(this.toSalvo())
  }

  private async salvarHistorico(): Promise<void> {
    const vencedorLabel = this.vencedorLabel ?? this.nomeTime(0)
    const historico: HistoricoPartida = {
      id: crypto.randomUUID(),
      partida_id: this.partidaId,
      modo: 'bots',
      formato: this.formato,
      vencedor: vencedorLabel,
      placar_final: { ...this.placar },
      concluida_em: new Date().toISOString(),
    }
    await adicionarHistorico(historico)
    await limparPartidaAtual()
  }

  // ─── Serialização (FR-018 — retomada de partida) ─────────────────────────

  toSalvo(): PartidaSalva {
    return {
      partidaId: this.partidaId,
      modo: 'bots',
      nJogadores: this.nJogadores,
      formato: this.formato,
      placar: { ...this.placar },
      mao: structuredClone(this.mao),
      situacao: this.situacao,
      respondenteAssento: this.respondenteAssento,
      parteContraria: this.parteContraria,
      assentoHumano: this.assentoHumano,
      vencedorTime: this.vencedorTime,
    }
  }

  static carregar(salvo: PartidaSalva): JogoSolo {
    const jogo = new JogoSolo(salvo.nJogadores, salvo.assentoHumano, salvo.partidaId)
    jogo.placar = { ...salvo.placar }
    jogo.mao = salvo.mao ? structuredClone(salvo.mao) : null
    jogo.situacao = salvo.situacao
    jogo.respondenteAssento = salvo.respondenteAssento
    jogo.parteContraria = salvo.parteContraria
    jogo.vencedorTime = salvo.vencedorTime
    if (jogo.vencedorTime) {
      jogo.vencedorLabel = jogo.nomeTime(jogo.vencedorTime === 'time0' ? 0 : 1)
    }
    return jogo
  }
}