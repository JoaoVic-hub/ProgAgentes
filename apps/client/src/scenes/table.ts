import Phaser from 'phaser'
import { JogoSolo } from '../local/game'
import type { Carta, Valor } from 'truco-rules'

const SIMBOLO_NAIPE: Record<string, string> = {
  ouros: '♦',
  espadas: '♠',
  copas: '♥',
  paus: '♣',
}

const LARG_CARTA = 66
const ALT_CARTA = 92

interface DadosMesa {
  jogo: JogoSolo
  novo: boolean
}

export class CenaMesa extends Phaser.Scene {
  private jogo!: JogoSolo

  constructor() {
    super('Mesa')
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#14202e')

    const dados = this.scene.settings.data as DadosMesa | undefined
    if (!dados?.jogo) {
      this.scene.start('Menu')
      return
    }

    this.jogo = dados.jogo
    this.jogo.aoMudar = () => this.render()

    if (dados.novo) {
      await this.jogo.iniciarPartida()
    }
    this.render()
  }

  // ─── Renderização ─────────────────────────────────────────────────────────

  private render(): void {
    this.children.removeAll(true)
    this.desenharHud()
    this.desenharAssentos()
    this.desenharMesa()
    this.desenharMao()
    this.desenharAcoes()
    if (this.jogo.situacaoAtual === 'fim') this.desenharFim()
  }

