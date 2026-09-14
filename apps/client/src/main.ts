import Phaser from 'phaser'
import { CenaMenu } from './scenes/menu'
import { CenaMesa } from './scenes/table'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#14202e',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 600,
  },
  scene: [CenaMenu, CenaMesa],
}

export function iniciarJogo(): Phaser.Game {
  return new Phaser.Game(config)
}

iniciarJogo()