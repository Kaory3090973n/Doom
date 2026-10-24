'use strict';

/* =====================================================================
 * ÍNDICE (cada bloco é independente e pode virar um arquivo .js)
 *   0) VERSÕES    - histórico de atualizações (mostrado no jogo)
 *   1) CONFIG     - todos os números de "game feel" num lugar só
 *   2) UTILIDADES
 *   3) ESTADO     - o objeto de dados do jogador (o que vai pela rede)
 *   4) REDE       - transportes (local hoje, WebSocket amanhã) e NetClient
 *   5) INPUT      - teclado e mouse -> "comando" por passo de física
 *   6) WORLD      - caixas sólidas, mapa de teste, raycast (sem gráficos)
 *   7) PLAYER     - física, colisão, pulo e agachar (opera sobre o ESTADO)
 *   8) AVATAR     - boneco de blocos (estilo Roblox)
 *   9) VIEW       - cena do Three.js: luzes, mapa, câmera
 *  10) REMOTOS    - jogadores remotos, desenhados a partir de snapshots
 *  11) BOT        - "jogador remoto" falso que usa o mesmo caminho da rede
 *  12) GAME       - loop de passo fixo, Pointer Lock, telas e HUD
 *
 * Unidades: metros, segundos, radianos. O eixo Y é "para cima".
 * Convenção de ângulo: yaw 0 olha para -Z; aumentar o yaw gira para a direita.
 * ===================================================================== */


/* =====================================================================
 * 0) VERSÕES - a cada mudança no jogo, adicione uma entrada NO TOPO.
 *    Novos recursos/mecânicas: sobe o número do meio (0.2.0 -> 0.3.0).
 *    Só ajustes e correções: sobe o último (0.2.0 -> 0.2.1).
 *    tipo: 'adicionado' | 'modificado' | 'removido'
 * ===================================================================== */
const CHANGELOG = [
  {
    versao: '0.2.0', data: '24/10/2026',
    itens: [
      { tipo: 'modificado', texto: 'Visual refeito com Three.js: iluminação, sombras e névoa. O código agora é dividido em index.html, style.css e script.js.' },
      { tipo: 'adicionado', texto: 'Boneco de blocos (estilo Roblox) com animação de andar, agachar e olhar para cima e para baixo.' },
      { tipo: 'adicionado', texto: 'Bot de teste andando em círculo pela sala, para você ver o estilo do personagem.' },
      { tipo: 'adicionado', texto: 'Estrutura pronta para multiplayer: o estado do jogador é um objeto simples (posição, rotação, agachado) enviado como snapshot por um adaptador de rede.' },
      { tipo: 'adicionado', texto: 'Tecla V alterna entre primeira e terceira pessoa, para ver o seu próprio boneco.' },
      { tipo: 'removido', texto: 'Teto da sala (para a luz e as sombras funcionarem) e o renderizador WebGL próprio.' }
    ]
  },
  {
    versao: '0.1.0', data: '24/10/2026',
    itens: [
      { tipo: 'adicionado', texto: 'Movimentação estilo CS: WASD com inércia, pulo, agachar (Ctrl ou C) e Shift para andar devagar.' },
      { tipo: 'adicionado', texto: 'Câmera 3D com mouse travado (Pointer Lock), colisão com paredes e degraus.' },
      { tipo: 'adicionado', texto: 'Sala de testes com escada, caixas, obstáculo baixo e túnel para passar agachado.' },
      { tipo: 'adicionado', texto: 'Telas de início e pausa, lista de atualizações e versão no canto da tela.' }
    ]
  }
];


/* =====================================================================
 * 1) CONFIG
 * ===================================================================== */
const CONFIG = Object.freeze({
  physicsHz: 120,            // passos de física por segundo (fixo, previsível)
  netSendHz: 20,             // quantas vezes por segundo o estado é enviado

  // --- corpo do jogador (caixa AABB) ---
  radius: 0.3,               // meia-largura (X e Z)
  heightStand: 1.8,
  heightCrouch: 1.2,
  eyeStand: 1.62,            // altura dos olhos acima dos pés
  eyeCrouch: 1.08,
  eyeSmooth: 16,             // suavidade da câmera ao agachar/levantar

  // --- velocidades (m/s) ---
  runSpeed: 5.4,             // velocidade base
  walkSpeed: 2.8,            // Shift: andar devagar/silencioso (estilo CS)
  crouchSpeed: 2.2,          // agachado
  shiftMode: 'walk',         // 'walk' = Shift anda devagar (CS)  |  'sprint' = Shift corre
  sprintMultiplier: 1.35,    // usado só se shiftMode === 'sprint'

  // --- aceleração e inércia (modelo do Quake/CS) ---
  groundAccel: 10,           // quão rápido chega na velocidade máxima no chão
  airAccel: 12,              // aceleração no ar (controle de strafe no ar)
  airWishCap: 0.7,           // limite do "desejo" no ar: dá o controle típico de CS
  friction: 6,               // atrito no chão (inércia ao soltar as teclas)
  stopSpeed: 1.5,            // abaixo disso o atrito para o personagem mais rápido

  // --- vertical ---
  gravity: 20,               // m/s^2 (CS usa ~20; a real seria 9.81, mas parece "flutuar")
  jumpSpeed: 6.4,            // altura do pulo = v^2 / (2g) ~ 1,02 m
  maxFallSpeed: 55,
  autoBhop: false,           // true = segurar Espaço pula de novo ao pousar
  jumpBuffer: 0.10,          // aperta Espaço um pouco antes de pousar e o pulo sai ao tocar o chão
  coyoteTime: 0.07,          // ainda pode pular um instante depois de sair da borda
  stepHeight: 0.35,          // sobe degraus de até 35 cm sem precisar pular

  // --- câmera ---
  mouseSens: 0.0021,         // radianos por pixel do mouse
  fovY: 75,                  // campo de visão vertical (graus)
  near: 0.05,
  far: 150,
  pitchLimit: 89,            // graus para cima/baixo
  punchDecay: 12,            // retorno do "coice" da arma (usado quando houver armas)
  thirdPersonDistance: 3.2   // distância da câmera na terceira pessoa (tecla V)
});
const C = CONFIG;
const X = 0, Y = 1, Z = 2;   // índices dos vetores [x, y, z]
const EPS = 1e-4;            // folga para não "grudar" em paredes
const DEG = Math.PI / 180;


