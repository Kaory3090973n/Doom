(() => {
  'use strict';

  // ---------------------------------------------------------------
  // MAPA  (1 e 2 = paredes | P = jogador | E = demônio | H = vida | A = munição)
  // ---------------------------------------------------------------
  const MAPA = [
    "1111111111111111",
    "1P.....1.......1",
    "1......1...E...1",
    "1..2...1.......1",
    "1..2.......2...1",
    "1..2...1...2...1",
    "1......1.......1",
    "1111.1111111.111",
    "1......E.......1",
    "1.......2222...1",
    "1..E...........1",
    "1.....1111.....1",
    "1.H...1..1..A..1",
    "1.....1..1.....1",
    "1...E.....1.E..1",
    "1111111111111111"
  ];

  const W = 480, H = 300;
  const FOV = 0.66;
  const MAPA_W = MAPA[0].length, MAPA_H = MAPA.length;

  const canvas = document.getElementById('tela');
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  const el = {
    vida: document.getElementById('hudVida'),
    municao: document.getElementById('hudMunicao'),
    inimigos: document.getElementById('hudInimigos'),
    flash: document.getElementById('danoFlash'),
    overlay: document.getElementById('overlay'),
    titulo: document.getElementById('titulo'),
    mensagem: document.getElementById('mensagem'),
    btn: document.getElementById('btnIniciar'),
    btnMenu: document.getElementById('btnMenu'),
    jogo: document.getElementById('jogo'),
    menu: document.getElementById('menu'),
    menuPrincipal: document.getElementById('menuPrincipal'),
    menuUpdates: document.getElementById('menuUpdates'),
    menuVersao: document.getElementById('menuVersao'),
    lista: document.getElementById('listaUpdates'),
    btnJogar: document.getElementById('btnJogar'),
    btnAtualizacao: document.getElementById('btnAtualizacao'),
    btnVoltar: document.getElementById('btnVoltar')
  };

  // ---------------------------------------------------------------
  // ESTADO
  // ---------------------------------------------------------------
  const grid = [];
  const inimigos = [];
  const itens = [];
  const PITCH_MAX = 150; // limite (em pixels) de olhar para cima/baixo
  const p = { x: 1.5, y: 1.5, a: 0, pitch: 0, hp: 100, municao: 30 };
  let estado = 'menu'; // menu | jogando | pausado | morto | vitoria
  let cooldown = 0, flashTiro = 0, recuo = 0, balanco = 0, tempo = 0;
  let travado = false;

  function carregarFase() {
    inimigos.length = 0;
    itens.length = 0;
    for (let y = 0; y < MAPA_H; y++) {
      grid[y] = [];
      for (let x = 0; x < MAPA_W; x++) {
        const c = MAPA[y][x];
        grid[y][x] = (c === '1' || c === '2') ? Number(c) : 0;
        const cx = x + 0.5, cy = y + 0.5;
        if (c === 'P') { p.x = cx; p.y = cy; }
        if (c === 'E') inimigos.push({ x: cx, y: cy, hp: 3, vivo: true, cd: 1 + Math.random(), hit: 0 });
        if (c === 'H') itens.push({ x: cx, y: cy, tipo: 'vida', ativo: true });
        if (c === 'A') itens.push({ x: cx, y: cy, tipo: 'municao', ativo: true });
      }
    }
    p.a = 0.3;
    p.pitch = 0;
    p.hp = 100;
    p.municao = 30;
    cooldown = flashTiro = recuo = 0;
  }

  // ---------------------------------------------------------------
  // TEXTURAS E SPRITES (gerados por código, sem imagens externas)
  // ---------------------------------------------------------------
  function criarCanvas(fn) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    fn(c.getContext('2d'));
    return c;
  }

  const texTijolo = criarCanvas(g => {
    g.fillStyle = '#6b3a2a';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#2e140d';
    for (let r = 0; r < 8; r++) {
      g.fillRect(0, r * 8, 64, 1);
      const off = (r % 2) * 8;
      for (let c = -1; c < 5; c++) g.fillRect(c * 16 + off, r * 8, 1, 8);
    }
    for (let i = 0; i < 350; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
      g.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, 2, 2);
    }
  });

  const texMetal = criarCanvas(g => {
    g.fillStyle = '#4a5560';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#2b323a';
    g.fillRect(0, 0, 64, 3);
    g.fillRect(0, 61, 64, 3);
    g.fillRect(0, 0, 3, 64);
    g.fillRect(61, 0, 3, 64);
    g.fillRect(30, 0, 4, 64);
    g.fillStyle = '#39ff6a';
    g.fillRect(8, 14, 14, 3);
    g.fillRect(8, 46, 14, 3);
    g.fillStyle = '#ff3b3b';
    g.fillRect(42, 14, 14, 3);
    g.fillRect(42, 46, 14, 3);
    for (let i = 0; i < 250; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
      g.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, 2, 1);
    }
  });
  const texturas = [null, texTijolo, texMetal];

  function desenharDemonio(g) {
    g.fillStyle = '#7a1414'; g.fillRect(18, 24, 28, 32);   // corpo
    g.fillStyle = '#8b1a1a'; g.fillRect(10, 26, 8, 22);    // braço esq
    g.fillRect(46, 26, 8, 22);                             // braço dir
    g.fillStyle = '#b02a2a'; g.fillRect(22, 8, 20, 18);    // cabeça
    g.fillStyle = '#e8e0c8'; g.fillRect(20, 3, 4, 9);      // chifres
    g.fillRect(40, 3, 4, 9);
    g.fillStyle = '#ffe14a'; g.fillRect(26, 14, 4, 4);     // olhos
    g.fillRect(34, 14, 4, 4);
    g.fillStyle = '#000'; g.fillRect(27, 21, 10, 4);       // boca
    g.fillStyle = '#fff'; g.fillRect(28, 21, 2, 2);
    g.fillRect(33, 21, 2, 2);
    g.fillStyle = '#5a0e0e'; g.fillRect(20, 56, 10, 8);    // pernas
    g.fillRect(34, 56, 10, 8);
    g.fillStyle = '#000'; g.fillRect(10, 46, 8, 3);        // garras
    g.fillRect(46, 46, 8, 3);
  }
  const sprDemonio = criarCanvas(desenharDemonio);
  const sprDemonioHit = criarCanvas(g => {
    desenharDemonio(g);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(0, 0, 64, 64);
  });
  const sprCorpo = criarCanvas(g => {
    g.fillStyle = '#5a0e0e'; g.fillRect(8, 50, 48, 14);
    g.fillStyle = '#8b1a1a'; g.fillRect(14, 46, 30, 10);
    g.fillStyle = '#b02a2a'; g.fillRect(40, 44, 14, 12);
    g.fillStyle = '#3a0000'; g.fillRect(4, 58, 56, 6);
  });
  const sprVida = criarCanvas(g => {
    g.fillStyle = '#eee'; g.fillRect(16, 40, 32, 24);
    g.fillStyle = '#d11'; g.fillRect(29, 44, 6, 16); g.fillRect(24, 49, 16, 6);
  });
  const sprMunicao = criarCanvas(g => {
    g.fillStyle = '#6b5a1a'; g.fillRect(14, 44, 36, 20);
    g.fillStyle = '#ffd23f';
    for (let i = 0; i < 4; i++) g.fillRect(18 + i * 8, 36, 5, 14);
    g.fillStyle = '#c9a227';
    for (let i = 0; i < 4; i++) g.fillRect(18 + i * 8, 36, 5, 3);
  });

  // ---------------------------------------------------------------
  // ÁUDIO (osciladores simples)
  // ---------------------------------------------------------------
  let audio;
  function som(freq, dur, tipo = 'square', vol = 0.12, slide = 0) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = tipo;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) { /* sem áudio, segue o jogo */ }
  }

  // ---------------------------------------------------------------
  // ENTRADA
  // ---------------------------------------------------------------
  const teclas = {};
  window.addEventListener('keydown', e => {
    teclas[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyP') alternarPausa();
    if (e.code === 'Space' && estado === 'jogando') atirar();
  });
  window.addEventListener('keyup', e => { teclas[e.code] = false; });

  canvas.addEventListener('mousedown', () => {
    if (estado === 'jogando') {
      if (!travado && canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch (e) { /* ignora */ }
      }
      atirar();
    }
  });

  document.addEventListener('mousemove', e => {
    if (estado === 'jogando' && travado) {
      p.a += e.movementX * 0.0025;
      p.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, p.pitch - e.movementY * 0.9));
    }
  });

  document.addEventListener('pointerlockchange', () => {
    travado = document.pointerLockElement === canvas;
    if (!travado && estado === 'jogando') pausar();
  });

  el.btn.addEventListener('click', () => {
    if (estado === 'pausado') {
      continuar();
    } else {
      carregarFase();
      estado = 'jogando';
      el.overlay.classList.add('oculto');
    }
    if (canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch (e) { /* ignora */ }
    }
  });

  // ---------------------------------------------------------------
  // MENU INICIAL E ATUALIZAÇÕES
  // ---------------------------------------------------------------
  function montarAtualizacoes() {
    el.lista.textContent = '';
    for (const v of ATUALIZACOES) {
      const bloco = document.createElement('section');
      bloco.className = 'versao';

      const cab = document.createElement('div');
      cab.className = 'versao-cab';
      const titulo = document.createElement('span');
      titulo.textContent = 'alpha ' + v.versao;
      const data = document.createElement('small');
      data.textContent = v.data;
      cab.append(titulo, data);
      bloco.append(cab);

      for (const m of v.itens) {
        const linha = document.createElement('div');
        linha.className = 'mudanca';
        const tag = document.createElement('span');
        tag.className = 'tag ' + m.tipo;
        tag.textContent = m.tipo.toUpperCase();
        const texto = document.createElement('span');
        texto.textContent = m.texto;
        linha.append(tag, texto);
        bloco.append(linha);
      }
      el.lista.append(bloco);
    }
    el.menuVersao.textContent = 'alpha ' + ATUALIZACOES[0].versao;
  }

  function abrirMenu() {
    estado = 'menu';
    el.jogo.classList.add('em-menu');
    el.overlay.classList.add('oculto');
    el.menu.classList.remove('oculto');
    el.menuUpdates.classList.add('oculto');
    el.menuPrincipal.classList.remove('oculto');
    if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  }

  el.btnJogar.addEventListener('click', () => {
    carregarFase();
    estado = 'jogando';
    el.jogo.classList.remove('em-menu');
    el.menu.classList.add('oculto');
    if (canvas.requestPointerLock) {
      try { canvas.requestPointerLock(); } catch (e) { /* ignora */ }
    }
  });

  el.btnAtualizacao.addEventListener('click', () => {
    el.menuPrincipal.classList.add('oculto');
    el.menuUpdates.classList.remove('oculto');
    el.lista.scrollTop = 0;
  });

  el.btnVoltar.addEventListener('click', () => {
    el.menuUpdates.classList.add('oculto');
    el.menuPrincipal.classList.remove('oculto');
  });

  el.btnMenu.addEventListener('click', abrirMenu);

  function pausar() {
    if (estado !== 'jogando') return;
    estado = 'pausado';
    el.titulo.textContent = 'PAUSADO';
    el.mensagem.textContent = 'Respire fundo. Eles ainda estão aí.';
    el.btn.textContent = 'CONTINUAR';
    el.overlay.classList.remove('oculto');
    if (document.exitPointerLock) document.exitPointerLock();
  }

  function continuar() {
    estado = 'jogando';
    el.overlay.classList.add('oculto');
  }

  function alternarPausa() {
    if (estado === 'jogando') pausar();
    else if (estado === 'pausado') continuar();
  }

  function fimDeJogo(venceu) {
    estado = venceu ? 'vitoria' : 'morto';
    el.titulo.textContent = venceu ? 'VITÓRIA!' : 'VOCÊ MORREU';
    el.mensagem.textContent = venceu
      ? 'Todos os demônios foram eliminados.'
      : 'Os demônios venceram desta vez.';
    el.btn.textContent = 'JOGAR DE NOVO';
    el.overlay.classList.remove('oculto');
    if (document.exitPointerLock) document.exitPointerLock();
  }

  // ---------------------------------------------------------------
  // FÍSICA E UTILIDADES
  // ---------------------------------------------------------------
  function livre(x, y, r) {
    const pts = [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]];
    for (const [px, py] of pts) {
      const gx = px | 0, gy = py | 0;
      if (gx < 0 || gy < 0 || gx >= MAPA_W || gy >= MAPA_H || grid[gy][gx]) return false;
    }
    return true;
  }

  function mover(obj, dx, dy, r) {
    if (livre(obj.x + dx, obj.y, r)) obj.x += dx;
    if (livre(obj.x, obj.y + dy, r)) obj.y += dy;
  }

  function temLinhaDeVisao(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    const passos = Math.ceil(d / 0.1);
    for (let i = 1; i < passos; i++) {
      const t = i / passos;
      if (grid[(y0 + dy * t) | 0][(x0 + dx * t) | 0]) return false;
    }
    return true;
  }

  function levarDano(d) {
    if (estado !== 'jogando') return;
    p.hp = Math.max(0, p.hp - d);
    el.flash.classList.add('ativo');
    requestAnimationFrame(() => requestAnimationFrame(() => el.flash.classList.remove('ativo')));
    som(120, 0.2, 'sawtooth', 0.18, -60);
    if (p.hp <= 0) fimDeJogo(false);
  }

  // ---------------------------------------------------------------
  // TIRO (hitscan)
  // ---------------------------------------------------------------
  const zBuf = new Float32Array(W);

  function atirar() {
    if (cooldown > 0 || p.municao <= 0) {
      if (p.municao <= 0 && cooldown <= 0) { som(90, 0.08, 'square', 0.08); cooldown = 0.25; }
      return;
    }
    p.municao--;
    cooldown = 0.4;
    flashTiro = 0.08;
    recuo = 1;
    som(180, 0.18, 'sawtooth', 0.2, -140);

    // A mira fica no centro da tela (W/2, H/2). Acerta o demônio cujo
    // corpo (na projeção da tela) cobre esse ponto, sem parede na frente.
    const dirX = Math.cos(p.a), dirY = Math.sin(p.a);
    const planeX = -dirY * FOV, planeY = dirX * FOV;
    const horizonte = H / 2 + p.pitch;
    let alvo = null, alvoDist = Infinity;
    for (const e of inimigos) {
      if (!e.vivo) continue;
      const sx = e.x - p.x, sy = e.y - p.y;
      const inv = 1 / (planeX * dirY - dirX * planeY);
      const tX = inv * (dirY * sx - dirX * sy);
      const tY = inv * (-planeY * sx + planeX * sy);
      if (tY <= 0.15) continue;
      const telaX = (W / 2) * (1 + tX / tY);
      const tam = (H / tY) * 0.9;
      const chao = horizonte + (H / tY) / 2;
      const topo = chao - tam;
      const colunaMira = Math.max(0, Math.min(W - 1, W >> 1));
      if (
        Math.abs(telaX - W / 2) < tam * 0.28 &&
        H / 2 > topo + tam * 0.05 && H / 2 < chao &&
        tY < zBuf[colunaMira] && tY < alvoDist
      ) {
        alvo = e;
        alvoDist = tY;
      }
    }
    if (alvo) {
      alvo.hp--;
      alvo.hit = 0.12;
      if (alvo.hp <= 0) {
        alvo.vivo = false;
        som(300, 0.35, 'sawtooth', 0.18, -250);
      } else {
        som(220, 0.08, 'square', 0.1);
      }
    }
  }

  // ---------------------------------------------------------------
  // ATUALIZAÇÃO
  // ---------------------------------------------------------------
  function atualizar(dt) {
    tempo += dt;
    cooldown = Math.max(0, cooldown - dt);
    flashTiro = Math.max(0, flashTiro - dt);
    recuo = Math.max(0, recuo - dt * 5);

    // girar
    if (teclas.ArrowLeft) p.a -= 2.4 * dt;
    if (teclas.ArrowRight) p.a += 2.4 * dt;
    if (teclas.ArrowUp) p.pitch = Math.min(PITCH_MAX, p.pitch + 160 * dt);
    if (teclas.ArrowDown) p.pitch = Math.max(-PITCH_MAX, p.pitch - 160 * dt);

    // mover
    let frente = 0, lado = 0;
    if (teclas.KeyW) frente += 1;
    if (teclas.KeyS) frente -= 1;
    if (teclas.KeyD) lado += 1;
    if (teclas.KeyA) lado -= 1;
    if (frente || lado) {
      const n = Math.hypot(frente, lado);
      frente /= n; lado /= n;
      const v = 3.2 * dt;
      const dx = (Math.cos(p.a) * frente - Math.sin(p.a) * lado) * v;
      const dy = (Math.sin(p.a) * frente + Math.cos(p.a) * lado) * v;
      mover(p, dx, dy, 0.22);
      balanco += dt * 9;
    }

    // itens
    for (const it of itens) {
      if (!it.ativo) continue;
      if (Math.hypot(it.x - p.x, it.y - p.y) < 0.6) {
        if (it.tipo === 'vida' && p.hp < 100) {
          p.hp = Math.min(100, p.hp + 30);
          it.ativo = false;
          som(660, 0.15, 'triangle', 0.15, 400);
        } else if (it.tipo === 'municao') {
          p.municao += 12;
          it.ativo = false;
          som(520, 0.12, 'triangle', 0.15, 300);
        }
      }
    }

    // inimigos
    for (const e of inimigos) {
      if (!e.vivo) continue;
      e.hit = Math.max(0, e.hit - dt);
      e.cd -= dt;
      const dx = p.x - e.x, dy = p.y - e.y;
      const dist = Math.hypot(dx, dy);
      const ve = dist < 12 && temLinhaDeVisao(e.x, e.y, p.x, p.y);
      if (ve) {
        if (dist > 0.9) {
          const v = 1.1 * dt;
          mover(e, (dx / dist) * v, (dy / dist) * v, 0.28);
        }
        if (e.cd <= 0) {
          if (dist < 1.2) {
            levarDano(8);
            e.cd = 0.9;
          } else if (dist < 7) {
            if (Math.random() < 0.4) levarDano(6);
            som(400, 0.1, 'square', 0.05, -200);
            e.cd = 1.6;
          } else {
            e.cd = 0.5;
          }
        }
      }
    }

    // vitória
    if (estado === 'jogando' && inimigos.every(e => !e.vivo)) fimDeJogo(true);
  }

  // ---------------------------------------------------------------
  // RENDERIZAÇÃO
  // ---------------------------------------------------------------
  const gradTeto = ctx.createLinearGradient(0, 0, 0, H / 2);
  gradTeto.addColorStop(0, '#0a0a14');
  gradTeto.addColorStop(1, '#2a2a3a');
  const gradChao = ctx.createLinearGradient(0, H / 2, 0, H);
  gradChao.addColorStop(0, '#1a1410');
  gradChao.addColorStop(1, '#4a3a2c');

  function desenharMundo(dirX, dirY, planeX, planeY) {
    const horizonte = H / 2 + p.pitch;
    ctx.save();
    ctx.translate(0, p.pitch);
    ctx.fillStyle = gradTeto;
    ctx.fillRect(0, -H * 2, W, H / 2 + H * 2);
    ctx.fillStyle = gradChao;
    ctx.fillRect(0, H / 2, W, H * 2);
    ctx.restore();

    for (let x = 0; x < W; x++) {
      const cam = 2 * x / W - 1;
      const rx = dirX + planeX * cam;
      const ry = dirY + planeY * cam;
      let mx = p.x | 0, my = p.y | 0;
      const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
      let passoX, passoY, sdx, sdy;
      if (rx < 0) { passoX = -1; sdx = (p.x - mx) * ddx; } else { passoX = 1; sdx = (mx + 1 - p.x) * ddx; }
      if (ry < 0) { passoY = -1; sdy = (p.y - my) * ddy; } else { passoY = 1; sdy = (my + 1 - p.y) * ddy; }

      let lado = 0, tipo = 1;
      for (;;) {
        if (sdx < sdy) { sdx += ddx; mx += passoX; lado = 0; }
        else { sdy += ddy; my += passoY; lado = 1; }
        if (mx < 0 || my < 0 || mx >= MAPA_W || my >= MAPA_H) { tipo = 1; break; }
        if (grid[my][mx]) { tipo = grid[my][mx]; break; }
      }

      const dist = Math.max(0.05, lado === 0 ? sdx - ddx : sdy - ddy);
      zBuf[x] = dist;

      let wallX = lado === 0 ? p.y + dist * ry : p.x + dist * rx;
      wallX -= Math.floor(wallX);
      let tx = (wallX * 64) | 0;
      if (lado === 0 && rx > 0) tx = 63 - tx;
      if (lado === 1 && ry < 0) tx = 63 - tx;

      const altura = H / dist;
      const topo = horizonte - altura / 2;
      ctx.drawImage(texturas[tipo], tx, 0, 1, 64, x, topo, 1, altura);

      const sombra = Math.min(0.85, dist / 14) + (lado ? 0.18 : 0);
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.92, sombra)})`;
      ctx.fillRect(x, topo, 1, altura);
    }
  }

  function desenharSprite(obj, img, escala, dirX, dirY, planeX, planeY) {
    const sx = obj.x - p.x, sy = obj.y - p.y;
    const inv = 1 / (planeX * dirY - dirX * planeY);
    const tX = inv * (dirY * sx - dirX * sy);
    const tY = inv * (-planeY * sx + planeX * sy);
    if (tY <= 0.15) return;

    const telaX = (W / 2) * (1 + tX / tY);
    const tam = (H / tY) * escala;
    const chao = H / 2 + p.pitch + (H / tY) / 2;
    const topo = chao - tam;
    const x0 = telaX - tam / 2;
    const ini = Math.max(0, Math.floor(x0));
    const fim = Math.min(W - 1, Math.floor(x0 + tam));
    const escuro = Math.min(0.8, tY / 14);

    for (let s = ini; s <= fim; s++) {
      if (tY >= zBuf[s]) continue;
      const tx = Math.min(63, ((s - x0) / tam * 64) | 0);
      ctx.drawImage(img, tx, 0, 1, 64, s, topo, 1, tam);
      ctx.fillStyle = `rgba(0,0,0,${escuro})`;
      ctx.fillRect(s, topo, 1, tam);
    }
  }

  function desenharSprites(dirX, dirY, planeX, planeY) {
    const lista = [];
    for (const e of inimigos) lista.push({ o: e, tipo: 'inimigo' });
    for (const it of itens) if (it.ativo) lista.push({ o: it, tipo: 'item' });
    lista.forEach(s => { s.d = (s.o.x - p.x) ** 2 + (s.o.y - p.y) ** 2; });
    lista.sort((a, b) => b.d - a.d);

    for (const s of lista) {
      if (s.tipo === 'inimigo') {
        const e = s.o;
        if (e.vivo) desenharSprite(e, e.hit > 0 ? sprDemonioHit : sprDemonio, 0.9, dirX, dirY, planeX, planeY);
        else desenharSprite(e, sprCorpo, 0.9, dirX, dirY, planeX, planeY);
      } else {
        const it = s.o;
        desenharSprite(it, it.tipo === 'vida' ? sprVida : sprMunicao, 0.5, dirX, dirY, planeX, planeY);
      }
    }
  }

  function desenharArma() {
    const bx = Math.sin(balanco) * 5;
    const by = Math.abs(Math.cos(balanco)) * 4 + recuo * 14;
    const cx = W / 2 + bx;
    const base = H - 30 + by;

    if (flashTiro > 0) {
      const g = ctx.createRadialGradient(cx, base - 62, 2, cx, base - 62, 36);
      g.addColorStop(0, 'rgba(255,255,200,1)');
      g.addColorStop(0.5, 'rgba(255,170,40,0.8)');
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - 40, base - 100, 80, 80);
    }

    ctx.fillStyle = '#222';  ctx.fillRect(cx - 7, base - 58, 14, 40);  // cano
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(cx - 5, base - 58, 4, 40);
    ctx.fillStyle = '#111';  ctx.fillRect(cx - 4, base - 62, 8, 6);    // boca do cano
    ctx.fillStyle = '#555';  ctx.fillRect(cx - 16, base - 22, 32, 26); // corpo
    ctx.fillStyle = '#6b6b6b'; ctx.fillRect(cx - 16, base - 22, 32, 4);
    ctx.fillStyle = '#7a4a2a'; ctx.fillRect(cx - 12, base + 2, 24, 30); // cabo
    ctx.fillStyle = '#5a3418'; ctx.fillRect(cx - 12, base + 2, 5, 30);
  }

  function desenharMiniMapa() {
    const c = 4, ox = W - MAPA_W * c - 6, oy = 6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(ox - 2, oy - 2, MAPA_W * c + 4, MAPA_H * c + 4);
    for (let y = 0; y < MAPA_H; y++) {
      for (let x = 0; x < MAPA_W; x++) {
        if (grid[y][x]) {
          ctx.fillStyle = grid[y][x] === 2 ? '#6a7a8a' : '#8a5a44';
          ctx.fillRect(ox + x * c, oy + y * c, c, c);
        }
      }
    }
    ctx.fillStyle = '#ff3030';
    for (const e of inimigos) if (e.vivo) ctx.fillRect(ox + e.x * c - 1, oy + e.y * c - 1, 3, 3);
    ctx.fillStyle = '#4dff4d';
    ctx.fillRect(ox + p.x * c - 1, oy + p.y * c - 1, 3, 3);
    ctx.strokeStyle = '#4dff4d';
    ctx.beginPath();
    ctx.moveTo(ox + p.x * c, oy + p.y * c);
    ctx.lineTo(ox + (p.x + Math.cos(p.a) * 1.5) * c, oy + (p.y + Math.sin(p.a) * 1.5) * c);
    ctx.stroke();
  }

  function desenharMira() {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(W / 2 - 1, H / 2 - 5, 2, 3);
    ctx.fillRect(W / 2 - 1, H / 2 + 2, 2, 3);
    ctx.fillRect(W / 2 - 5, H / 2 - 1, 3, 2);
    ctx.fillRect(W / 2 + 2, H / 2 - 1, 3, 2);
  }

  function desenhar() {
    const dirX = Math.cos(p.a), dirY = Math.sin(p.a);
    const planeX = -dirY * FOV, planeY = dirX * FOV;
    desenharMundo(dirX, dirY, planeX, planeY);
    desenharSprites(dirX, dirY, planeX, planeY);
    desenharArma();
    desenharMira();
    desenharMiniMapa();

    el.vida.textContent = p.hp;
    el.municao.textContent = p.municao;
    el.inimigos.textContent = inimigos.filter(e => e.vivo).length;
  }

  // ---------------------------------------------------------------
  // LOOP PRINCIPAL
  // ---------------------------------------------------------------
  let ultimo = performance.now();
  function loop(agora) {
    const dt = Math.min(0.05, (agora - ultimo) / 1000);
    ultimo = agora;
    if (estado === 'jogando') atualizar(dt);
    desenhar();
    requestAnimationFrame(loop);
  }

  carregarFase();
  montarAtualizacoes();
  abrirMenu();
  requestAnimationFrame(loop);
})();
