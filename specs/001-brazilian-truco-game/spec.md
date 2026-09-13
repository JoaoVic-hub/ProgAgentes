# Especificação da Feature: Jogo de Truco Brasileiro Multijogador

**Feature Branch**: `001-brazilian-truco-game`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "Um jogo digital de truco brasileiro, com identidade visual inspirada no Balatro (cartas estilizadas, animações expressivas, interface vibrante e 'gamificada' em vez de um visual realista de mesa de baralho) e toda a linguagem da interface e das interações usando gírias tradicionais do truco brasileiro. O jogo suporta partidas com 2 a 6 jogadores desde a primeira versão, com times parelhos que escalam conforme o total de jogadores. Regras de truco brasileiro a seguir: baralho de 40 cartas, carta virada define a manilha, cada mão tem até 3 rodadas de cartas, valor da mão pode ser aumentado através dos pedidos de truco, seis, nove e doze. Partida vai até 12 pontos. Duas formas de conexão: online em tempo real (cliente-servidor) e contra bots de IA (incluindo mesas mistas com bots preenchendo vagas). Cada jogador deve ver de quem é a vez, o placar, o valor da mão e receber feedback visual e sonoro nos momentos-chave."

## Clarifications

### Session 2026-09-10

- Q: Quando uma mão termina sem um vencedor claro de rodadas (cada time vence uma e a terceira é nula), o que acontece com o valor da mão? → A: A mão é nula - nenhum time pontua o valor em disputa.
- Q: Qual tratamento deve valer para a mão de 11 (placar 11x11) na v1? → A: Sem tratamento especial - o jogo segue normalmente até alguém chegar a 12.
- Q: O que o jogo deve persistir na v1 quando se fala em "save" de uma partida? → A: Guardar a partida em andamento + resultado das partidas concluídas (histórico de fim de partida).
- Q: Quanto tempo o sistema deve esperar sem ação do jogador antes de tratá-lo como ausente? → A: 60 segundos de timeout de turno.
- Q: Sem contas na v1, onde devem ficar os dados persistidos (estado em andamento e histórico)? → A: Misto - online no servidor central, contra bots no dispositivo do jogador.

## Cenários de Usuário e Testes *(obrigatório)*

### História de Usuário 1 - Partida solo contra bots (Prioridade: P1)

O jogador abre o jogo, monta uma mesa contra bots de IA e joga uma partida completa de truco brasileiro, do embaralhamento até alguém chegar a 12 pontos.

**Por que essa prioridade**: É o núcleo do jogo — entrega valor completo mesmo sem outros jogadores e serve de base para toda a lógica de regras (manilha, pedidos, pontuação). É o menor slice que demonstra o jogo funcionando.

**Teste independente**: Abrir o jogo, criar uma partida contra bots e concluir uma partida inteira (até 12 pontos) sem depender de internet ou de outros dispositivos.

**Cenários de Aceitação**:

1. **Dado que** o jogador cria uma partida nova contra bots, **Quando** a partida começa, **Então** uma mão de truco é distribuída, a carta virada define a manilha e o jogo exibe claramente de quem é a vez.
2. **Dado que** o oponente pediu truco, **Quando** chega a vez do jogador responder, **Então** ele pode aceitar, correr ou aumentar, e o valor da mão atualizado é exibido.
3. **Dado que** um time atinge 12 pontos, **Quando** uma mão termina, **Então** a partida encerra e o time vencedor é anunciado com destaque visual e sonoro.

---

### História de Usuário 3 - Partida online em tempo real (Prioridade: P1)

Jogadores em locais diferentes se encontram numa partida online em tempo real, usando um código de sala ou convite, e jogam a partida completa com o estado sempre consistente entre todos.

**Por que essa prioridade**: Atende jogadores que não estão no mesmo local físico e é o modo mais usado em jogos digitais de cartas. Complementa o solo como segundo caminho de valor completo.

**Teste independente**: Dois dispositivos em redes diferentes completam uma mão inteira com o estado de jogo sincronizado (vez, cartas, placar, valor da mão).

**Cenários de Aceitação**:

1. **Dado que** uma sala online foi criada, **Quando** um jogador informa o código da sala em outro local, **Então** ele é levado à mesma mesa e o jogo aguarda todos os assentos preenchidos para começar.
2. **Dado que** um jogador joga uma carta, **Quando** a ação é feita, **Então** os demais jogadores veem a carta na mesa e o estado (vez, valor da mão, placar) atualizado em todos os dispositivos.
3. **Dado que** um jogador se desconecta no meio da partida, **Quando** a queda é detectada, **Então** os demais são avisados e um bot assume temporariamente a posição até a reconexão ou o fim da partida.