/* =====================================================================
 * 2) UTILIDADES
 * ===================================================================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Interpola ângulos pelo caminho mais curto (evita o "giro de 360°"). */
function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * t;
}


/* =====================================================================
 * 3) ESTADO DO JOGADOR - os dados que identificam um jogador no mundo.
 *    É um objeto simples (sem funções, sem referências ao Three.js):
 *    dá para guardar, enviar por WebSocket e reconstruir do outro lado.
 * ===================================================================== */
function createPlayerState(id, spawn = {}) {
  return {
    id,
    pos: [spawn.x || 0, spawn.y || 0, spawn.z || 0],   // posição dos PÉS
    vel: [0, 0, 0],
    yaw: spawn.yaw || 0,
    pitch: 0,
    crouched: false,
    onGround: false
  };
}

/**
 * Snapshot = a parte do estado que os OUTROS jogadores precisam ver.
 * É isto que trafega pela rede. Formato:
 *   { id, t, pos:[x,y,z], yaw, pitch, crouched, onGround, speed }
 */
function toSnapshot(state, t = performance.now()) {
  const r = (v, n = 3) => +v.toFixed(n);
  return {
    id: state.id,
    t: Math.round(t),
    pos: state.pos.map(v => r(v)),
    yaw: r(state.yaw),
    pitch: r(state.pitch),
    crouched: state.crouched,
    onGround: state.onGround,
    speed: r(Math.hypot(state.vel[X], state.vel[Z]), 2)
  };
}


/* =====================================================================
 * 4) REDE - o jogo só fala com o NetClient. Trocar o transporte
 *    (Loopback -> WebSocket) não exige mexer no resto do código.
 *
 *    Mensagens: { type: 'state', data: snapshot }  |  { type: 'leave', data: { id } }
 *
 *    Para ligar um servidor depois:
 *      const net = new NetClient(new WebSocketTransport('wss://seu-servidor'), meuId);
 *      await net.connect();
 * ===================================================================== */

/** Transporte local: não existe servidor, quem "entrega" mensagens é o bot. */
class LoopbackTransport {
  constructor() { this._handlers = []; this.sent = 0; }
  connect() { return Promise.resolve(); }
  send(/* msg */) { this.sent++; }                 // num servidor real, isto iria pela conexão
  onMessage(fn) { this._handlers.push(fn); }
  deliver(msg) { for (const fn of this._handlers) fn(msg); }   // simula uma mensagem chegando
}

/** Esqueleto do transporte real (mesma interface do Loopback). Ainda não usado. */
class WebSocketTransport {
  constructor(url) { this.url = url; this.ws = null; this._fn = () => {}; this.sent = 0; }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => resolve();
      this.ws.onerror = e => reject(e);
      this.ws.onmessage = e => { try { this._fn(JSON.parse(e.data)); } catch (err) { /* ignora lixo */ } };
    });
  }
  send(msg) { if (this.ws && this.ws.readyState === 1) { this.ws.send(JSON.stringify(msg)); this.sent++; } }
  onMessage(fn) { this._fn = fn; }
}

class NetClient {
  constructor(transport, localId) {
    this.transport = transport;
    this.localId = localId;
    this._listeners = {};
    transport.onMessage(msg => this._receive(msg));
  }
  connect() { return this.transport.connect(); }
  on(type, fn) { (this._listeners[type] ||= []).push(fn); return this; }
  sendState(snapshot) { this.transport.send({ type: 'state', data: snapshot }); }
  get sent() { return this.transport.sent; }

  _receive(msg) {
    if (!msg || !msg.data || msg.data.id === this.localId) return;   // ignora eco de si mesmo
    for (const fn of this._listeners[msg.type] || []) fn(msg.data);
  }
}


/* =====================================================================
 * 5) INPUT - transforma teclado/mouse em um "comando" por passo de física
 *    Para adicionar tiro: inclua `fire` no comando (botão do mouse).
 * ===================================================================== */
