// Histórico de atualizações do jogo.
// Para lançar uma nova versão, adicione um objeto NO TOPO da lista.
// tipo: 'adicionado' | 'modificado' | 'removido'
const ATUALIZACOES = [
  {
    versao: '0.5.0',
    data: '23/10/2026',
    itens: [
      { tipo: 'modificado', texto: 'Novo visual minimalista: lobby todo preto, fonte limpa e botões com cantos levemente arredondados.' },
      { tipo: 'modificado', texto: 'Atualizações, pausa, vitória e derrota seguem o mesmo visual. O jogo em si não mudou.' },
      { tipo: 'removido', texto: 'Botão Sair removido do lobby.' }
    ]
  },
  {
    versao: '0.4.0',
    data: '23/10/2026',
    itens: [
      { tipo: 'adicionado', texto: 'Botão Sair no lobby: fecha a aba (ou avisa como fechar, se o navegador não deixar).' },
      { tipo: 'adicionado', texto: 'Lobby navegável pelo teclado: setas (ou W e S) trocam de botão, Enter escolhe e Esc volta.' },
      { tipo: 'modificado', texto: 'O botão Atualização agora se chama Atualizações.' }
    ]
  },
  {
    versao: '0.3.0',
    data: '23/10/2026',
    itens: [
      { tipo: 'adicionado', texto: 'Tela inicial minimalista com os botões Jogar e Atualização.' },
      { tipo: 'adicionado', texto: 'Histórico de atualizações dentro do jogo.' },
      { tipo: 'adicionado', texto: 'Botão Menu nas telas de pausa, vitória e derrota.' },
      { tipo: 'modificado', texto: 'O jogo agora abre no menu em vez de começar direto.' }
    ]
  },
  {
    versao: '0.2.0',
    data: '23/10/2026',
    itens: [
      { tipo: 'adicionado', texto: 'Mira vertical livre, estilo CS e Valorant (mouse e setas para cima e para baixo).' },
      { tipo: 'modificado', texto: 'O tiro agora acerta conforme a altura da mira: cabeça e pés contam, por cima ou por baixo erra.' },
      { tipo: 'removido', texto: 'As setas para cima e para baixo não movem mais o personagem (use W e S).' }
    ]
  },
  {
    versao: '0.1.0',
    data: '23/10/2026',
    itens: [
      { tipo: 'adicionado', texto: 'Primeira versão jogável: engine de raycasting em primeira pessoa.' },
      { tipo: 'adicionado', texto: 'Demônios que perseguem e atacam, com 3 pontos de vida cada.' },
      { tipo: 'adicionado', texto: 'Pacotes de vida e munição, minimapa e efeitos sonoros.' },
      { tipo: 'adicionado', texto: 'Telas de pausa, vitória e derrota.' }
    ]
  }
];