---

### História de Usuário 4 - Mesa mista com bots e jogadores reais (Prioridade: P2)

Quando faltam jogadores para completar uma mesa, o sistema ocupa as posições vagas com bots de IA, permitindo misturar jogadores humanos e bots numa mesma partida (online ou contra bots).

**Por que essa prioridade**: Melhora a experiência de encontrar partida e evita partidas vazias, mas depende das mesmas regras já implementadas no solo (P1).

**Teste independente**: Criar uma mesa online para 4 com apenas 2 jogadores humanos e iniciar a partida, verificando que os 2 assentos vagos são ocupados por bots.

**Cenários de Aceitação**:

1. **Dado que** uma mesa online para 4 tem apenas 3 jogadores humanos, **Quando** a partida inicia, **Então** um bot de IA ocupa a posição vaga e joga conforme as regras.
2. **Dado que** um jogador abandona a mesa no lobby, **Quando** a partida ainda não começou, **Então** o sistema preenche a posição com um bot ou recompõe a mesa proporcionalmente.

---

### História de Usuário 5 - Estado de jogo sempre visível (Prioridade: P2)

Durante toda a partida, cada jogador consegue identificar de imediato de quem é a vez, o placar da dupla/time e o valor atual da mão em disputa, além de receber feedback visual e sonoro nos momentos-chave (pedido de truco, vitória de rodada, fechamento de mão).

**Por que essa prioridade**: Sem clareza de estado, o jogo fica confuso e erros de turno se acumulam; depende das regras já funcionando (P1).

**Teste independente**: Assistir a uma partida inteira e, a cada momento, afirmar corretamente quem joga, o placar e o valor da mão em disputa.

**Cenários de Aceitação**:

1. **Dado que** uma partida está em andamento, **Quando** chega a vez de um jogador, **Então** um destaque visual claro e não ambíguo mostra sua vez (exemplo: marcação na mão do jogador) e a vez é visível para todos.
2. **Dado que** o valor da mão muda (exemplo: truco aceito), **Quando** um pedido é resolvido, **Então** o novo valor é exibido com feedback visual e sonoro.
3. **Dado que** uma rodada é vencida ou uma mão é fechada, **Quando** o resultado é definido, **Então** animação e som comunicam o desfecho.

---

### História de Usuário 6 - Identidade visual estilo Balatro e gírias do truco (Prioridade: P3)

A interface usa cartas estilizadas, animações expressivas e visual vibrante e gamificado (inspirado no Balatro), e toda a linguagem de interface e interações usa gírias tradicionais do truco brasileiro ("aumento pra seis", "corro", "tô com a manilha", "que mão de vaca") em vez de termos genéricos de UI.

**Por que essa prioridade**: Define a personalidade do produto e melhora a imersão, mas não bloqueia o funcionamento das regras, sendo possível evoluí-la após o núcleo funcionar.

**Teste independente**: Navegar por uma partida inteira e identificar que todos os rótulos, botões e mensagens usam gírias do truco brasileiro e que o visual é estilizado/vibrante (não uma mesa realista).

**Cenários de Aceitação**:

1. **Dado que** o jogador entra numa partida, **Quando** ele interage com a mão, **Então** as ações são apresentadas com as gírias tradicionais (exemplos: "aumento pra seis" em vez de "aumentar aposta", "corro" em vez de "desistir").
2. **Dado que** a carta virada define a manilha, **Quando** a manilha entra em jogo, **Então** uma animação expressiva e fácil de reconhecer destaca a carta (exemplo: "tô com a manilha").

---

### Casos Limite

- Jogador se desconecta no meio de uma partida online — o sistema avisa os demais e define uma política de continuidade (bot assume, ou jogador retorna à posição ao reconectar).
- Jogador humano inativo por 60 segundos (timeout de ausência) — o sistema o trata como ausente, avisa os demais e aciona a política de continuidade (bot substituto ou reconexão).
- Empate de cartas na mesma rodada (mesma força e naipe de manilha) — a rodada não marca ponto para nenhum time.
- Mão sem vencedor de rodadas (1x1 com uma rodada nula) — a mão é nula e nenhum time pontua o valor em disputa.
- Oponente pede truco e o jogador corre na última carta — validação do desfecho da mão conforme regra (o valor da mão vai para o time que pediu).
- Acúmulo máximo de pedidos: valor da mão em 12 ("doze") com pedido recusado — o oponente não pode aumentar além e só pode aceitar ou correr.
- Fim precoce da partida: um time atinge 12 pontos no meio de uma mão — a partida encerra imediatamente.
- Mesa online esperando jogadores humanos: o sistema limita o tempo de espera ou permite iniciar com bots preenchendo as vagas.