class Input {
  constructor() {
    this.keys = new Set();     // teclas seguradas agora
    this._edges = new Set();   // teclas apertadas desde o último comando
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.enabled = false;      // só captura quando o jogo está rodando (mouse travado)

    window.addEventListener('keydown', e => {
      if (!this.enabled) return;
      // evita que Espaço role a página e que Ctrl+algo acione atalhos do navegador
      if (e.code === 'Space' || e.ctrlKey) e.preventDefault();
      if (!e.repeat) { this.keys.add(e.code); this._edges.add(e.code); }
    });
    window.addEventListener('keyup', e => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', e => {
      if (!this.enabled) return;
      // ignora saltos absurdos (bug conhecido de alguns navegadores ao travar o mouse)
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  /** Movimento do mouse acumulado desde a última chamada (em pixels). */
  consumeMouse() {
    const m = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = this.mouseDY = 0;
    return m;
  }

  /** Estado dos controles para UM passo de física. Não depende mais do DOM. */
  buildCommand() {
    const down = c => this.keys.has(c);
    const cmd = {
      forward: (down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0),
      strafe: (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0),
      jumpHeld: down('Space'),
      jumpPressed: this._edges.has('Space'),
      crouch: down('ControlLeft') || down('ControlRight') || down('KeyC'),
      shift: down('ShiftLeft') || down('ShiftRight'),
      toggleView: this._edges.has('KeyV')
    };
    this._edges.clear();       // "apertou agora" vale só para o primeiro passo do quadro
    return cmd;
  }

  reset() { this.keys.clear(); this._edges.clear(); this.mouseDX = this.mouseDY = 0; }
}


/* =====================================================================
 * 6) WORLD - geometria sólida (caixas alinhadas aos eixos), sem gráficos.
 *    Colisão e tiros (raycast) usam esta lista; o View desenha a mesma lista.
 * ===================================================================== */
class World {
  constructor() {
    this.boxes = [];           // { min:[x,y,z], max:[x,y,z], color: 0xRRGGBB }
  }

  addBox(min, max, color) {
    const box = { min, max, color };
    this.boxes.push(box);
    return box;
  }

  /** A caixa [min,max] invade algum sólido? (encostar não conta) */
  overlaps(minx, miny, minz, maxx, maxy, maxz) {
    for (const b of this.boxes) {
      if (minx < b.max[X] && maxx > b.min[X] &&
          miny < b.max[Y] && maxy > b.min[Y] &&
          minz < b.max[Z] && maxz > b.min[Z]) return true;
    }
    return false;
  }

  /**
   * Lança um raio (origin e dir como [x,y,z], dir normalizado).
   * Devolve { distance, point, normal, box } do primeiro sólido atingido, ou null.
   * É a base para tiros "hitscan" quando você adicionar armas.
   */
  raycast(origin, dir, maxDist = 100) {
    let best = null;
    for (const b of this.boxes) {
      let tmin = 0, tmax = maxDist, axis = -1, sign = 0, miss = false;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(dir[i]) < 1e-9) {
          if (origin[i] < b.min[i] || origin[i] > b.max[i]) { miss = true; break; }
          continue;
        }
        const inv = 1 / dir[i];
        let t1 = (b.min[i] - origin[i]) * inv, t2 = (b.max[i] - origin[i]) * inv, s = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { miss = true; break; }
      }
      if (miss || axis < 0) continue;            // errou, ou o raio começou dentro da caixa
      if (!best || tmin < best.distance) {
        const normal = [0, 0, 0]; normal[axis] = sign;
        best = {
          distance: tmin,
          point: [origin[X] + dir[X] * tmin, origin[Y] + dir[Y] * tmin, origin[Z] + dir[Z] * tmin],
          normal, box: b
        };
      }
    }
    return best;
  }

  /** Sala vazia 24x24 com alguns obstáculos para testar cada movimento. */
  static buildTestMap() {
    const w = new World();
    const R = 12, H = 5, T = 1;                    // meia-largura, altura das paredes, espessura

    // chão e 4 paredes (cada uma com um tom, para você se orientar)
    w.addBox([-R - T, -1, -R - T], [R + T, 0, R + T], 0x6a6a74);
    w.addBox([-R - T, 0, -R - T], [R + T, H, -R], 0x6f86a3);   // norte (-Z): azul
    w.addBox([-R - T, 0, R], [R + T, H, R + T], 0xa37070);     // sul   (+Z): vermelho
    w.addBox([R, 0, -R], [R + T, H, R], 0x70a384);             // leste (+X): verde
    w.addBox([-R - T, 0, -R], [-R, H, R], 0xa39c6f);           // oeste (-X): amarelo

    // pulo: caixa baixa (0,9 m) e outra mais alta (1,6 m) para subir em duas etapas
    w.addBox([3, 0, -4], [4, 0.9, -3], 0xc49a55);
    w.addBox([4, 0, -4], [5, 1.6, -3], 0xb08848);
    // obstáculo baixo para pular por cima
    w.addBox([-4, 0, -8], [4, 0.6, -7.6], 0xc49a55);
    // escada: degraus de 30 cm (sobe andando, sem pular)
    for (let i = 0; i < 5; i++) {
      w.addBox([-10, 0, 6 - 1.2 * (i + 1)], [-7, 0.3 * (i + 1), 6 - 1.2 * i], 0x8196ab);
    }
    // túnel baixo: só dá para passar agachado (vão de 1,35 m; em pé são 1,8 m)
    w.addBox([5, 1.35, 3], [10, 1.75, 6], 0xb05a5a);
    for (const [px, pz] of [[5, 3], [9.6, 3], [5, 5.6], [9.6, 5.6]]) {
      w.addBox([px, 0, pz], [px + 0.4, 1.35, pz + 0.4], 0x8a8a94);
    }
    // pilar central para testar deslize em paredes
    w.addBox([-0.5, 0, -1], [0.5, 2.5, 0], 0x8a8a94);
    return w;
  }
}


/* =====================================================================
 * 7) PLAYER - física estilo Quake/CS, colisão AABB, pulo e agachar.
 *    Posição, velocidade, yaw, pitch, agachado e "no chão" vivem em
 *    `player.state` (o objeto do bloco 3). O resto é só cálculo local.
 *    O Player não conhece teclado nem tela: recebe um `cmd` (veja Input)
 *    e um `dt`, então o mesmo código serve para bots ou para um servidor.
 *
 *    Eventos para ligar sons/efeitos/armas:
 *      player.on('jump', fn)   player.on('land', ({speed}) => ...)
 *      player.on('crouch', fn) player.on('stand', fn)
 * ===================================================================== */