  private desenharHud(): void {
    const w = this.scale.width
    const rotuloModo = `Contra Bots — ${this.jogo.formato}`
    const placar = this.jogo.placarAtual
    const rotuloPlacar = `Nós ${placar.time0} × ${placar.time1} Eles`
    const rotuloValor = `Mão ${this.jogo.rodadaAtualNum}/3 · Valor: ${this.jogo.valorMaoAtual}`

    this.add
      .text(w * 0.5 - 320, 30, rotuloModo, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#8fa6bb',
      })
      .setOrigin(0.5)
    this.add
      .text(w * 0.5 + 320, 30, rotuloValor, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#f4d03f',
      })
      .setOrigin(0.5)
    this.add
      .text(w * 0.5, 30, rotuloPlacar, {
        fontFamily: 'Arial',
        fontSize: '26px',
        color: '#ffffff',
        backgroundColor: '#1d3142',
        padding: { x: 18, y: 8 },
      })
      .setOrigin(0.5)
  }

  private desenharAssentos(): void {
    const w = this.scale.width
    const n = this.jogo.nJogadores
    const vez = this.jogo.vezDeQuem

    for (let assento = 0; assento < n; assento++) {
      const jaJogou = this.jogo.cartasNaMesa.some((j) => j.assento === assento)
      const rotulo = this.jogo.nomeAssento(assento)
      const minhaVez = vez === assento
      const parceiro = this.jogo.ehParceiro(assento)
      const cor = minhaVez
        ? '#f4d03f'
        : parceiro
          ? '#7fb069'
          : jaJogou
            ? '#5c7186'
            : '#b8c8d8'

      const x = (w * (assento + 1)) / (n + 1)
      this.add
        .text(x, 92, rotulo, {
          fontFamily: 'Arial',
          fontSize: '18px',
          color: cor,
          backgroundColor: minhaVez ? 'rgba(244,208,63,0.15)' : 'rgba(0,0,0,0)',
          padding: { x: 10, y: 4 },
        })
        .setOrigin(0.5)
      if (minhaVez) {
        this.add.text(x, 118, '👈', { fontSize: '20px' }).setOrigin(0.5)
      }
    }
  }

  private desenharMesa(): void {
    const w = this.scale.width
    const h = this.scale.height

    const virada = this.jogo.cartaViradaAtual
    const manilha = this.jogo.manilhaAtual
    if (virada) {
      this.cart(
        w * 0.5 - 210,
        h * 0.4,
        virada,
        manilha,
        LARG_CARTA,
        ALT_CARTA,
      )
      this.add
        .text(w * 0.5 - 210, h * 0.4 + ALT_CARTA / 2 + 18, 'Virada', {
          fontFamily: 'Arial',
          fontSize: '14px',
          color: '#8fa6bb',
        })
        .setOrigin(0.5)
      if (manilha) {
        this.add
          .text(w * 0.5 - 210, h * 0.4 - ALT_CARTA / 2 - 18, `Manilha: ${manilha.valor}`, {
            fontFamily: 'Arial',
            fontSize: '18px',
            color: '#f4d03f',
          })
          .setOrigin(0.5)
      }
    }

    const jogadas = this.jogo.cartasNaMesa
    jogadas.forEach((jogada, i) => {
      const x = w * 0.5 - (jogadas.length - 1) * 45 + i * 90
      this.cart(x, h * 0.4, jogada.carta, manilha, LARG_CARTA, ALT_CARTA)
      this.add
        .text(x, h * 0.4 + ALT_CARTA / 2 + 16, this.jogo.nomeAssento(jogada.assento), {
          fontFamily: 'Arial',
          fontSize: '14px',
          color: '#8fa6bb',
        })
        .setOrigin(0.5)
    })

    const pendente = this.jogo.pedidoPendenteAtual
    if (pendente) {
      this.add
        .text(w * 0.5, h * 0.2, `Pedido: ${pendente.valorProposto} — aguardando resposta…`, {
          fontFamily: 'Arial',
          fontSize: '22px',
          color: '#ff9f43',
          backgroundColor: 'rgba(0,0,0,0.4)',
          padding: { x: 16, y: 8 },
        })
        .setOrigin(0.5)
    }

    const resultadoRodadas = this.jogo.rodadasFechadas
      .map((r) => (r.resultado === 'empate' ? 'empate' : this.jogo.nomeTime(r.resultado === 'time0' ? 0 : 1)))
      .join(' · ')
    if (resultadoRodadas) {
      this.add
        .text(w * 0.5, h * 0.2 + 50, `Rodadas: ${resultadoRodadas}`, {
          fontFamily: 'Arial',
          fontSize: '16px',
          color: '#b8c8d8',
        })
        .setOrigin(0.5)
    }

    const msg = this.jogo.mensagemAtual
    if (msg) {
      this.add
        .text(w * 0.5, h * 0.7, msg, {
          fontFamily: 'Arial',
          fontSize: '20px',
          color: '#ffffff',
          backgroundColor: 'rgba(0,0,0,0.5)',
          padding: { x: 18, y: 10 },
          wordWrap: { width: 600 },
          align: 'center',
        })
        .setOrigin(0.5)
    }
  }

  private desenharMao(): void {
    const w = this.scale.width
    const h = this.scale.height
    const mao = this.jogo.minhaMao
    const manilha = this.jogo.manilhaAtual
    const podeJogar = this.jogo.minhaVez

    this.add
      .text(w * 0.5, h - 150, 'Sua mão', {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#8fa6bb',
      })
      .setOrigin(0.5)

    mao.forEach((carta, i) => {
      const x = w * 0.5 + (i - (mao.length - 1) / 2) * (LARG_CARTA + 16)
      const y = h - 60
      const card = this.cart(x, y, carta, manilha, LARG_CARTA, ALT_CARTA)
      if (!podeJogar) {
        card.setAlpha(0.65)
        return
      }
      const hit = this.add
        .rectangle(0, 0, LARG_CARTA, ALT_CARTA, 0xffffff, 0.01)
        .setInteractive({ useHandCursor: true })
      hit.on('pointerdown', () => {
        void this.jogo.jogarCartaHumano(carta.id)
      })
      card.add(hit)
    })
  }

  private desenharAcoes(): void {
    const w = this.scale.width
    const h = this.scale.height
    const y = h - 195

    if (this.jogo.devoResponder) {
      this.botao('Quero!', w * 0.5 - 150, y, () => {
        void this.jogo.responderHumano('aceitar')
      })
      this.botao('Corro!', w * 0.5, y, () => {
        void this.jogo.responderHumano('correr')
      })
      const pendente = this.jogo.pedidoPendenteAtual
      if (pendente && pendente.valorProposto < 12) {
        this.botao(`Aumento pra ${this.proximoValor(pendente.valorProposto)}`, w * 0.5 + 170, y, () => {
          void this.jogo.responderHumano('aumentar')
        })
      }
      return
    }

    if (this.jogo.possoPedir) {
      const valor = this.jogo.valorMaoAtual
      const [rotulo, pedido] = this.pedidoAtual(valor)
      this.botao(rotulo, w * 0.5, y, () => {
        void this.jogo.pedirTrucoHumano(pedido)
      })
    }
  }

  private desenharFim(): void {
    const w = this.scale.width
    const h = this.scale.height

    this.add.rectangle(w * 0.5, h * 0.5, w, h, 0x000000, 0.72).setOrigin(0.5)
    this.add
      .text(w * 0.5, h * 0.5 - 60, 'Fim de partida!', {
        fontFamily: 'Georgia, serif',
        fontSize: '64px',
        color: '#f4d03f',
      })
      .setOrigin(0.5)
    const vencedor = this.jogo.vencedorLabelAtual ?? 'Ninguém'
    this.add
      .text(w * 0.5, h * 0.5 - 10, `${vencedor} venceu!`, {
        fontFamily: 'Arial',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.botao('Menu', w * 0.5, h * 0.5 + 70, () => this.scene.start('Menu'))
  }

  // ─── Helpers visuais ──────────────────────────────────────────────────────

  private cart(
    x: number,
    y: number,
    carta: Carta,
    manilha: { valor: Valor } | null,
    larg: number,
    alt: number,
  ): Phaser.GameObjects.Container {
    const ehManilha = manilha !== null && carta.valor === manilha.valor
    const g = this.add.graphics()
    g.fillStyle(ehManilha ? 0xf4d03f : 0xffffff, 1)
    g.fillRoundedRect(-larg / 2, -alt / 2, larg, alt, 8)
    g.lineStyle(ehManilha ? 3 : 1, ehManilha ? 0x9a7d0a : 0x33475f, 1)
    g.strokeRoundedRect(-larg / 2, -alt / 2, larg, alt, 8)

    const texto = this.add
      .text(0, 0, `${carta.valor}\n${SIMBOLO_NAIPE[carta.naipe]}`, {
        fontFamily: 'Arial',
        fontSize: '26px',
        color: ehManilha ? '#8a6d00' : '#1a2332',
        align: 'center',
      })
      .setOrigin(0.5)

    return this.add.container(x, y, [g, texto])
  }

  private botao(rotulo: string, x: number, y: number, onClick: () => void): void {
    const b = this.add
      .text(x, y, rotulo, {
        fontFamily: 'Arial',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#2e4a63',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    b.on('pointerdown', () => {
      onClick()
    })
  }

  private proximoValor(valor: number): number {
    if (valor === 3) return 6
    if (valor === 6) return 9
    if (valor === 9) return 12
    return valor
  }

  private pedidoAtual(valor: number): [string, 'truco' | 'seis' | 'nove' | 'doze'] {
    if (valor === 1) return ['Truco!', 'truco']
    if (valor === 3) return ['Seis!', 'seis']
    if (valor === 6) return ['Nove!', 'nove']
    return ['Doze!', 'doze']
  }
}