## Requisitos *(obrigatório)*

### Requisitos Funcionais

- **FR-001**: O sistema DEVE usar um baralho de 40 cartas (sem as cartas 8, 9 e 10) em todas as partidas.
- **FR-002**: O sistema DEVE definir a manilha de cada mão a partir da carta virada, seguindo a hierarquia oficial do truco brasileiro.
- **FR-003**: O sistema DEVE permitir no máximo 3 rodadas de cartas por mão, distribuindo 3 cartas por jogador.
- **FR-004**: O sistema DEVE permitir que o valor da mão seja aumentado pelos pedidos de truco, seis, nove e doze (3, 6, 9 e 12).
- **FR-005**: O sistema DEVE permitir que o oponente do pedido aceite, corra (recuse) ou aumente ainda mais o valor da mão, respeitando o valor máximo de 12.
- **FR-006**: O sistema DEVE encerrar a partida quando um time atinge 12 pontos e declarar o vencedor.
- **FR-007**: O sistema DEVE suportar partidas com 2, 4 ou 6 jogadores, formando respectivamente 1x1, 2x2 (duplas) e 3x3 (trios).
- **FR-008**: O sistema DEVE posicionar os jogadores do mesmo time em assentos alternados na mesa.
- **FR-009**: O sistema DEVE suportar partidas online em tempo real, permitindo jogadores em locais diferentes.
- **FR-011**: O sistema DEVE permitir partidas jogadas inteiramente contra bots de IA.
- **FR-012**: O sistema DEVE preencher posições vagas de uma mesa com bots de IA, permitindo misturar jogadores reais e bots na mesma partida.
- **FR-013**: O sistema DEVE proibir chat ou voz direta entre parceiros sobre as cartas, restringindo a comunicação a um conjunto de expressões predefinidas (Banco de Frases). O jogador escolhe essas frases de um menu predefinido e NUNCA digita texto livre. O Banco de Frases deve estar organizado nas categorias abaixo:
  - **Pedidos e respostas**: "Truco!", "Seis!", "Nove!", "Doze!", "Quero", "Não quero", "Corro", "Aumento pra seis", "Aumento pra nove", "Vou de doze"
  - **Comunicação entre parceiros (moral, sem revelar carta)**: "Bora, sócio!", "Confia na força", "Tamo junto nessa", "Segura a onda", "Deixa que eu resolvo", "Truco não tem parça, tem sócio", "Vai que é tua"
  - **Reações pós-rodada**: "Boa!", "Que mão de vaca!", "Foi na faca", "Não veio pra brincadeira", "Levou pau"
  - **Manilha e cartas fortes**: "Tô com a manilha!", "Peguei a graúda", "Zap na mão"
  - **Blefe/provocação**: "Só truco, sócio", "Tá de olho vivo", "Duvido", "Vem que eu tô solto"

  Essas frases servem exclusivamente para comunicação entre parceiros e reações, e o sistema DEVE garantir que nenhuma delas combine informação real sobre as cartas (não revelam naipe nem valor específico da mão do jogador).
- **FR-014**: O sistema DEVE exibir, de forma clara e permanente, de quem é a vez, o placar de cada time e o valor atual da mão em disputa.
- **FR-015**: O sistema DEVE emitir feedback visual e sonoro nos momentos-chave: pedido/aceite de truco, vitória de rodada e fechamento de mão.
- **FR-016**: O sistema DEVE usar gírias tradicionais do truco brasileiro em todos os rótulos e interações da interface (exemplos: "aumento pra seis", "corro", "tô com a manilha").
- **FR-017**: O sistema DEVE apresentar visual estilizado e vibrante (cartas estilizadas e animações expressivas), sem replicar aparência realista de mesa de baralho.
- **FR-018**: O sistema DEVE persistir o estado de uma partida em andamento, permitindo reconexão e retomada após interrupção (persistência de save obrigatória conforme a constituição).
- **FR-019**: O sistema DEVE persistir o resultado das partidas concluídas (vencedor, placar final) para consulta posterior em um histórico de fim de partida.
- **FR-020**: O sistema DEVE tratar como ausente o jogador humano que não fizer nenhuma ação por 60 segundos numa partida em andamento, acionando a política de continuidade (aviso aos demais e bot substituto).

### Entidades-Chave *(a feature envolve dados)*