class Player {
  constructor(world, state) {
    this.world = world;
    this.state = state;
    this.punch = { yaw: 0, pitch: 0 };          // "coice" temporário (recuo de arma)
    this.height = C.heightStand;                // altura atual da caixa de colisão
    this.eye = C.eyeStand;                      // altura atual da câmera (suavizada)
    this._coyote = 0;
    this._jumpBuffer = 0;
    this._listeners = {};
  }

  // atalhos para o estado compartilhável
  get pos() { return this.state.pos; }
  get vel() { return this.state.vel; }
  get yaw() { return this.state.yaw; }
  set yaw(v) { this.state.yaw = v; }
  get pitch() { return this.state.pitch; }
  set pitch(v) { this.state.pitch = v; }
  get crouched() { return this.state.crouched; }
  set crouched(v) { this.state.crouched = v; }
  get onGround() { return this.state.onGround; }
  set onGround(v) { this.state.onGround = v; }
  get speed() { return Math.hypot(this.vel[X], this.vel[Z]); }   // velocidade horizontal

  // ---------- eventos ----------
  on(name, fn) { (this._listeners[name] ||= []).push(fn); return this; }
  _emit(name, data) { for (const fn of this._listeners[name] || []) fn(data); }

  // ---------- olhar ----------
  look(dyaw, dpitch) {
    this.yaw += dyaw;
    this.pitch = clamp(this.pitch + dpitch, -C.pitchLimit * DEG, C.pitchLimit * DEG);
  }
  addPunch(pitch, yaw = 0) { this.punch.pitch += pitch; this.punch.yaw += yaw; }

  /** Ângulos que a câmera (e os tiros) usam: olhar + coice. */
  viewAngles() {
    return {
      yaw: this.yaw + this.punch.yaw,
      pitch: clamp(this.pitch + this.punch.pitch, -C.pitchLimit * DEG, C.pitchLimit * DEG)
    };
  }
  /** Direção para onde a câmera aponta (vetor unitário). Use em tiros. */
  forward() {
    const a = this.viewAngles();
    return [Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch)];
  }
  eyePosition() { return [this.pos[X], this.pos[Y] + this.eye, this.pos[Z]]; }

  // ---------- passo de física ----------
  update(cmd, dt) {
    this._updateCrouch(cmd.crouch);

    // --- pulo: buffer (apertou cedo) + coyote (saiu da borda há pouco) ---
    const wantsJump = cmd.jumpPressed || (C.autoBhop && cmd.jumpHeld);
    this._jumpBuffer = wantsJump ? C.jumpBuffer : Math.max(0, this._jumpBuffer - dt);
    this._coyote = this.onGround ? C.coyoteTime : Math.max(0, this._coyote - dt);

    let jumped = false;
    if (this._jumpBuffer > 0 && this._coyote > 0) {
      this.vel[Y] = C.jumpSpeed;
      this.onGround = false;
      this._jumpBuffer = this._coyote = 0;
      jumped = true;
      this._emit('jump');
    }
    const grounded = this.onGround;             // no ar (ou pulando) não há atrito

    // --- direção desejada a partir de WASD e do yaw (o coice NÃO afeta o movimento) ---
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);   // frente (plano XZ)
    const rx = Math.cos(this.yaw), rz = Math.sin(this.yaw);    // direita
    let wx = fx * cmd.forward + rx * cmd.strafe;
    let wz = fz * cmd.forward + rz * cmd.strafe;
    const len = Math.hypot(wx, wz);
    let wishSpeed = 0;
    if (len > 0) { wx /= len; wz /= len; wishSpeed = this._maxSpeed(cmd) * Math.min(1, len); }

    // --- aceleração horizontal ---
    if (grounded) {
      this._friction(dt);                                     // inércia: atrito ao soltar as teclas
      if (wishSpeed > 0) this._accelerate(wx, wz, wishSpeed, C.groundAccel, dt, Infinity);
    } else if (wishSpeed > 0) {
      this._accelerate(wx, wz, wishSpeed, C.airAccel, dt, C.airWishCap);   // controle de strafe no ar
    }

    // --- gravidade ---
    if (grounded && !jumped) this.vel[Y] = 0;
    else this.vel[Y] = Math.max(this.vel[Y] - C.gravity * dt, -C.maxFallSpeed);

    // --- movimento com colisão (um eixo por vez) ---
    this._moveHorizontal(X, this.vel[X] * dt, grounded);
    this._moveHorizontal(Z, this.vel[Z] * dt, grounded);
    if (grounded && !jumped) this._snapToGround();            // desce degraus sem "quicar"

    const vyBefore = this.vel[Y];
    if (this._moveAxis(Y, this.vel[Y] * dt)) this.vel[Y] = 0; // bateu no chão ou na cabeça

    // --- está no chão? (sonda curta logo abaixo dos pés) ---
    const was = this.onGround;
    this.onGround = this.vel[Y] <= 0 && this._collides(this.pos[X], this.pos[Y] - 0.02, this.pos[Z], this.height);
    if (!was && this.onGround) this._emit('land', { speed: Math.max(0, -vyBefore) });

    // --- câmera: altura dos olhos suave e retorno do coice ---
    const eyeTarget = this.crouched ? C.eyeCrouch : C.eyeStand;
    this.eye += (eyeTarget - this.eye) * (1 - Math.exp(-C.eyeSmooth * dt));
    const k = Math.exp(-C.punchDecay * dt);
    this.punch.yaw *= k; this.punch.pitch *= k;
  }

  _maxSpeed(cmd) {
    if (this.crouched) return C.crouchSpeed;
    if (cmd.shift) return C.shiftMode === 'walk' ? C.walkSpeed : C.runSpeed * C.sprintMultiplier;
    return C.runSpeed;
  }

  /** Agacha na hora; só levanta se houver espaço livre acima da cabeça. */
  _updateCrouch(wants) {
    if (wants && !this.crouched) {
      this.crouched = true; this.height = C.heightCrouch; this._emit('crouch');
    } else if (!wants && this.crouched &&
               !this._collides(this.pos[X], this.pos[Y], this.pos[Z], C.heightStand)) {
      this.crouched = false; this.height = C.heightStand; this._emit('stand');
    }
  }

  // ---------- modelo de velocidade (Quake/CS) ----------
  _friction(dt) {
    const speed = this.speed;
    if (speed < 1e-4) { this.vel[X] = this.vel[Z] = 0; return; }
    const drop = Math.max(speed, C.stopSpeed) * C.friction * dt;
    const scale = Math.max(0, speed - drop) / speed;
    this.vel[X] *= scale; this.vel[Z] *= scale;
  }

  /** Acelera na direção (dx,dz) até `wishSpeed`. `cap` limita o "desejo" (usado no ar). */
  _accelerate(dx, dz, wishSpeed, accel, dt, cap) {
    const current = this.vel[X] * dx + this.vel[Z] * dz;
    const add = Math.min(wishSpeed, cap) - current;
    if (add <= 0) return;
    const amount = Math.min(accel * wishSpeed * dt, add);
    this.vel[X] += amount * dx; this.vel[Z] += amount * dz;
  }

  // ---------- colisão ----------
  _collides(x, y, z, h) {
    const r = C.radius;
    return this.world.overlaps(x - r, y, z - r, x + r, y + h, z + r);
  }

  /** Move num eixo; se entrar num sólido, encosta na face e devolve true. */
  _moveAxis(axis, delta) {
    if (delta === 0) return false;
    const p = this.pos, r = C.radius, h = this.height;
    p[axis] += delta;
    const lo = axis === Y ? 0 : -r, hi = axis === Y ? h : r;   // extensão do corpo naquele eixo
    let hit = false;
    for (const b of this.world.boxes) {
      if (p[X] - r < b.max[X] && p[X] + r > b.min[X] &&
          p[Y] < b.max[Y] && p[Y] + h > b.min[Y] &&
          p[Z] - r < b.max[Z] && p[Z] + r > b.min[Z]) {
        hit = true;
        p[axis] = delta > 0 ? b.min[axis] - hi - EPS : b.max[axis] - lo + EPS;
      }
    }
    return hit;
  }

  /** Move na horizontal; se bater num degrau baixo, sobe nele (se estiver no chão). */
  _moveHorizontal(axis, delta, canStep) {
    const startY = this.pos[Y], startA = this.pos[axis];
    if (!this._moveAxis(axis, delta)) return;
    const flush = this.pos[axis];                              // colado na parede

    if (canStep) {
      this.pos[axis] = startA;
      this.pos[Y] = startY + C.stepHeight;
      if (!this._collides(this.pos[X], this.pos[Y], this.pos[Z], this.height) &&
          !this._moveAxis(axis, delta)) {
        this._moveAxis(Y, -C.stepHeight);                      // assenta em cima do degrau
        return;
      }
      this.pos[Y] = startY;
      this.pos[axis] = flush;
    }
    this.vel[axis] = 0;                                        // parede: perde a velocidade nesse eixo
  }

  /** Se havia chão logo abaixo (degrau para baixo), cola nele em vez de cair aos poucos. */
  _snapToGround() {
    const y0 = this.pos[Y];
    if (!this._moveAxis(Y, -C.stepHeight)) this.pos[Y] = y0;   // sem chão por perto: borda de verdade
  }
}


