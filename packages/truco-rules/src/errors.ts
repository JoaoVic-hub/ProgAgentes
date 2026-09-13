export class ErroTruco extends Error {
  readonly codigo: string

  constructor(codigo: string, mensagem: string) {
    super(mensagem)
    this.name = 'ErroTruco'
    this.codigo = codigo
  }
}

export class JogadaForaDeTurno extends ErroTruco {
  constructor() {
    super('JogadaForaDeTurno', 'Jogada fora de turno')
  }
}

export class CartaNaoDisponivel extends ErroTruco {
  constructor() {
    super('CartaNaoDisponivel', 'Carta não disponível na mão')
  }
}

export class BaralhoInsuficiente extends ErroTruco {
  constructor() {
    super('BaralhoInsuficiente', 'Baralho insuficiente para distribuir as cartas')
  }
}

export class PedidoInvalido extends ErroTruco {
  constructor() {
    super('PedidoInvalido', 'Pedido inválido para o valor atual da mão')
  }
}

export class ValorMaximoAtingido extends ErroTruco {
  constructor() {
    super('ValorMaximoAtingido', 'Valor máximo da mão (12) já atingido')
  }
}