- **Partida**: Reúne jogadores e bots; guarda o formato (1x1, 2x2, 3x3), o modo (contra bots ou online) e o placar por time, encerrando aos 12 pontos. Persiste o estado em andamento (para reconexão/retomada) e o resultado final (histórico); online no servidor central, contra bots no dispositivo do jogador.
- **Assento/Mesa**: Posição ordenada na mesa; cada assento pertence a um time e é ocupado por um jogador humano ou um bot.
- **Jogador**: Participante de uma partida; pode ser humano (online) ou bot de IA.
- **Time/Parceria**: Grupo de jogadores do mesmo lado; escala conforme o formato (1, 2 ou 3 integrantes).
- **Mão**: Disputa atual; contém o valor em disputa (1 padrão, 3, 6, 9 ou 12), a carta virada/manilha e até 3 rodadas de cartas.
- **Rodada**: Uma jogada de carta por assento; o vencedor da maioria das rodadas leva a mão.
- **Carta**: Peça do baralho de 40; tem valor/força e naipe, podendo ser manilha.
- **Banco de Frases**: Conjunto fechado e predefinido de expressões em gíria do truco, organizadas por categoria (pedidos e respostas, comunicação entre parceiros, reações pós-rodada, manilha e cartas fortes, blefe/provocação). É a única forma de comunicação entre parceiros; o jogador seleciona as frases de um menu (nunca texto livre) e nenhuma delas revela informação real sobre as cartas.

## Critérios de Sucesso *(obrigatório)*

### Resultados Mensuráveis

- **SC-001**: Um jogador conclui uma partida completa contra bots (até 12 pontos) em no máximo 15 minutos, sem falhas de regra.
- **SC-002**: Um jogador cria uma sala online e a partida inicia em até 1 minuto após todos os assentos serem preenchidos (por jogadores humanos ou bots).
- **SC-003**: Em partidas online, os demais jogadores percebem o estado atualizado (carta jogada, vez, placar e valor da mão) em até 1 segundo após a ação de outro jogador.
- **SC-004**: A lógica de pontuação, valor da mão e manilha produz resultados corretos em 100% dos cenários automatizados de teste (regras oficiais do truco brasileiro).
- **SC-005**: 90% dos jogadores que testam o jogo conseguem identificar, a cada momento, de quem é a vez e o valor da mão em disputa sem assistência externa.
- **SC-006**: O jogo mantém desempenho fluido (mínimo 30 quadros por segundo) em dispositivos de entrada, sem travamentos perceptíveis durante animações e feedback sonoro.
- **SC-007**: Em avaliação qualitativa, a maioria dos jogadores brasileiros reconhece a linguagem de gírias da interface como autêntica do truco (exemplos: "aumento pra seis", "corro", "que mão de vaca").

## Premissas

- **Sem contas obrigatórias na v1**: partidas online usam código de sala ou convite; não há sistema de perfil persistente obrigatório.
- **Modelo online (cliente-servidor)**: partidas online usam estado centralizado em um servidor que arbitra as regras; os dispositivos dos jogadores atuam como clientes. Bots de IA podem preencher vagas em qualquer um dos modos de conexão.
- **Comunicação entre parceiros**: funciona por frases e gestos visuais predefinidos (gírias), nunca por chat ou voz livre sobre as cartas.
- **Regra da "mão de 11" (11x11)**: na v1 não há tratamento especial; a partida segue normalmente até algum time chegar a 12.
- **Empate de rodada e mão nula**: cartas de força equivalente anulam a rodada (nenhum time marca; pedidos válidos continuam); se a mão termina sem vencedor de rodadas (1x1 com rodada nula, por exemplo), a mão é nula e nenhum time pontua o valor em disputa.
- **Localização**: apenas português do Brasil na v1.
- **Escopo de plataformas (constituição do projeto)**: a mesma base de código roda na web e em dispositivos móveis (Android/iOS via empacotamento nativo), sem dependências exclusivas de um ambiente.
- **Dependência de testes (constituição do projeto)**: testes automatizados obrigatórios para lógica crítica — pontuação, valor de mão/manilha e persistência de estado de partida.
- **Desconexões**: a persistência do estado de uma partida deve permitir retomar (ou encerrar de forma limpa) uma partida interrompida por queda de conexão.
- **Persistência (save)**: na v1 o sistema persiste a partida em andamento (reconexão/retomada) e o resultado das partidas concluídas (histórico de fim de partida); partidas online persistem no servidor central, partidas contra bots persistem no dispositivo do jogador; não há save manual nem exportação de dados.