/* =====================================================================
 * 8) AVATAR - boneco de blocos estilo Roblox (cabeça, tronco, 2 braços,
 *    2 pernas). Tem 1,8 m, igual à caixa de colisão. A origem do grupo
 *    fica nos PÉS e ele olha para -Z (igual ao yaw 0).
 * ===================================================================== */
const SKINS = [
  { skin: 0xf2c94c, shirt: 0xd9534f, pants: 0x3a5ba0 },   // bot: camisa vermelha
  { skin: 0xf2c94c, shirt: 0x4aa3df, pants: 0x3b3f4a },
  { skin: 0xf2c94c, shirt: 0x5cb85c, pants: 0x4a3b2e }
];

function createAvatar(look = SKINS[0]) {
  const root = new THREE.Group();
  const part = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  // membro com pivô na ponta de cima (ombro/quadril): gira como articulação
  const limb = (w, h, d, color, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(part(w, h, d, color, 0, -h / 2, 0));
    return pivot;
  };

  const torso = part(0.6, 0.7, 0.3, look.shirt, 0, 1.05, 0);

  const head = new THREE.Group();                     // pivô no pescoço
  head.position.set(0, 1.4, 0);
  head.add(
    part(0.4, 0.4, 0.4, look.skin, 0, 0.2, 0),
    part(0.06, 0.06, 0.02, 0x1a1a1a, -0.1, 0.26, -0.205),   // olho esquerdo
    part(0.06, 0.06, 0.02, 0x1a1a1a, 0.1, 0.26, -0.205),    // olho direito
    part(0.14, 0.035, 0.02, 0x1a1a1a, 0, 0.1, -0.205)       // boca
  );

  const armL = limb(0.2, 0.7, 0.2, look.skin, -0.4, 1.4);
  const armR = limb(0.2, 0.7, 0.2, look.skin, 0.4, 1.4);
  const legL = limb(0.28, 0.7, 0.28, look.pants, -0.15, 0.7);
  const legR = limb(0.28, 0.7, 0.28, look.pants, 0.15, 0.7);

  root.add(torso, head, armL, armR, legL, legR);
  root.userData = { head, armL, armR, legL, legR, phase: 0, amp: 0 };
  return root;
}

