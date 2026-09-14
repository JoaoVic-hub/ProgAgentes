import Phaser from 'phaser'
import { lerPartidaAtual, type PartidaSalva } from '../storage/localdb'
import { JogoSolo } from '../local/game'

const FORMATOS: Array<{ rotulo: string; n: 2 | 4 | 6 }> = [
  { rotulo: '1 contra 1', n: 2 },
  { rotulo: 'Duplas', n: 4 },
  { rotulo: 'Trios', n: 6 },
]

export class CenaMenu extends Phaser.Scene {
  private botoesFormato: Phaser.GameObjects.Text[] = []

  constructor() {
    super('Menu')
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor('#14202e')
    const cx = this.scale.width / 2
    const cy = this.scale.height / 2

    this.add
      .text(cx, cy - 200, 'TRUCO', {
        fontFamily: 'Georgia, serif',
        fontSize: '84px',
        color: '#f4d03f',
      })
      .setOrigin(0.5)

    this.add
      .text(cx, cy - 140, 'Joga contra os bots e leva até 12!', {
        fontFamily: 'Arial',
        fontSize: '20px',
        color: '#b8c8d8',
      })
      .setOrigin(0.5)

    this.criarBotao(cx, cy - 60, 'Contra Bots', () => this.mostrarFormatos())

    FORMATOS.forEach((f, i) => {
      const botao = this.criarBotao(cx, cy + 10 + i * 62, f.rotulo, () =>
        this.iniciarContraBots(f.n),
      )
      botao.setVisible(false)
      this.botoesFormato.push(botao)
    })

    const salvo = await lerPartidaAtual()
    if (salvo) {
      this.criarBotao(cx, cy + 230, 'Continuar partida', () => this.continuarPartida(salvo))
    }
  }

  private mostrarFormatos(): void {
    for (const botao of this.botoesFormato) {
      botao.setVisible(true)
    }
  }

  private iniciarContraBots(nJogadores: 2 | 4 | 6): void {
    const jogo = new JogoSolo(nJogadores, 0)
    this.scene.start('Mesa', { jogo, novo: true })
  }

  private continuarPartida(salvo: PartidaSalva): void {
    const jogo = JogoSolo.carregar(salvo)
    this.scene.start('Mesa', { jogo, novo: false })
  }

  private criarBotao(
    x: number,
    y: number,
    rotulo: string,
    onClick: () => void,
  ): Phaser.GameObjects.Text {
    const botao = this.add
      .text(x, y, rotulo, {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#2e4a63',
        padding: { x: 26, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

    botao.on('pointerdown', onClick)
    return botao
  }
}