/**
 * Posiciona e anima o boneco a partir de uma "visão" do jogador:
 *   { pos, yaw, pitch, crouched, onGround, speed }  (um snapshot serve).
 */
function updateAvatar(avatar, v, dt) {
  const u = avatar.userData;
  avatar.position.set(v.pos[X], v.pos[Y], v.pos[Z]);
  avatar.rotation.y = -v.yaw;                          // yaw 0 = olhando para -Z

  const k = 1 - Math.exp(-15 * dt);
  // agachar: reduz a escala vertical do boneco (1,2 m / 1,8 m)
  const target = v.crouched ? C.heightCrouch / C.heightStand : 1;
  avatar.scale.y += (target - avatar.scale.y) * k;

  u.head.rotation.x = clamp(v.pitch, -1.0, 1.0);       // a cabeça acompanha o olhar

  // passada: amplitude acompanha a velocidade; no ar, braços levantados
  const moving = v.onGround ? clamp(v.speed / C.runSpeed, 0, 1) : 0;
  u.amp += (moving - u.amp) * k;
  u.phase += v.speed * dt * 2.4;
  const swing = Math.sin(u.phase) * u.amp * 0.9;
  u.legL.rotation.x = swing;  u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing; u.armR.rotation.x = swing;
  if (!v.onGround) { u.armL.rotation.x = u.armR.rotation.x = -0.7; }
}


/* =====================================================================
 * 9) VIEW - cena do Three.js: luzes, sombras, névoa, malhas do mapa
 *    (uma por caixa do World) e a câmera.
 * ===================================================================== */
class View {
  constructor(canvas, world) {
    if (typeof THREE === 'undefined') {
      throw new Error('Não consegui carregar o Three.js (sem internet?). Conecte-se e recarregue a página.');
    }
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2027);
    this.scene.fog = new THREE.Fog(0x1b2027, 30, 90);

    this.camera = new THREE.PerspectiveCamera(C.fovY, 1, C.near, C.far);
    this.camera.rotation.order = 'YXZ';                // yaw primeiro, depois pitch (câmera de FPS)

    // luz suave de céu + "sol" com sombras cobrindo a sala toda
    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x3a3a44, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(8, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    const sc = sun.shadow.camera;
    sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 50;
    this.scene.add(sun);

    this._buildWorld(world);
    this.resize();
  }

  /** Grade de 1 m: ajuda a perceber distância e velocidade. */
  _gridTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#c4c4c4'; g.lineWidth = 3; g.strokeRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  _buildWorld(world) {
    const tex = this._gridTexture();
    for (const b of world.boxes) {
      const sx = b.max[X] - b.min[X], sy = b.max[Y] - b.min[Y], sz = b.max[Z] - b.min[Z];
      const geo = new THREE.BoxGeometry(sx, sy, sz);
      // UV em metros (cada quadrado da grade = 1 m), face a face: +x -x +y -y +z -z
      const faces = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
      const uv = geo.attributes.uv;
      for (let f = 0; f < 6; f++) {
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v;
          uv.setXY(i, uv.getX(i) * faces[f][0], uv.getY(i) * faces[f][1]);
        }
      }
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: b.color, map: tex }));
      mesh.position.set((b.min[X] + b.max[X]) / 2, (b.min[Y] + b.max[Y]) / 2, (b.min[Z] + b.max[Z]) / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Posiciona a câmera. Em terceira pessoa ela recua, mas não atravessa paredes. */
  placeCamera(player, world, thirdPerson) {
    const eye = player.eyePosition(), a = player.viewAngles();
    let pos = eye;
    if (thirdPerson) {
      const f = player.forward();
      const hit = world.raycast(eye, [-f[X], -f[Y], -f[Z]], C.thirdPersonDistance + 0.3);
      const d = hit ? Math.max(0.3, hit.distance - 0.3) : C.thirdPersonDistance;
      pos = [eye[X] - f[X] * d, eye[Y] - f[Y] * d + 0.2, eye[Z] - f[Z] * d];
    }
    this.camera.position.set(pos[X], pos[Y], pos[Z]);
    this.camera.rotation.set(a.pitch, -a.yaw, 0);       // mesma convenção do boneco
  }

  render() { this.renderer.render(this.scene, this.camera); }
}


/* =====================================================================
 * 10) REMOTOS - desenha outros jogadores a partir dos snapshots recebidos
 *     pela rede. Suaviza posição e giro entre um snapshot e o próximo.
 * ===================================================================== */
class RemotePlayers {
  constructor(scene) { this.scene = scene; this.players = new Map(); }

  get count() { return this.players.size; }

  applySnapshot(s) {
    let p = this.players.get(s.id);
    if (!p) {
      const look = SKINS[this.players.size % SKINS.length];
      const avatar = createAvatar(look);
      this.scene.add(avatar);
      p = { avatar, view: { ...s, pos: [...s.pos] }, target: s };      // 1º snapshot: aparece no lugar certo
      this.players.set(s.id, p);
    }
    p.target = s;
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.scene.remove(p.avatar);
    this.players.delete(id);
  }

  update(dt) {
    const k = 1 - Math.exp(-12 * dt);
    for (const p of this.players.values()) {
      const v = p.view, t = p.target;
      for (let i = 0; i < 3; i++) v.pos[i] += (t.pos[i] - v.pos[i]) * k;
      v.yaw = lerpAngle(v.yaw, t.yaw, k);
      v.pitch += (t.pitch - v.pitch) * k;
      v.crouched = t.crouched; v.onGround = t.onGround; v.speed = t.speed;
      updateAvatar(p.avatar, v, dt);
    }
  }
}


/* =====================================================================
 * 11) BOT - finge ser outro jogador: anda em círculo, agacha e pula de
 *     tempos em tempos e manda SNAPSHOTS pelo mesmo caminho da rede.
 *     Quando houver servidor, apague o bot: os remotos virão de lá.
 * ===================================================================== */
class Bot {
  constructor(transport, opts = {}) {
    this.transport = transport;
    this.center = opts.center || [0, 3];
    this.radius = opts.radius || 2.4;
    this.state = createPlayerState(opts.id || 'bot-1');
    this.angle = 0;
    this.t = 0;
    this._sendAcc = 0;
  }

  update(dt) {
    this.t += dt;
    const s = this.state;
    const phaseCrouch = this.t % 9;
    s.crouched = phaseCrouch > 6;                         // agacha por 3 s a cada 9 s
    const speed = s.crouched ? C.crouchSpeed * 0.6 : 2.4;

    this.angle += (speed / this.radius) * dt;
    const dx = -Math.sin(this.angle), dz = Math.cos(this.angle);   // tangente do círculo
    s.pos[X] = this.center[0] + Math.cos(this.angle) * this.radius;
    s.pos[Z] = this.center[1] + Math.sin(this.angle) * this.radius;
    s.vel[X] = dx * speed; s.vel[Z] = dz * speed;
    s.yaw = Math.atan2(dx, -dz);                          // olha para onde anda
    s.pitch = 0;

    // pulinho a cada 5 s (parábola com a mesma gravidade do jogo)
    const hop = this.t % 5;
    const air = !s.crouched && hop < 2 * C.jumpSpeed / C.gravity;
    s.pos[Y] = air ? C.jumpSpeed * hop - 0.5 * C.gravity * hop * hop : 0;
    s.onGround = !air;

    // manda o estado na mesma frequência de um jogador de verdade
    this._sendAcc += dt;
    if (this._sendAcc >= 1 / C.netSendHz) {
      this._sendAcc = 0;
      this.transport.deliver({ type: 'state', data: toSnapshot(s, performance.now()) });
    }
  }
}


/* =====================================================================
 * 12) GAME - loop de passo fixo, trava do mouse (Pointer Lock), telas, HUD
 *
 *    Para ADICIONAR ARMAS depois:
 *      - game.addSystem({ update(dt, game) {...} })  roda a cada passo de física
 *      - estenda Input.buildCommand() com `fire`, `reload`, troca de arma...
 *      - atire com: world.raycast(player.eyePosition(), player.forward())
 *      - dê recuo com: player.addPunch(pitch, yaw)
 *      - reaja a pulo/pouso/agachar com: player.on('land', ...)
 *
 *    Para ligar o MULTIPLAYER depois:
 *      - troque LoopbackTransport por WebSocketTransport e apague o Bot
 *      - o servidor devolve { type:'state', data: snapshot } de cada jogador
 *        e { type:'leave', data:{ id } } quando alguém sai
 * ===================================================================== */
class Game {
  constructor() {
    this.canvas = document.getElementById('tela');
    this.world = World.buildTestMap();
    this.localId = 'local';
    this.player = new Player(this.world, createPlayerState(this.localId, { x: 0, y: 0.001, z: 8 }));
    this.input = new Input();
    this.view = new View(this.canvas, this.world);

    // rede (hoje: local) + jogadores remotos + bot de teste
    this.transport = new LoopbackTransport();
    this.net = new NetClient(this.transport, this.localId);
    this.remotes = new RemotePlayers(this.view.scene);
    this.net.on('state', s => this.remotes.applySnapshot(s));
    this.net.on('leave', d => this.remotes.remove(d.id));
    this.bot = new Bot(this.transport, { id: 'bot-1', center: [0, 3], radius: 2.4 });

    // boneco do próprio jogador (só aparece na terceira pessoa)
    this.localAvatar = createAvatar(SKINS[1]);
    this.localAvatar.visible = false;
    this.view.scene.add(this.localAvatar);
    this.thirdPerson = false;

    this.systems = [];
    this.state = 'menu';                 // 'menu' | 'jogando' | 'pausado'
    this.locked = false;
    this._accum = 0;
    this._netAcc = 0;
    this._last = performance.now();
    this._fps = 60;

    this.ui = {
      inicio: document.getElementById('telaInicio'),
      pausa: document.getElementById('telaPausa'),
      atualizacoes: document.getElementById('telaAtualizacoes'),
      mira: document.getElementById('mira'),
      hud: document.getElementById('hud'),
      avisoInicio: document.getElementById('avisoInicio'),
      avisoPausa: document.getElementById('avisoPausa')
    };

    document.getElementById('btnJogar').addEventListener('click', () => this.requestLock());
    document.getElementById('btnContinuar').addEventListener('click', () => this.requestLock());
    this._montarAtualizacoes();
    document.addEventListener('pointerlockchange', () => this._onLockChange());
    window.addEventListener('resize', () => this.view.resize());

    requestAnimationFrame(t => this._frame(t));
  }

  addSystem(system) { this.systems.push(system); return this; }

  // ---------- versão e lista de atualizações ----------
  _montarAtualizacoes() {
    document.getElementById('versao').textContent = CHANGELOG[0].versao;
    const lista = document.getElementById('listaUpdates');
    for (const v of CHANGELOG) {
      const bloco = document.createElement('section');
      bloco.className = 'versao';
      bloco.innerHTML = '<div class="versao-cab"><span></span><small></small></div>';
      bloco.querySelector('span').textContent = 'versão ' + v.versao;
      bloco.querySelector('small').textContent = v.data;
      for (const m of v.itens) {
        const linha = document.createElement('div');
        linha.className = 'mudanca';
        const tag = document.createElement('span');
        tag.className = 'tag ' + m.tipo; tag.textContent = m.tipo.toUpperCase();
        const texto = document.createElement('span'); texto.textContent = m.texto;
        linha.append(tag, texto); bloco.append(linha);
      }
      lista.append(bloco);
    }
    document.getElementById('btnAtualizacoes').addEventListener('click', () => {
      this.ui.inicio.classList.add('oculto'); this.ui.atualizacoes.classList.remove('oculto');
    });
    document.getElementById('btnVoltar').addEventListener('click', () => {
      this.ui.atualizacoes.classList.add('oculto'); this.ui.inicio.classList.remove('oculto');
    });
  }

  // ---------- trava do mouse (Pointer Lock API) ----------
  requestLock() {
    const falhou = () => this._avisar('Não consegui travar o mouse. Espere um instante e clique de novo. ' +
      'Se estiver numa pré-visualização, abra o arquivo direto no Chrome, Edge ou Firefox.');
    const tentar = opts => {
      try {
        // movimento bruto do mouse (sem aceleração do sistema), como nos jogos de tiro
        const r = this.canvas.requestPointerLock(opts);
        if (r && r.catch) r.catch(() => (opts ? tentar() : falhou()));
      } catch (e) { opts ? tentar() : falhou(); }
    };
    this._avisar('');
    tentar({ unadjustedMovement: true });
    setTimeout(() => { if (!this.locked) falhou(); }, 700);   // navegadores que não devolvem promessa
  }

  _avisar(texto) { this.ui.avisoInicio.textContent = texto; this.ui.avisoPausa.textContent = texto; }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) {
      this.state = 'jogando';
      this.input.reset();
      this.input.enabled = true;
      this._avisar('');
    } else {
      this.input.enabled = false;
      this.input.reset();
      if (this.state === 'jogando') this.state = 'pausado';   // Esc: o navegador solta o mouse
    }
    this._syncUI();
  }

  _syncUI() {
    this.ui.inicio.classList.toggle('oculto', this.state !== 'menu');
    this.ui.atualizacoes.classList.add('oculto');
    this.ui.pausa.classList.toggle('oculto', this.state !== 'pausado');
    this.ui.mira.style.display = this.state === 'jogando' && !this.thirdPerson ? 'block' : 'none';
    this.ui.hud.style.display = this.state === 'menu' ? 'none' : 'block';
  }

  // ---------- loop principal ----------
  _frame(now) {
    const frameTime = Math.min(0.1, (now - this._last) / 1000);   // trava contra "pulos" ao trocar de aba
    this._last = now;
    this._fps += (1 / Math.max(frameTime, 1e-4) - this._fps) * 0.05;

    if (this.state === 'jogando') {
      // o olhar é aplicado por quadro (resposta imediata); a física roda em passo fixo
      const m = this.input.consumeMouse();
      this.player.look(m.x * C.mouseSens, -m.y * C.mouseSens);

      const step = 1 / C.physicsHz;
      this._accum += frameTime;
      while (this._accum >= step) {
        const cmd = this.input.buildCommand();
        if (cmd.toggleView) this._toggleView();
        this.player.update(cmd, step);
        for (const s of this.systems) s.update && s.update(step, this);
        this._accum -= step;
      }

      // envia o estado do jogador local (20x por segundo)
      this._netAcc += frameTime;
      if (this._netAcc >= 1 / C.netSendHz) {
        this._netAcc = 0;
        this.net.sendState(toSnapshot(this.player.state, now));
      }
    }

    // o bot e os remotos continuam mesmo na pausa, para você ver o boneco
    this.bot.update(frameTime);
    this.remotes.update(frameTime);

    if (this.thirdPerson) {
      updateAvatar(this.localAvatar, toSnapshot(this.player.state), frameTime);
    }
    this.view.placeCamera(this.player, this.world, this.thirdPerson);
    this.view.render();
    this._updateHud();
    requestAnimationFrame(t => this._frame(t));
  }

  _toggleView() {
    this.thirdPerson = !this.thirdPerson;
    this.localAvatar.visible = this.thirdPerson;
    this._syncUI();
  }

  _updateHud() {
    if (this.state === 'menu') return;
    const p = this.player;
    this.ui.hud.textContent =
      `velocidade  ${p.speed.toFixed(2)} m/s\n` +
      `estado      ${p.onGround ? 'chão' : 'ar'}${p.crouched ? ' · agachado' : ''}\n` +
      `posição     ${p.pos.map(v => v.toFixed(2)).join('  ')}\n` +
      `câmera      ${this.thirdPerson ? '3ª pessoa' : '1ª pessoa'} (V)\n` +
      `rede        local · ${this.net.sent} enviados · ${this.remotes.count} remoto(s)\n` +
      `fps         ${Math.round(this._fps)}`;
  }
}

let game;
try {
  document.getElementById('versao').textContent = CHANGELOG[0].versao;
  game = new Game();
  window.game = game;                    // facilita testar pelo console do navegador
} catch (err) {
  document.getElementById('avisoInicio').textContent = 'Erro ao iniciar: ' + err.message;
  document.getElementById('btnJogar').disabled = true;
}
