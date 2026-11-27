/**
 * ============================================================================
 * CASO NEXO CAMPUS TECNOLOGIA — SEMINÁRIO GRUPO 3
 * Shared Data, Interactive SVG Charts/Diagrams & Dual-Tab Synchronization Bus
 * Control Tab (index.html)  <===[NexoSyncBus]===>  Projector Tab (projetor.html)
 * ============================================================================
 */

class NexoSyncBus {
  constructor(role) {
    this.role = role; // 'controller' | 'projector'
    this.projectorWindow = null;
    this.channel = null;
    this.eventSource = null;
    this.listeners = [];
    this.serverInfoListeners = [];
    this.storageKey = "nexo_campus_sync_state_v2";
    this.lastAppliedTimestamp = 0;

    // Server info populated from Android Native Bridge or /api/info
    this.serverInfo = {
      isAndroidApp: Boolean(window.AndroidHost),
      primaryUrl: window.location.origin !== "null" && !window.location.origin.startsWith("file")
        ? window.location.origin
        : "http://192.168.0.100:8080",
      urls: [],
      port: 8080,
      connectedClients: 0
    };

    // Default presentation state shared between Android Master App and PC Browser Projector
    this.state = {
      slideIndex: 0,           // 0 to 6 (Slides 1 to 7)
      activeModalId: null,     // e.g. 's1-empresa', 's2-lideranca', or null
      activeModalTabIdx: 0,    // 0, 1, 2, 3
      linearNodeIndex: 0,      // Current pointer in PRESENTATION_LINKED_LIST
      presentationStarted: false,
      speakerPhase: "yago",    // 'yago' | 'carlos' | 'amando' | 'perguntas'
      pendingHandoffTo: null,  // If waiting for operator confirmation to switch speaker
      generalElapsedSec: 0,    // Ascending overall timer (00:00 -> 14:00+)
      speakerRemainingSec: 240,// Descending timer for current speaker / Q&A
      generalColor: "green",   // 'green' | 'yellow' | 'red'
      speakerColor: "green",   // 'green' | 'yellow' | 'red'
      pacingAdvice: "Aguardando confirmação de início",
      predictedTotalText: "14:00",
      showProjectorTips: true,
      theme: "dark",           // 'dark' | 'light'
      fontScale: 1.0,          // 0.8 to 1.25
      timestamp: Date.now()
    };

    this._initChannels();
  }

  _initChannels() {
    // 1. Check if running inside our Native Android App WebView (window.AndroidHost)
    if (window.AndroidHost) {
      this._refreshAndroidServerInfo();
      setInterval(() => this._refreshAndroidServerInfo(), 1500);
    } else if (window.location.protocol.startsWith("http")) {
      // Running in a browser connected to the Android App's LAN Server (or local server)
      this._initLanNetworkSync();
    }

    // 2. BroadcastChannel API (fallback when testing two tabs on same device)
    if ("BroadcastChannel" in window) {
      try {
        this.channel = new BroadcastChannel("nexo_campus_channel_v2");
        this.channel.onmessage = (event) => {
          if (event.data && event.data.type === "STATE_UPDATE") {
            this._applyIncomingState(event.data.payload);
          } else if (event.data && event.data.type === "PROJECTOR_READY" && this.role === "controller") {
            this.broadcastState();
          }
        };
      } catch (e) {}
    }

    // 3. window.postMessage API (for embedded preview iframe)
    window.addEventListener("message", (event) => {
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.type === "STATE_UPDATE") {
        this._applyIncomingState(event.data.payload);
      } else if (event.data.type === "PROJECTOR_READY" && this.role === "controller") {
        this.broadcastState();
      }
    });

    // 4. localStorage fallback
    window.addEventListener("storage", (event) => {
      if (event.key === this.storageKey && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          this._applyIncomingState(parsed);
        } catch (e) {}
      }
    });

    // Load last saved state if available locally
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state = { ...this.state, ...parsed };
      }
    } catch (e) {}

    // If inside AndroidHost and controller, push initial state to native server
    if (window.AndroidHost && this.role === "controller") {
      try {
        window.AndroidHost.pushState(JSON.stringify(this.state));
      } catch (e) {}
    }
  }

  _refreshAndroidServerInfo() {
    if (!window.AndroidHost) return;
    try {
      const raw = window.AndroidHost.getServerInfo();
      if (raw) {
        const info = JSON.parse(raw);
        this.serverInfo = {
          isAndroidApp: true,
          primaryUrl: info.primaryUrl || "http://127.0.0.1:8080",
          urls: info.urls || [],
          port: info.port || 8080,
          connectedClients: info.connectedClients || 0
        };
        this.serverInfoListeners.forEach((cb) => cb(this.serverInfo));
      }
    } catch (e) {}
  }

  _initLanNetworkSync() {
    // If this is the PC Browser viewing projetor.html served by the Android App over Wi-Fi:
    if (this.role === "projector") {
      // 1. Connect to Server-Sent Events (/api/events) for instant push from the phone
      if ("EventSource" in window) {
        try {
          this.eventSource = new EventSource("/api/events");
          this.eventSource.onmessage = (e) => {
            if (e.data) {
              try {
                const incoming = JSON.parse(e.data);
                this._applyIncomingState(incoming);
              } catch (err) {}
            }
          };
        } catch (e) {}
      }

      // 2. Also poll /api/state every 450ms as ultra-resilient fallback on university networks
      const fetchState = () => {
        fetch("/api/state", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data && data.timestamp) {
              this._applyIncomingState(data);
            }
          })
          .catch(() => {});
      };
      fetchState();
      setInterval(fetchState, 450);
    } else if (this.role === "controller") {
      // Controller running in browser via HTTP server: poll /api/info for LAN URL & client count
      const pollInfo = () => {
        fetch("/api/info", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((info) => {
            if (info) {
              this.serverInfo = {
                isAndroidApp: false,
                primaryUrl: info.primaryUrl || window.location.origin,
                urls: info.urls || [window.location.origin],
                port: info.port || 8080,
                connectedClients: info.connectedClients || 0
              };
              this.serverInfoListeners.forEach((cb) => cb(this.serverInfo));
            }
          })
          .catch(() => {});
      };
      pollInfo();
      setInterval(pollInfo, 1500);
    }
  }

  vibrate(ms = 25) {
    if (window.AndroidHost && window.AndroidHost.vibrate) {
      try {
        window.AndroidHost.vibrate(ms);
        return;
      } catch (e) {}
    }
    if (navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {}
    }
  }

  updateState(partial) {
    this.state = {
      ...this.state,
      ...partial,
      timestamp: Date.now()
    };
    this.lastAppliedTimestamp = this.state.timestamp;
    this.broadcastState();
    this._emit(this.state);
  }

  broadcastState() {
    const stateJson = JSON.stringify(this.state);

    // 1. Push directly to Native Android LAN Server if inside the Android App
    if (window.AndroidHost && window.AndroidHost.pushState) {
      try {
        window.AndroidHost.pushState(stateJson);
      } catch (e) {}
    } else if (this.role === "controller" && window.location.protocol.startsWith("http")) {
      // Push to HTTP LAN server if controller is opened over HTTP
      fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stateJson
      }).catch(() => {});
    }

    const msg = { type: "STATE_UPDATE", payload: this.state };

    // 2. Direct window reference if opened locally
    if (this.projectorWindow && !this.projectorWindow.closed) {
      try {
        this.projectorWindow.postMessage(msg, "*");
      } catch (e) {}
    }

    // 3. BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch (e) {}
    }

    // 4. localStorage
    try {
      localStorage.setItem(this.storageKey, stateJson);
    } catch (e) {}
  }

  _applyIncomingState(newState) {
    if (!newState) return;
    if (newState.timestamp && newState.timestamp < this.lastAppliedTimestamp) return;
    this.lastAppliedTimestamp = newState.timestamp || Date.now();
    this.state = { ...this.state, ...newState };
    this._emit(this.state);
  }

  onStateChange(cb) {
    this.listeners.push(cb);
  }

  onServerInfoChange(cb) {
    this.serverInfoListeners.push(cb);
    cb(this.serverInfo);
  }

  _emit(state) {
    this.listeners.forEach((cb) => cb(state));
  }
}

/* ============================================================================
   SLIDE SPEAKER SCRIPTS & OPERATOR GUIDANCE (7 SLIDES)
   ============================================================================ */
const SLIDE_SPEAKER_DATA = {
  1: {
    title: "Slide 1 — Capa e Recorte do Problema",
    shortTitle: "Capa & Recorte",
    speaker: "Yago Armand",
    timeText: "1 min 30 s",
    durationSec: 90,
    objective: "Situar a turma no caso da Nexo Campus e apresentar a pergunta que guia o seminário.",
    bullets: [
      "<strong>Abrir direto no problema:</strong> empresas pequenas de tecnologia costumam começar informais, onde todo mundo resolve tudo, mas com 18 pessoas isso quebra.",
      "<strong>Destacar a raiz humana:</strong> o problema da Nexo Campus não é só 'falta de código' ou 'falta de ferramenta', mas falha de coordenação humana e comunicação.",
      "<strong>Gancho final:</strong> encerrar lendo e enfatizando a Pergunta Norteadora no destaque inferior como ponte para os conceitos."
    ],
    cards: [
      { id: "s1-empresa", hotkey: "A", label: "Raio-X & Gráfico das 5 Áreas (18 Pessoas)" },
      { id: "s1-sintomas", hotkey: "S", label: "Esquema em Cascata dos 3 Sintomas" },
      { id: "s1-mapa", hotkey: "D", label: "Gráfico de Escala: 5 vs. 18 Pessoas" },
      { id: "s1-pergunta", hotkey: "F", label: "Destaque: Pergunta Norteadora" }
    ]
  },
  2: {
    title: "Slide 2 — Base Conceitual I: Liderança, Papéis e Ambiente",
    shortTitle: "Base Conceitual I",
    speaker: "Yago Armand",
    timeText: "2 min 30 s",
    durationSec: 150,
    objective: "Definir os três primeiros blocos conceituais de forma precisa e prática.",
    bullets: [
      "<strong>1. Autoridade vs. Legitimidade (Gatilho A):</strong> explicar a diferença entre mandar pelo cargo (autoridade formal) e ser respeitado na prática por coerência e critério (legitimidade).",
      "<strong>2. Papéis e Coordenação (Gatilho S):</strong> mostrar que sem papéis definidos (quem decide, executa e valida) e coordenação, duas áreas competentes acabam batendo cabeça.",
      "<strong>3. Segurança Psicológica (Gatilho D):</strong> deixar claro que não é 'passar a mão na cabeça' nem ausência de cobrança; é permitir que o profissional avise quando um prazo é inviável ou quando há uma falha antes que o problema exploda no cliente."
    ],
    cards: [
      { id: "s2-lideranca", hotkey: "A", label: "Bloco 1: Matriz Autoridade vs. Legitimidade" },
      { id: "s2-papeis", hotkey: "S", label: "Bloco 2: Fluxo Decide→Executa→Valida & Equipe≠Grupo" },
      { id: "s2-seguranca", hotkey: "D", label: "Bloco 3: Gráfico 2×2 de Segurança Psicológica" }
    ]
  },
  3: {
    title: "Slide 3 — Base Conceitual II: Conflitos e Comunicação",
    shortTitle: "Base Conceitual II",
    speaker: "Carlos",
    timeText: "2 min 30 s",
    durationSec: 150,
    objective: "Definir os outros três blocos conceituais, fechando a base teórica (6 blocos no total).",
    bullets: [
      "<strong>4. Desmistificar o conflito (Gatilho A):</strong> quebrar o mito de que 'equipe boa não tem conflito'. Em tecnologia, discordar sobre arquitetura, prazo ou prioridade é normal e saudável, desde que o foco esteja no problema (construtivo) e não em ataques pessoais (destrutivo).",
      "<strong>5. Posição vs. Interesse (Gatilho S):</strong> explicar a diferença entre posição (rígida na superfície: 'quero isso hoje') e interesse (necessidade real negociável: manter o cliente / proteger a estabilidade do sistema).",
      "<strong>6. CNV e Linguagem (Gatilho D):</strong> apresentar os 4 pilares da CNV (Observação → Sentimento → Necessidade → Pedido) e contrastar linguagem avaliativa (que ativa postura defensiva) com linguagem descritiva (que permite solução técnica)."
    ],
    cards: [
      { id: "s3-conflito", hotkey: "A", label: "Bloco 4: Curva Conflito Construtivo vs. Destrutivo" },
      { id: "s3-iceberg", hotkey: "S", label: "Bloco 5: Gráfico do Iceberg (Posição vs. Interesse)" },
      { id: "s3-cnv", hotkey: "D", label: "Bloco 6: Pipeline CNV & Termômetro da Linguagem" }
    ]
  },
  4: {
    title: "Slide 4 — Diagnóstico: O Que Está Acontecendo na Nexo Campus",
    shortTitle: "Diagnóstico Nexo",
    speaker: "Carlos",
    timeText: "2 min 00 s",
    durationSec: 120,
    objective: "Aplicar exatamente os conceitos dos Slides 2 e 3 aos sintomas reais do caso.",
    bullets: [
      "<strong>Relação de causa e efeito (Gatilhos A a F):</strong> o conflito entre Desenvolvimento e Atendimento não nasce porque as pessoas 'não se gostam', mas porque a gestão falha na coordenação e não explica critérios de prioridade.",
      "<strong>Mecanismo do atrito (Gatilho V):</strong> o Atendimento promete ou pressiona porque sente a urgência do cliente (interesse: resolver a dor do usuário); o Desenvolvimento resiste porque já está sobrecarregado e sem escopo estável (interesse: manter o sistema funcionando sem quebrar produção).",
      "<strong>Passagem de bastão para o Amando:</strong> 'Diante desse diagnóstico, o que a Nexo Campus precisa mudar na prática?'"
    ],
    cards: [
      { id: "s4-diag1", hotkey: "A", label: "Diag 01: Prioridades s/ Dono → Falha de Coordenação" },
      { id: "s4-diag2", hotkey: "S", label: "Diag 02: Decisões s/ Explicação → Sem Legitimidade" },
      { id: "s4-diag3", hotkey: "D", label: "Diag 03: Sobrecarga → Baixa Segurança Psicológica" },
      { id: "s4-diag4", hotkey: "F", label: "Diag 04: Atrito Dev×Atend → Posições & Avaliativa" },
      { id: "s4-circuito", hotkey: "V", label: "Esquema Completo: Circuito Causal do Atrito" }
    ]
  },
  5: {
    title: "Slide 5 — Propostas de Ação Justificadas",
    shortTitle: "Propostas de Ação",
    speaker: "Amando Luiz",
    timeText: "2 min 30 s",
    durationSec: 150,
    objective: "Apresentar 4 ações concretas, operacionais e justificadas pelos conceitos, conectando à vivência prática de TI e atendimento.",
    bullets: [
      "<strong>Vivência prática (TI + Atendimento):</strong> quem já trabalhou simultaneamente com resolução técnica/bancada/código e atendimento direto ao cliente sabe que o maior gerador de conflito é a falta de filtro entre a urgência do cliente e a realidade técnica da execução.",
      "<strong>Proposta 1 (Gatilho A — Fila única e papéis):</strong> se tudo é urgente, nada é prioritário. Uma fila única com critério (falha crítica vs. melhoria nova) protege o dev da sobrecarga e dá ao atendimento uma previsão real.",
      "<strong>Proposta 2 (Gatilho S — Critérios transparentes):</strong> profissional técnico respeita critério lógico, não ordem arbitrária. Explicar por que a tarefa A veio antes da B gera legitimidade.",
      "<strong>Proposta 3 (Gatilho D — Alinhamento e feedback seguro):</strong> espaço seguro para dizer 'estamos no limite da capacidade' sem ser tachada de incompetente.",
      "<strong>Proposta 4 (Gatilho F — Comunicação descritiva):</strong> evita que um bug ou atraso vire guerra pessoal — gancho direto para o Slide 6."
    ],
    cards: [
      { id: "s5-prop1", hotkey: "A", label: "Proposta 01: Arquitetura da Fila Única de Triagem" },
      { id: "s5-prop2", hotkey: "S", label: "Proposta 02: Esquema de Decisão Transparente" },
      { id: "s5-prop3", hotkey: "D", label: "Proposta 03: Termômetro de Capacidade & Feedback" },
      { id: "s5-prop4", hotkey: "F", label: "Proposta 04: Padrão Descritivo Fato + Impacto" }
    ]
  },
  6: {
    title: "Slide 6 — Produto Prático: Protocolo de Reunião e Feedback Responsável",
    shortTitle: "Protocolo Prático",
    speaker: "Amando Luiz",
    timeText: "2 min 30 s",
    durationSec: 150,
    objective: "Apresentar o entregável obrigatório do Grupo 3 de forma clara, aplicável e visualmente organizada.",
    bullets: [
      "<strong>Enxuto para funcionar (Gatilhos A e S — Q1 e Q2):</strong> protocolo de 25 minutos e 4 regras de escuta para funcionar no dia a dia — reunião longa e sem pauta só aumenta a sobrecarga.",
      "<strong>Contraste Antes vs. Depois na CNV (Gatilho D — Q3):</strong> ler o contraste entre a mensagem acusatória e a reescrita em CNV, apontando os 4 elementos (Observação, Sentimento, Necessidade e Pedido) e como a segunda mensagem desarma a defesa do desenvolvedor.",
      "<strong>Processo verificável (Gatilho F — Q4):</strong> separar urgência real de melhoria, definir 1 responsável de triagem e revisar em 15 dias com dados de tempo de resposta e retrabalho."
    ],
    cards: [
      { id: "s6-q1", hotkey: "A", label: "Quadrante 1: Gráfico da Pauta Breve (25 min)" },
      { id: "s6-q2", hotkey: "S", label: "Quadrante 2: Esquema das 4 Regras de Escuta" },
      { id: "s6-q3", hotkey: "D", label: "Quadrante 3: Transformador de Mensagem CNV" },
      { id: "s6-q4", hotkey: "F", label: "Quadrante 4: Ciclo de 15 Dias & Métricas" }
    ]
  },
  7: {
    title: "Slide 7 — Pergunta Final de Reflexão",
    shortTitle: "Reflexão Final",
    speaker: "Amando Luiz",
    timeText: "30 s (+ 3 a 5 min de perguntas)",
    durationSec: 30,
    objective: "Fechar o seminário com impacto e abrir o debate com a turma e o professor.",
    bullets: [
      "<strong>Síntese em 1 frase:</strong> liderar equipe de tecnologia não é eliminar divergências, mas criar clareza de papéis, critérios transparentes e comunicação objetiva para que as divergências melhorem o produto em vez de desgastar as pessoas.",
      "<strong>Abertura do debate (Gatilho A se quiser mostrar o comparativo):</strong> lançar a pergunta para a turma e abrir para as questões do professor e dos colegas."
    ],
    cards: [
      { id: "s7-debate", hotkey: "A", label: "Painel Visual do Debate: Discordância vs. Conflito" }
    ]
  }
};

/* ============================================================================
   24 DEEP-DIVE INTERACTIVE WINDOWS WITH CUSTOM SVG CHARTS & SCHEMAS
   ============================================================================ */
const INTERACTIVE_MODALS = {
  // ==========================================================================
  // SLIDE 1 MODALS
  // ==========================================================================
  "s1-empresa": {
    kicker: "SLIDE 01 • GRÁFICO & RAIO-X DA EQUIPE (18 PESSOAS)",
    title: "Nexo Campus Tecnologia: Distribuição, Sobrecarga e Atrito por Área",
    tabs: [
      {
        label: "📊 Gráfico Geral das 5 Áreas (18 Pessoas)",
        html: `
          <div class="modal-grid-2" style="align-items: center;">
            <div class="modal-stat-box">
              <span class="modal-stat-label">DISTRIBUIÇÃO &amp; NÍVEL DE TENSÃO OPERACIONAL</span>
              <svg viewBox="0 0 520 270" width="100%" height="250" style="margin-top:6px;">
                <!-- Grid lines -->
                <line x1="140" y1="20" x2="140" y2="235" stroke="#334155" stroke-width="1.5"/>
                <line x1="260" y1="20" x2="260" y2="235" stroke="#1e293b" stroke-width="1" stroke-dasharray="4 4"/>
                <line x1="380" y1="20" x2="380" y2="235" stroke="#1e293b" stroke-width="1" stroke-dasharray="4 4"/>
                <line x1="490" y1="20" x2="490" y2="235" stroke="#1e293b" stroke-width="1" stroke-dasharray="4 4"/>

                <!-- Row 1: Desenvolvimento -->
                <text x="130" y="50" text-anchor="end" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Desenvolvimento (7)</text>
                <rect x="145" y="34" width="330" height="24" rx="6" fill="#f43f5e" opacity="0.88"/>
                <text x="482" y="51" fill="#fda4af" font-family="JetBrains Mono" font-size="12" font-weight="800">94% Sobrecarga</text>

                <!-- Row 2: Atendimento -->
                <text x="130" y="95" text-anchor="end" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Atendimento (4)</text>
                <rect x="145" y="79" width="310" height="24" rx="6" fill="#fb7185" opacity="0.85"/>
                <text x="462" y="96" fill="#fda4af" font-family="JetBrains Mono" font-size="12" font-weight="800">89% Pressão</text>

                <!-- Row 3: Suporte -->
                <text x="130" y="140" text-anchor="end" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Suporte (3)</text>
                <rect x="145" y="124" width="240" height="24" rx="6" fill="#fbbf24" opacity="0.85"/>
                <text x="392" y="141" fill="#fde68a" font-family="JetBrains Mono" font-size="12" font-weight="800">72% Fila Travada</text>

                <!-- Row 4: Design -->
                <text x="130" y="185" text-anchor="end" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Design (2)</text>
                <rect x="145" y="169" width="210" height="24" rx="6" fill="#38bdf8" opacity="0.85"/>
                <text x="362" y="186" fill="#bae6fd" font-family="JetBrains Mono" font-size="12" font-weight="800">64% Retrabalho</text>

                <!-- Row 5: Gestão -->
                <text x="130" y="230" text-anchor="end" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Gestão (2)</text>
                <rect x="145" y="214" width="285" height="24" rx="6" fill="#818cf8" opacity="0.85"/>
                <text x="438" y="231" fill="#c7d2fe" font-family="JetBrains Mono" font-size="12" font-weight="800">Centraliza s/ Critério</text>
              </svg>
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
              <div class="modal-stat-box" style="border-color: var(--accent-cyan-border);">
                <span class="modal-stat-label">PERFIL DA EMPRESA</span>
                <div class="modal-stat-value">Plataforma Digital para Instituições de Ensino</div>
                <p class="modal-stat-desc">Cresceu para <strong>18 pessoas</strong>, mas manteve hábitos informais de quando era uma equipe pequena.</p>
              </div>
              <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
                <span class="modal-stat-label" style="color: var(--accent-rose);">ONDE ESTÁ O GARGALO?</span>
                <div class="modal-stat-value">Interdependência sem Coordenação</div>
                <p class="modal-stat-desc">Atendimento e Suporte dependem do Desenvolvimento para dar retorno às escolas, mas não há fila única nem dono claro por tarefa.</p>
              </div>
            </div>
          </div>`
      },
      {
        label: "💻 Desenvolvimento × 🎧 Atendimento",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-indigo-border);">
              <span class="modal-stat-label">💻 VISÃO DO DESENVOLVIMENTO</span>
              <div class="modal-stat-value">Escopo Instável &amp; Interrupção Diária</div>
              <p class="modal-stat-desc">→ Recebe pedidos urgentes atravessando a sprint.<br>→ Tarefas mudam de prioridade sem justificativa técnica.<br>→ Sente que qualquer atraso vira acusação pessoal.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">🎧 VISÃO DO ATENDIMENTO</span>
              <div class="modal-stat-value">Desgaste Direto com o Cliente</div>
              <p class="modal-stat-desc">→ Escuta a reclamação da instituição de ensino em tempo real.<br>→ Não tem visibilidade da fila técnica nem prazo para informar.<br>→ Cobra no improviso para tentar destravar o cliente.</p>
            </div>
          </div>`
      },
      {
        label: "🧭 Gestão, 🛠️ Suporte & 🎨 Design",
        html: `
          <div class="modal-grid-3">
            <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
              <span class="modal-stat-label" style="color: var(--accent-amber);">🧭 GESTÃO</span>
              <div class="modal-stat-value">Decisões Pouco Explicadas</div>
              <p class="modal-stat-desc">Muda a direção da equipe apoiada só no cargo (autoridade formal), sem explicar critérios.</p>
            </div>
            <div class="modal-stat-box">
              <span class="modal-stat-label">🛠️ SUPORTE</span>
              <div class="modal-stat-value">Chamados Órfãos</div>
              <p class="modal-stat-desc">Identifica problemas técnicos, mas não sabe quem no Dev assumirá a correção.</p>
            </div>
            <div class="modal-stat-box">
              <span class="modal-stat-label">🎨 DESIGN</span>
              <div class="modal-stat-value">Prioridades Descartadas</div>
              <p class="modal-stat-desc">Telas e fluxos desenhados ficam parados ou sofrem retrabalho por mudanças bruscas.</p>
            </div>
          </div>`
      }
    ]
  },

  "s1-sintomas": {
    kicker: "SLIDE 01 • ESQUEMA EM CASCATA DOS SINTOMAS CRÍTICOS",
    title: "Como os 3 Sintomas se Retroalimentam na Nexo Campus",
    tabs: [
      {
        label: "🔄 Esquema Visual do Ciclo Vicioso",
        html: `
          <div class="modal-stat-box">
            <span class="modal-stat-label">DIAGRAMA DE CAUSA E EFEITO DOS 3 SINTOMAS CRÍTICOS</span>
            <svg viewBox="0 0 920 220" width="100%" height="210">
              <!-- Box 1 -->
              <rect x="15" y="35" width="260" height="150" rx="16" fill="#161c2a" stroke="#fbbf24" stroke-width="2.5"/>
              <text x="145" y="70" text-anchor="middle" fill="#fbbf24" font-family="JetBrains Mono" font-size="13" font-weight="800">SINTOMA 01</text>
              <text x="145" y="102" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="17" font-weight="800">Prioridades Instáveis</text>
              <text x="145" y="126" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="17" font-weight="800">&amp; Tarefas sem Dono</text>
              <text x="145" y="156" text-anchor="middle" fill="#94a3b8" font-family="Plus Jakarta Sans" font-size="13">Falta coordenação e triagem</text>

              <!-- Arrow 1 -> 2 -->
              <path d="M 282 110 L 322 110" stroke="#38bdf8" stroke-width="4"/>
              <polygon points="322,102 338,110 322,118" fill="#38bdf8"/>

              <!-- Box 2 -->
              <rect x="345" y="35" width="250" height="150" rx="16" fill="#161c2a" stroke="#818cf8" stroke-width="2.5"/>
              <text x="470" y="70" text-anchor="middle" fill="#818cf8" font-family="JetBrains Mono" font-size="13" font-weight="800">SINTOMA 02</text>
              <text x="470" y="102" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="17" font-weight="800">Decisões Pouco</text>
              <text x="470" y="126" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="17" font-weight="800">Explicadas à Equipe</text>
              <text x="470" y="156" text-anchor="middle" fill="#94a3b8" font-family="Plus Jakarta Sans" font-size="13">Autoridade sem legitimidade</text>

              <!-- Arrow 2 -> 3 -->
              <path d="M 602 110 L 642 110" stroke="#f43f5e" stroke-width="4"/>
              <polygon points="642,102 658,110 642,118" fill="#f43f5e"/>

              <!-- Box 3 -->
              <rect x="665" y="35" width="240" height="150" rx="16" fill="#26111a" stroke="#f43f5e" stroke-width="2.5"/>
              <text x="785" y="70" text-anchor="middle" fill="#fb7185" font-family="JetBrains Mono" font-size="13" font-weight="800">SINTOMA 03</text>
              <text x="785" y="102" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="17" font-weight="800">Atrito Dev × Atend.</text>
              <text x="785" y="126" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="17" font-weight="800">+ Sobrecarga</text>
              <text x="785" y="156" text-anchor="middle" fill="#fda4af" font-family="Plus Jakarta Sans" font-size="13">Conflito destrutivo diário</text>
            </svg>
          </div>`
      },
      {
        label: "🔍 Detalhamento dos 3 Sintomas",
        html: `
          <div class="modal-grid-3">
            <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
              <span class="modal-stat-label" style="color: var(--accent-amber);">01. PRIORIDADES &amp; DONO</span>
              <div class="modal-stat-value">Tarefas Órfãs</div>
              <p class="modal-stat-desc">Quando tudo muda toda hora, chamados críticos ficam sem responsável pelo fim a fim.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-indigo-border);">
              <span class="modal-stat-label">02. DECISÕES OPACAS</span>
              <div class="modal-stat-value">Falta o "Porquê"</div>
              <p class="modal-stat-desc">A equipe técnica não sabe qual critério comercial ou técnico guiou a mudança.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">03. ATRITO &amp; SOBRECARGA</span>
              <div class="modal-stat-value">Desgaste Humano</div>
              <p class="modal-stat-desc">Atendimento cobra no grito; Desenvolvimento se defende e acumula horas extras.</p>
            </div>
          </div>`
      }
    ]
  },

  "s1-mapa": {
    kicker: "SLIDE 01 • GRÁFICO DE COMPLEXIDADE DE COMUNICAÇÃO",
    title: "Por que a Informalidade Quebra ao Passar de 5 para 18 Pessoas?",
    tabs: [
      {
        label: "📈 Gráfico: Crescimento Exponencial de Canais",
        html: `
          <div class="modal-grid-2" style="align-items: center;">
            <div class="modal-stat-box">
              <span class="modal-stat-label">FÓRMULA DE CANAIS DE COMUNICAÇÃO: N(N-1)/2</span>
              <svg viewBox="0 0 480 260" width="100%" height="240">
                <line x1="55" y1="220" x2="445" y2="220" stroke="#475569" stroke-width="2"/>
                <line x1="55" y1="25" x2="55" y2="220" stroke="#475569" stroke-width="2"/>

                <!-- Exponential curve -->
                <path d="M 85 210 Q 230 195 405 40" fill="none" stroke="#f43f5e" stroke-width="4"/>

                <!-- Point 1: 5 people = 10 channels -->
                <circle cx="115" cy="204" r="8" fill="#34d399"/>
                <text x="115" y="185" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="13" font-weight="800">5 Pessoas = 10 Canais</text>
                <text x="115" y="242" text-anchor="middle" fill="#cbd5e1" font-family="Plus Jakarta Sans" font-size="12" font-weight="700">Início Informal</text>

                <!-- Point 2: 10 people = 45 channels -->
                <circle cx="245" cy="162" r="8" fill="#fbbf24"/>
                <text x="245" y="142" text-anchor="middle" fill="#fbbf24" font-family="JetBrains Mono" font-size="13" font-weight="800">10 Pessoas = 45 Canais</text>

                <!-- Point 3: 18 people = 153 channels -->
                <circle cx="405" cy="40" r="10" fill="#f43f5e"/>
                <text x="345" y="34" text-anchor="end" fill="#fb7185" font-family="JetBrains Mono" font-size="14" font-weight="800">18 Pessoas = 153 Canais!</text>
                <text x="405" y="242" text-anchor="middle" fill="#fda4af" font-family="Plus Jakarta Sans" font-size="12" font-weight="800">Nexo Campus Hoje</text>
              </svg>
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
              <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
                <span class="modal-stat-label" style="color: var(--accent-emerald);">COM 5 PESSOAS (10 CONEXÕES)</span>
                <div class="modal-stat-value">Todo mundo sabe de tudo na conversa</div>
                <p class="modal-stat-desc">Basta olhar para o lado para alinhar o que é urgente.</p>
              </div>
              <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
                <span class="modal-stat-label" style="color: var(--accent-rose);">COM 18 PESSOAS (153 CONEXÕES)</span>
                <div class="modal-stat-value">A informalidade vira caos operacional</div>
                <p class="modal-stat-desc">Sem papéis claros, fila única e liderança com critério, as 153 conexões viram telefone sem fio e atrito constante.</p>
              </div>
            </div>
          </div>`
      }
    ]
  },

  "s1-pergunta": {
    kicker: "SLIDE 01 • PERGUNTA NORTEADORA DO SEMINÁRIO",
    title: "O Fio Condutor do Grupo 3",
    tabs: [
      {
        label: "🎯 Pergunta Norteadora & Mapa de Resposta",
        html: `
          <div class="modal-stat-box" style="border-color: var(--accent-cyan); background: var(--accent-indigo-bg); text-align: center; padding: 24px;">
            <div class="modal-stat-value" style="font-size: 1.95rem;">“Como liderar uma equipe técnica com clareza, escuta, feedback e capacidade de lidar com divergências?”</div>
          </div>
          <div class="modal-grid-3" style="margin-top: 8px;">
            <div class="modal-stat-box">
              <span class="modal-stat-label">SLIDES 2 E 3 (TEORIA)</span>
              <div class="modal-stat-value">6 Blocos Conceituais</div>
              <p class="modal-stat-desc">Liderança, Legitimidade, Papéis, Segurança Psicológica, Conflitos e CNV.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
              <span class="modal-stat-label" style="color: var(--accent-amber);">SLIDE 4 (DIAGNÓSTICO)</span>
              <div class="modal-stat-value">Sintoma → Causa Raiz</div>
              <p class="modal-stat-desc">Leitura conceitual exata dos 4 problemas da Nexo Campus.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">SLIDES 5 E 6 (PRÁTICA)</span>
              <div class="modal-stat-value">4 Ações + Protocolo</div>
              <p class="modal-stat-desc">Fila única, critérios, pauta de 25 min e reescrita em CNV.</p>
            </div>
          </div>`
      }
    ]
  },

  // ==========================================================================
  // SLIDE 2 MODALS
  // ==========================================================================
  "s2-lideranca": {
    kicker: "SLIDE 02 • BLOCO CONCEITUAL 01",
    title: "1. Liderança, Autoridade Formal e Legitimidade",
    tabs: [
      {
        label: "📊 Esquema Visual: Autoridade vs. Legitimidade",
        html: `
          <div class="modal-grid-2" style="align-items: center;">
            <div class="modal-stat-box">
              <span class="modal-stat-label">EQUAÇÃO DA LIDERANÇA EM EQUIPES TÉCNICAS</span>
              <svg viewBox="0 0 500 250" width="100%" height="235">
                <!-- Left Pillar: Autoridade Formal -->
                <rect x="20" y="30" width="200" height="115" rx="14" fill="#1e1b2e" stroke="#fbbf24" stroke-width="2"/>
                <text x="120" y="60" text-anchor="middle" fill="#fbbf24" font-family="JetBrains Mono" font-size="12" font-weight="800">AUTORIDADE FORMAL</text>
                <text x="120" y="88" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="16" font-weight="800">Poder do Cargo</text>
                <text x="120" y="114" text-anchor="middle" fill="#94a3b8" font-family="Plus Jakarta Sans" font-size="13">Impõe obediência,</text>
                <text x="120" y="132" text-anchor="middle" fill="#94a3b8" font-family="Plus Jakarta Sans" font-size="13">mas não gera convicção</text>

                <!-- Right Pillar: Legitimidade -->
                <rect x="280" y="30" width="200" height="115" rx="14" fill="#0f2422" stroke="#34d399" stroke-width="2"/>
                <text x="380" y="60" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="12" font-weight="800">LEGITIMIDADE</text>
                <text x="380" y="88" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="16" font-weight="800">Confiança &amp; Critério</text>
                <text x="380" y="114" text-anchor="middle" fill="#a7f3d0" font-family="Plus Jakarta Sans" font-size="13">Coerência, transparência</text>
                <text x="380" y="132" text-anchor="middle" fill="#a7f3d0" font-family="Plus Jakarta Sans" font-size="13">e respaldo técnico</text>

                <!-- Bottom Synthesis: Liderança -->
                <path d="M 120 145 L 200 180" stroke="#fbbf24" stroke-width="2.5"/>
                <path d="M 380 145 L 300 180" stroke="#34d399" stroke-width="2.5"/>
                <rect x="75" y="175" width="350" height="62" rx="14" fill="#171e36" stroke="#818cf8" stroke-width="2.5"/>
                <text x="250" y="202" text-anchor="middle" fill="#818cf8" font-family="JetBrains Mono" font-size="12" font-weight="800">LIDERANÇA EFETIVA</text>
                <text x="250" y="224" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Alinhar direção + Destravar o trabalho da equipe</text>
              </svg>
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
              <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
                <span class="modal-stat-label" style="color: var(--accent-amber);">MANDAR PELO CARGO ≠ LIDERAR</span>
                <div class="modal-stat-value">Autoridade Formal sozinha desgasta</div>
                <p class="modal-stat-desc">Quando a gestão muda prioridades sem explicar o motivo, ela gasta sua autoridade formal e perde respeito prático.</p>
              </div>
              <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
                <span class="modal-stat-label" style="color: var(--accent-emerald);">COMO SE CONQUISTA LEGITIMIDADE?</span>
                <div class="modal-stat-value">Coerência + Critério + Respaldo Técnico</div>
                <p class="modal-stat-desc">A equipe técnica segue o líder quando percebe lógica clara nas decisões e proteção contra demandas caóticas.</p>
              </div>
            </div>
          </div>`
      }
    ]
  },

  "s2-papeis": {
    kicker: "SLIDE 02 • BLOCO CONCEITUAL 02",
    title: "2. Papéis, Coordenação e Trabalho em Equipe",
    tabs: [
      {
        label: "🔄 Esquema: Quem Decide → Executa → Valida",
        html: `
          <div class="modal-stat-box">
            <span class="modal-stat-label">ARQUITETURA DE PAPÉIS PARA EVITAR TAREFAS SEM DONO</span>
            <svg viewBox="0 0 900 185" width="100%" height="175">
              <rect x="20" y="25" width="250" height="135" rx="16" fill="#161c2a" stroke="#38bdf8" stroke-width="2.5"/>
              <text x="145" y="60" text-anchor="middle" fill="#38bdf8" font-family="JetBrains Mono" font-size="13" font-weight="800">1. QUEM DECIDE</text>
              <text x="145" y="92" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="18" font-weight="800">Triagem &amp; Prioridade</text>
              <text x="145" y="122" text-anchor="middle" fill="#cbd5e1" font-family="Plus Jakarta Sans" font-size="13">Filtra urgência vs. melhoria</text>

              <path d="M 278 92 L 318 92" stroke="#38bdf8" stroke-width="4"/>
              <polygon points="318,84 332,92 318,100" fill="#38bdf8"/>

              <rect x="338" y="25" width="250" height="135" rx="16" fill="#161c2a" stroke="#818cf8" stroke-width="2.5"/>
              <text x="463" y="60" text-anchor="middle" fill="#818cf8" font-family="JetBrains Mono" font-size="13" font-weight="800">2. QUEM EXECUTA</text>
              <text x="463" y="92" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="18" font-weight="800">Dono Técnico Claro</text>
              <text x="463" y="122" text-anchor="middle" fill="#cbd5e1" font-family="Plus Jakarta Sans" font-size="13">Executa com escopo protegido</text>

              <path d="M 596 92 L 636 92" stroke="#34d399" stroke-width="4"/>
              <polygon points="636,84 650,92 636,100" fill="#34d399"/>

              <rect x="656" y="25" width="225" height="135" rx="16" fill="#161c2a" stroke="#34d399" stroke-width="2.5"/>
              <text x="768" y="60" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="13" font-weight="800">3. QUEM VALIDA</text>
              <text x="768" y="92" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="18" font-weight="800">Homologa &amp; Fecha</text>
              <text x="768" y="122" text-anchor="middle" fill="#cbd5e1" font-family="Plus Jakarta Sans" font-size="13">Dá retorno ao Atendimento</text>
            </svg>
          </div>
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">GRUPO (SOMA DE INDIVÍDUOS)</span>
              <div class="modal-stat-value">Cada área olha só para o seu quintal</div>
              <p class="modal-stat-desc">Sem coordenação, duas áreas competentes batem cabeça e geram retrabalho.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">EQUIPE (SISTEMA INTEGRADO)</span>
              <div class="modal-stat-value">Metas compartilhadas + Responsabilidade mútua</div>
              <p class="modal-stat-desc">Coordenação integra áreas interdependentes do início ao fim do chamado.</p>
            </div>
          </div>`
      }
    ]
  },

  "s2-seguranca": {
    kicker: "SLIDE 02 • BLOCO CONCEITUAL 03 (GRÁFICO 2×2)",
    title: "3. Matriz de Segurança Psicológica × Cobrança de Desempenho",
    tabs: [
      {
        label: "📊 Gráfico 2×2: Segurança Psicológica na Prática",
        html: `
          <div class="modal-grid-2" style="align-items: center;">
            <div class="modal-stat-box">
              <span class="modal-stat-label">MATRIZ DE AMBIENTE DE EQUIPE (AMY EDMONDSON)</span>
              <svg viewBox="0 0 460 280" width="100%" height="255">
                <!-- Axes -->
                <line x1="60" y1="245" x2="440" y2="245" stroke="#64748b" stroke-width="2"/>
                <line x1="60" y1="20" x2="60" y2="245" stroke="#64748b" stroke-width="2"/>
                <text x="250" y="272" text-anchor="middle" fill="#cbd5e1" font-family="JetBrains Mono" font-size="12" font-weight="800">COBRANÇA &amp; PADRÃO TÉCNICO →</text>
                <text x="22" y="135" text-anchor="middle" fill="#cbd5e1" font-family="JetBrains Mono" font-size="12" font-weight="800" transform="rotate(-90 22 135)">SEGURANÇA PSICOLÓGICA →</text>

                <!-- Top Left: Conforto (Mito) -->
                <rect x="72" y="28" width="175" height="98" rx="12" fill="#161c2a" stroke="#fbbf24" stroke-width="1.5"/>
                <text x="160" y="58" text-anchor="middle" fill="#fbbf24" font-family="JetBrains Mono" font-size="11" font-weight="800">MITO ("PASSAR A MÃO")</text>
                <text x="160" y="82" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Zona de Conforto</text>
                <text x="160" y="104" text-anchor="middle" fill="#94a3b8" font-family="Plus Jakarta Sans" font-size="12">Alta segurança, baixa cobrança</text>

                <!-- Top Right: Alta Performance (Meta) -->
                <rect x="257" y="28" width="175" height="98" rx="12" fill="#0d2824" stroke="#34d399" stroke-width="2.5"/>
                <text x="345" y="56" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="11" font-weight="800">★ META NEXO CAMPUS</text>
                <text x="345" y="80" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Aprendizado &amp; Entrega</text>
                <text x="345" y="102" text-anchor="middle" fill="#a7f3d0" font-family="Plus Jakarta Sans" font-size="12">Avisa limites antes da crise</text>

                <!-- Bottom Left: Apatia -->
                <rect x="72" y="136" width="175" height="98" rx="12" fill="#161c2a" stroke="#475569" stroke-width="1"/>
                <text x="160" y="176" text-anchor="middle" fill="#94a3b8" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Zona de Apatia</text>
                <text x="160" y="198" text-anchor="middle" fill="#64748b" font-family="Plus Jakarta Sans" font-size="12">Baixa segurança e cobrança</text>

                <!-- Bottom Right: Ansiedade (Nexo Hoje) -->
                <rect x="257" y="136" width="175" height="98" rx="12" fill="#28111b" stroke="#f43f5e" stroke-width="2.5"/>
                <text x="345" y="164" text-anchor="middle" fill="#fb7185" font-family="JetBrains Mono" font-size="11" font-weight="800">⚠ NEXO CAMPUS HOJE</text>
                <text x="345" y="188" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Medo &amp; Sobrecarga</text>
                <text x="345" y="210" text-anchor="middle" fill="#fda4af" font-family="Plus Jakarta Sans" font-size="12">Alta pressão s/ escuta</text>
              </svg>
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
              <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
                <span class="modal-stat-label" style="color: var(--accent-emerald);">POR QUE ISSO É VITAL EM TI?</span>
                <div class="modal-stat-value">Liberdade para apontar riscos a tempo</div>
                <p class="modal-stat-desc">Segurança psicológica permite ao desenvolvedor ou atendente dizer: <em>"Esse prazo é inviável"</em> ou <em>"Há uma falha crítica"</em> sem medo de retaliação.</p>
              </div>
              <div class="modal-stat-box" style="border-color: var(--accent-cyan-border);">
                <span class="modal-stat-label">PAPEL DO FEEDBACK</span>
                <div class="modal-stat-value">Corrigir Rota ≠ Punir</div>
                <p class="modal-stat-desc">Retorno contínuo sobre entregas e condutas para ajustar o processo enquanto ainda há tempo.</p>
              </div>
            </div>
          </div>`
      }
    ]
  },

  // ==========================================================================
  // SLIDE 3 MODALS
  // ==========================================================================
  "s3-conflito": {
    kicker: "SLIDE 03 • BLOCO CONCEITUAL 04",
    title: "4. Conflito Construtivo vs. Conflito Destrutivo",
    tabs: [
      {
        label: "📈 Gráfico: Impacto do Conflito na Performance",
        html: `
          <div class="modal-grid-2" style="align-items: center;">
            <div class="modal-stat-box">
              <span class="modal-stat-label">BIFURCAÇÃO DO CONFLITO EM EQUIPES TÉCNICAS</span>
              <svg viewBox="0 0 480 245" width="100%" height="230">
                <!-- Start Node -->
                <rect x="15" y="92" width="135" height="60" rx="12" fill="#1e2638" stroke="#94a3b8" stroke-width="2"/>
                <text x="82" y="118" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Divergência</text>
                <text x="82" y="138" text-anchor="middle" fill="#38bdf8" font-family="JetBrains Mono" font-size="11" font-weight="700">Prazo / Prioridade</text>

                <!-- Branch Up: Constructive -->
                <path d="M 150 110 Q 210 55 265 55" fill="none" stroke="#34d399" stroke-width="3.5"/>
                <rect x="265" y="18" width="200" height="82" rx="14" fill="#0d2824" stroke="#34d399" stroke-width="2.5"/>
                <text x="365" y="44" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="12" font-weight="800">✓ CONSTRUTIVO</text>
                <text x="365" y="68" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Foco no Problema/Processo</text>
                <text x="365" y="88" text-anchor="middle" fill="#a7f3d0" font-family="Plus Jakarta Sans" font-size="12">→ Gera soluções melhores</text>

                <!-- Branch Down: Destructive -->
                <path d="M 150 135 Q 210 190 265 190" fill="none" stroke="#f43f5e" stroke-width="3.5"/>
                <rect x="265" y="148" width="200" height="82" rx="14" fill="#28111b" stroke="#f43f5e" stroke-width="2.5"/>
                <text x="365" y="174" text-anchor="middle" fill="#fb7185" font-family="JetBrains Mono" font-size="12" font-weight="800">✕ DESTRUTIVO</text>
                <text x="365" y="198" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Ataques Pessoais &amp; Culpados</text>
                <text x="365" y="218" text-anchor="middle" fill="#fda4af" font-family="Plus Jakarta Sans" font-size="12">→ Trava a operação</text>
              </svg>
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
              <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
                <span class="modal-stat-label" style="color: var(--accent-emerald);">QUEBRANDO O MITO</span>
                <div class="modal-stat-value">“Equipe boa não é equipe sem conflito”</div>
                <p class="modal-stat-desc">Em tecnologia, discordar sobre arquitetura, prazo ou prioridade é saudável e evita decisões cegas — desde que o foco permaneça no problema.</p>
              </div>
              <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
                <span class="modal-stat-label" style="color: var(--accent-rose);">QUANDO VIRA DESTRUTIVO?</span>
                <div class="modal-stat-value">Quando sai do processo e ataca a pessoa</div>
                <p class="modal-stat-desc">Caça aos culpados entre Desenvolvimento e Atendimento paralisa a resolução do chamado.</p>
              </div>
            </div>
          </div>`
      }
    ]
  },

  "s3-iceberg": {
    kicker: "SLIDE 03 • BLOCO CONCEITUAL 05 (DIAGRAMA DO ICEBERG)",
    title: "5. Posições, Interesses e Escuta Ativa",
    tabs: [
      {
        label: "🧊 Esquema Visual: O Iceberg da Negociação",
        html: `
          <div class="modal-grid-2" style="align-items: center;">
            <div class="modal-stat-box">
              <span class="modal-stat-label">SUPERFÍCIE (POSIÇÃO RÍGIDA) vs. FUNDO (INTERESSE REAL)</span>
              <svg viewBox="0 0 500 265" width="100%" height="245">
                <!-- Iceberg Polygon -->
                <polygon points="250,18 335,105 165,105" fill="#2e1522" stroke="#f43f5e" stroke-width="2"/>
                <polygon points="165,112 335,112 420,245 80,245" fill="#0f2537" stroke="#22d3ee" stroke-width="2"/>

                <!-- Water Line -->
                <line x1="20" y1="108" x2="480" y2="108" stroke="#38bdf8" stroke-width="2.5" stroke-dasharray="8 5"/>
                <text x="475" y="100" text-anchor="end" fill="#38bdf8" font-family="JetBrains Mono" font-size="11" font-weight="800">NÍVEL VISÍVEL</text>

                <!-- Position Text -->
                <text x="250" y="58" text-anchor="middle" fill="#fb7185" font-family="JetBrains Mono" font-size="12" font-weight="800">▲ POSIÇÃO (RÍGIDA)</text>
                <text x="250" y="82" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">“Quero isso pronto hoje!”</text>

                <!-- Interest Text -->
                <text x="250" y="145" text-anchor="middle" fill="#22d3ee" font-family="JetBrains Mono" font-size="12" font-weight="800">▼ INTERESSE REAL (NEGOCIÁVEL)</text>
                <text x="250" y="175" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Atendimento: Manter o cliente orientado</text>
                <text x="250" y="200" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">Dev: Proteger a estabilidade do sistema</text>
                <text x="250" y="230" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="12" font-weight="800">⇄ PONTE: ESCUTA ATIVA</text>
              </svg>
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
              <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
                <span class="modal-stat-label" style="color: var(--accent-amber);">POR QUE AS POSIÇÕES TRAVAM?</span>
                <div class="modal-stat-value">“Quero hoje!” × “Hoje é impossível!”</div>
                <p class="modal-stat-desc">Na superfície, as exigências são opostas. Se a conversa fica presa na posição, vira queda de braço.</p>
              </div>
              <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
                <span class="modal-stat-label" style="color: var(--accent-emerald);">O PODER DA ESCUTA ATIVA</span>
                <div class="modal-stat-value">Ouvir o contexto antes de rebater</div>
                <p class="modal-stat-desc">Ao descobrir o interesse real (dar uma resposta confiável ao cliente sem derrubar o servidor), os dois lados encontram um acordo viável.</p>
              </div>
            </div>
          </div>`
      }
    ]
  },

  "s3-cnv": {
    kicker: "SLIDE 03 • BLOCO CONCEITUAL 06",
    title: "6. Comunicação Não Violenta (CNV) e Termômetro da Linguagem",
    tabs: [
      {
        label: "🔄 Pipeline dos 4 Passos da CNV",
        html: `
          <div class="modal-stat-box">
            <span class="modal-stat-label">ESTRUTURA PRÁTICA DA COMUNICAÇÃO NÃO VIOLENTA EM TI</span>
            <svg viewBox="0 0 920 155" width="100%" height="150">
              <rect x="10" y="20" width="205" height="115" rx="14" fill="#161c2a" stroke="#38bdf8" stroke-width="2"/>
              <text x="112" y="50" text-anchor="middle" fill="#38bdf8" font-family="JetBrains Mono" font-size="12" font-weight="800">1. OBSERVAÇÃO</text>
              <text x="112" y="80" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Fato sem julgamento</text>
              <text x="112" y="106" text-anchor="middle" fill="#94a3b8" font-family="Plus Jakarta Sans" font-size="12">"Chamado X parado há 3d"</text>

              <text x="228" y="82" text-anchor="middle" fill="#38bdf8" font-family="JetBrains Mono" font-size="22" font-weight="800">→</text>

              <rect x="242" y="20" width="205" height="115" rx="14" fill="#161c2a" stroke="#818cf8" stroke-width="2"/>
              <text x="344" y="50" text-anchor="middle" fill="#818cf8" font-family="JetBrains Mono" font-size="12" font-weight="800">2. SENTIMENTO</text>
              <text x="344" y="80" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Impacto vivenciado</text>
              <text x="344" y="106" text-anchor="middle" fill="#94a3b8" font-family="Plus Jakarta Sans" font-size="12">"Equipe pressionada"</text>

              <text x="460" y="82" text-anchor="middle" fill="#818cf8" font-family="JetBrains Mono" font-size="22" font-weight="800">→</text>

              <rect x="474" y="20" width="205" height="115" rx="14" fill="#161c2a" stroke="#fbbf24" stroke-width="2"/>
              <text x="576" y="50" text-anchor="middle" fill="#fbbf24" font-family="JetBrains Mono" font-size="12" font-weight="800">3. NECESSIDADE</text>
              <text x="576" y="80" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Interesse real</text>
              <text x="576" y="106" text-anchor="middle" fill="#94a3b8" font-family="Plus Jakarta Sans" font-size="12">"Precisamos previsibilidade"</text>

              <text x="692" y="82" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="22" font-weight="800">→</text>

              <rect x="706" y="20" width="205" height="115" rx="14" fill="#0d2824" stroke="#34d399" stroke-width="2.5"/>
              <text x="808" y="50" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="12" font-weight="800">4. PEDIDO</text>
              <text x="808" y="80" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Ação clara e viável</text>
              <text x="808" y="106" text-anchor="middle" fill="#a7f3d0" font-family="Plus Jakarta Sans" font-size="12">"Definir prazo realista hoje?"</text>
            </svg>
          </div>
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">✕ LINGUAGEM AVALIATIVA (ACUSAÇÃO)</span>
              <div class="modal-stat-value">“Vocês são lentos!” → Ativa Defesa (95% Atrito)</div>
              <p class="modal-stat-desc">Rotula e julga a pessoa ou área; fecha o canal de cooperação.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">✓ LINGUAGEM DESCRITIVA (DADO + IMPACTO)</span>
              <div class="modal-stat-value">“O chamado X está parado há 3 dias” → Foco Técnico</div>
              <p class="modal-stat-desc">Relata fatos objetivos e impactos verificáveis, abrindo espaço para solução.</p>
            </div>
          </div>`
      }
    ]
  },

  // ==========================================================================
  // SLIDE 4 MODALS
  // ==========================================================================
  "s4-diag1": {
    kicker: "SLIDE 04 • DIAGNÓSTICO CAUSAL 01",
    title: "Prioridades mudam toda hora e tarefas ficam sem dono",
    tabs: [
      {
        label: "🔍 Raio-X: Sintoma → Leitura Conceitual",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">SINTOMA VISÍVEL NA NEXO CAMPUS</span>
              <div class="modal-stat-value">Prioridades mudam toda hora e tarefas ficam sem dono</div>
              <p class="modal-stat-desc">A equipe começa uma entrega, é interrompida no meio por outra urgência e chamados ficam órfãos entre Suporte e Dev.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-cyan-border);">
              <span class="modal-stat-label">LEITURA CONCEITUAL (BLOCO 2)</span>
              <div class="modal-stat-value">Falha de coordenação e indefinição de papéis</div>
              <p class="modal-stat-desc">Falta definir claramente <strong>quem decide</strong> a entrada na fila, <strong>quem executa</strong> e <strong>quem valida</strong>.</p>
            </div>
          </div>`
      }
    ]
  },

  "s4-diag2": {
    kicker: "SLIDE 04 • DIAGNÓSTICO CAUSAL 02",
    title: "Equipe não entende decisões tomadas pela gestão",
    tabs: [
      {
        label: "🔍 Raio-X: Sintoma → Leitura Conceitual",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">SINTOMA VISÍVEL NA NEXO CAMPUS</span>
              <div class="modal-stat-value">Equipe não entende decisões tomadas pela gestão</div>
              <p class="modal-stat-desc">A gestão muda o rumo das entregas sem compartilhar a razão técnica ou comercial com o time.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
              <span class="modal-stat-label" style="color: var(--accent-amber);">LEITURA CONCEITUAL (BLOCO 1)</span>
              <div class="modal-stat-value">Liderança apoiada só na autoridade formal, sem legitimidade</div>
              <p class="modal-stat-desc">Usa a hierarquia do cargo, mas não constrói legitimidade baseada em <strong>critério, coerência e transparência</strong>.</p>
            </div>
          </div>`
      }
    ]
  },

  "s4-diag3": {
    kicker: "SLIDE 04 • DIAGNÓSTICO CAUSAL 03",
    title: "Sobrecarga sem espaço para frear novas demandas",
    tabs: [
      {
        label: "🔍 Raio-X: Sintoma → Leitura Conceitual",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">SINTOMA VISÍVEL NA NEXO CAMPUS</span>
              <div class="modal-stat-value">Sobrecarga sem espaço para frear novas demandas</div>
              <p class="modal-stat-desc">Novos pedidos continuam sendo empilhados sobre uma equipe técnica que já está no limite operacional.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">LEITURA CONCEITUAL (BLOCO 3)</span>
              <div class="modal-stat-value">Baixa segurança psicológica e ausência de feedback bilateral</div>
              <p class="modal-stat-desc">Os profissionais não têm um espaço seguro para sinalizar limites de capacidade antes que o atraso exploda.</p>
            </div>
          </div>`
      }
    ]
  },

  "s4-diag4": {
    kicker: "SLIDE 04 • DIAGNÓSTICO CAUSAL 04",
    title: "Atrito constante entre Desenvolvimento e Atendimento",
    tabs: [
      {
        label: "🔍 Raio-X: Sintoma → Leitura Conceitual",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">SINTOMA VISÍVEL NA NEXO CAMPUS</span>
              <div class="modal-stat-value">Atrito constante entre Desenvolvimento e Atendimento</div>
              <p class="modal-stat-desc">As duas áreas se tratam como adversárias: Atendimento cobra sob pressão e Desenvolvimento reage na defensiva.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">LEITURA CONCEITUAL (BLOCOS 4, 5 E 6)</span>
              <div class="modal-stat-value">Conflito destrutivo preso em posições e linguagem avaliativa</div>
              <p class="modal-stat-desc">Falta mediação para enxergar os interesses reais de cada lado e substituir acusações por comunicação descritiva (CNV).</p>
            </div>
          </div>`
      }
    ]
  },

  "s4-circuito": {
    kicker: "SLIDE 04 • ESQUEMA COMPLETO DO MECANISMO DO ATRITO",
    title: "Como a Falha da Gestão Gera o Choque Dev × Atendimento",
    tabs: [
      {
        label: "⚡ Esquema Visual: A Engrenagem do Conflito",
        html: `
          <div class="modal-grid-2" style="align-items: center;">
            <div class="modal-stat-box" style="padding: 14px; align-items: center;">
              <img src="assets/tension-circuit.svg" alt="Circuito do Atrito" style="max-height: 320px; width: auto;" />
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
              <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
                <span class="modal-stat-label" style="color: var(--accent-amber);">1. A ORIGEM NÃO É PESSOAL</span>
                <div class="modal-stat-value">Nasce na falha de coordenação da gestão</div>
                <p class="modal-stat-desc">Sem critérios claros de prioridade, a gestão deixa Atendimento e Desenvolvimento negociarem no improviso sob estresse.</p>
              </div>
              <div class="modal-stat-box" style="border-color: var(--accent-cyan-border);">
                <span class="modal-stat-label">2. DOIS INTERESSES LEGÍTIMOS EM COLISÃO</span>
                <div class="modal-stat-value">Dor do Usuário × Estabilidade em Produção</div>
                <p class="modal-stat-desc">Atendimento quer salvar o cliente; Desenvolvimento quer evitar quebrar o sistema. Sem filtro e sem CNV, os dois se atacam.</p>
              </div>
            </div>
          </div>`
      }
    ]
  },

  // ==========================================================================
  // SLIDE 5 MODALS
  // ==========================================================================
  "s5-prop1": {
    kicker: "SLIDE 05 • PROPOSTA DE AÇÃO 01 (ARQUITETURA DE FLUXO)",
    title: "01. Matriz clara de papéis e fila única de triagem",
    tabs: [
      {
        label: "🔀 Diagrama: Como Funciona a Fila Única de Triagem",
        html: `
          <div class="modal-stat-box">
            <span class="modal-stat-label">FILTRO OPERACIONAL ENTRE A URGÊNCIA DO CLIENTE E A EXECUÇÃO TÉCNICA</span>
            <svg viewBox="0 0 920 200" width="100%" height="190">
              <!-- Input -->
              <rect x="15" y="60" width="195" height="80" rx="14" fill="#161c2a" stroke="#38bdf8" stroke-width="2"/>
              <text x="112" y="94" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">Demanda do Cliente</text>
              <text x="112" y="116" text-anchor="middle" fill="#38bdf8" font-family="JetBrains Mono" font-size="11" font-weight="700">Atendimento / Suporte</text>

              <path d="M 210 100 L 265 100" stroke="#38bdf8" stroke-width="3.5"/>

              <!-- Filter Node -->
              <rect x="265" y="45" width="230" height="110" rx="16" fill="#171e36" stroke="#818cf8" stroke-width="2.5"/>
              <text x="380" y="75" text-anchor="middle" fill="#818cf8" font-family="JetBrains Mono" font-size="12" font-weight="800">FILA ÚNICA DE TRIAGEM</text>
              <text x="380" y="102" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="16" font-weight="800">Classificação + Dono</text>
              <text x="380" y="128" text-anchor="middle" fill="#cbd5e1" font-family="Plus Jakarta Sans" font-size="12">Define: Decide • Executa • Valida</text>

              <!-- Upper Path: Critical -->
              <path d="M 495 80 L 580 50" stroke="#f43f5e" stroke-width="3"/>
              <rect x="580" y="12" width="320" height="72" rx="12" fill="#28111b" stroke="#f43f5e" stroke-width="2"/>
              <text x="740" y="40" text-anchor="middle" fill="#fb7185" font-family="JetBrains Mono" font-size="12" font-weight="800">🔴 URGÊNCIA REAL (SISTEMA FORA)</text>
              <text x="740" y="64" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="700">Ação imediata + SLA de contingência</text>

              <!-- Lower Path: Planned Improvement -->
              <path d="M 495 120 L 580 150" stroke="#34d399" stroke-width="3"/>
              <rect x="580" y="114" width="320" height="72" rx="12" fill="#0d2824" stroke="#34d399" stroke-width="2"/>
              <text x="740" y="142" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="12" font-weight="800">🟢 MELHORIA / AJUSTE (FILA PLANEJADA)</text>
              <text x="740" y="166" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="700">Entra na sprint com prazo real p/ o cliente</text>
            </svg>
          </div>
          <div class="modal-stat-box" style="border-color: var(--accent-cyan-border);">
            <span class="modal-stat-label">JUSTIFICATIVA PRÁTICA (VIVÊNCIA DE TI &amp; ATENDIMENTO)</span>
            <div class="modal-stat-value">“Se tudo é urgente, nada é prioritário”</div>
            <p class="modal-stat-desc">Elimina tarefas sem dono, protege o desenvolvedor contra interrupções caóticas e dá ao Atendimento uma data confiável para informar à instituição de ensino.</p>
          </div>`
      }
    ]
  },

  "s5-prop2": {
    kicker: "SLIDE 05 • PROPOSTA DE AÇÃO 02",
    title: "02. Registro transparente de decisões e critérios",
    tabs: [
      {
        label: "📋 Esquema: O Registro de Critério Técnico & Comercial",
        html: `
          <div class="modal-grid-3">
            <div class="modal-stat-box">
              <span class="modal-stat-label">1. O QUE FOI PRIORIZADO</span>
              <div class="modal-stat-value">Visibilidade no Quadro</div>
              <p class="modal-stat-desc">Toda mudança de prioridade é registrada de forma enxuta e visível para todas as 5 áreas.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-indigo-border);">
              <span class="modal-stat-label">2. O "PORQUÊ" (CRITÉRIO)</span>
              <div class="modal-stat-value">Justificativa Técnica + Comercial</div>
              <p class="modal-stat-desc">Ex.: <em>"Priorizado porque afeta o fechamento de notas de 12 instituições parceiras."</em></p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">3. EFEITO NA LIDERANÇA</span>
              <div class="modal-stat-value">Constrói Legitimidade Real</div>
              <p class="modal-stat-desc">Profissional técnico respeita critério lógico, não ordem arbitrária.</p>
            </div>
          </div>`
      }
    ]
  },

  "s5-prop3": {
    kicker: "SLIDE 05 • PROPOSTA DE AÇÃO 03",
    title: "03. Rotina curta de alinhamento e feedback seguro (semanal/quinzenal)",
    tabs: [
      {
        label: "🌡️ Termômetro de Capacidade & Segurança Psicológica",
        html: `
          <div class="modal-grid-2" style="align-items: center;">
            <div class="modal-stat-box">
              <span class="modal-stat-label">SINALIZAÇÃO PREVENTIVA DE SOBRECARGA ANTES DA CRISE</span>
              <svg viewBox="0 0 460 210" width="100%" height="195">
                <!-- Gauge bar -->
                <rect x="30" y="55" width="130" height="45" rx="8" fill="#10b981" opacity="0.85"/>
                <rect x="165" y="55" width="130" height="45" rx="8" fill="#f59e0b" opacity="0.85"/>
                <rect x="300" y="55" width="130" height="45" rx="8" fill="#f43f5e" opacity="0.85"/>

                <text x="95" y="83" text-anchor="middle" fill="#06281e" font-family="JetBrains Mono" font-size="13" font-weight="800">CAPACIDADE OK</text>
                <text x="230" y="83" text-anchor="middle" fill="#2e1902" font-family="JetBrains Mono" font-size="13" font-weight="800">ALERTA (85%)</text>
                <text x="365" y="83" text-anchor="middle" fill="#fff" font-family="JetBrains Mono" font-size="13" font-weight="800">COLAPSO (100%+)</text>

                <!-- Pointer at Alert -->
                <polygon points="230,108 218,132 242,132" fill="#fbbf24"/>
                <rect x="65" y="135" width="330" height="55" rx="10" fill="#161c2a" stroke="#fbbf24" stroke-width="2"/>
                <text x="230" y="158" text-anchor="middle" fill="#fbbf24" font-family="JetBrains Mono" font-size="12" font-weight="800">PONTO DE INTERVENÇÃO DO FEEDBACK SEGURO</text>
                <text x="230" y="178" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="13" font-weight="700">Equipe avisa no limite (85%) → Gestão renegocia escopo</text>
              </svg>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">JUSTIFICATIVA CONCEITUAL</span>
              <div class="modal-stat-value">Feedback de mão dupla cria Segurança Psicológica</div>
              <p class="modal-stat-desc">Permite que a equipe diga <em>"estamos no limite da capacidade"</em> sem medo de ser rotulada como incompetente, tratando gargalos antes que virem atraso no cliente.</p>
            </div>
          </div>`
      }
    ]
  },

  "s5-prop4": {
    kicker: "SLIDE 05 • PROPOSTA DE AÇÃO 04",
    title: "04. Padrão de comunicação descritiva entre áreas",
    tabs: [
      {
        label: "💬 Do Conflito Pessoal ao Ajuste de Processo",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">ANTES: COBRANÇA ACUSATÓRIA</span>
              <div class="modal-stat-value">Ataque de Área contra Área</div>
              <p class="modal-stat-desc">Cada bug ou atraso vira troca de culpa no chat da empresa, travando a cooperação.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">DEPOIS: PADRÃO DESCRITIVO (CNV)</span>
              <div class="modal-stat-value">Fato + Impacto + Necessidade + Pedido</div>
              <p class="modal-stat-desc">Transforma o atrito em ajuste objetivo de processo — gancho direto para o nosso Produto Prático no Slide 6.</p>
            </div>
          </div>`
      }
    ]
  },

  // ==========================================================================
  // SLIDE 6 MODALS
  // ==========================================================================
  "s6-q1": {
    kicker: "SLIDE 06 • QUADRANTE 1 DO PROTOCOLO PRÁTICO",
    title: "Gráfico de Tempo da Pauta Breve (25 Minutos)",
    tabs: [
      {
        label: "⏱️ Distribuição Proporcional dos 25 Minutos",
        html: `
          <div class="modal-stat-box">
            <span class="modal-stat-label">REUNIÃO ENXUTA (SEMANAL OU SOB DEMANDA) — ZERO DESPERDÍCIO DE TEMPO</span>
            <svg viewBox="0 0 900 135" width="100%" height="130">
              <!-- 20% = 5 min -->
              <rect x="10" y="25" width="170" height="75" rx="10" fill="#0e7490" stroke="#22d3ee" stroke-width="2"/>
              <text x="95" y="55" text-anchor="middle" fill="#22d3ee" font-family="JetBrains Mono" font-size="14" font-weight="800">5 MIN (20%)</text>
              <text x="95" y="80" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">1. Fatos da Semana</text>

              <!-- 20% = 5 min -->
              <rect x="190" y="25" width="170" height="75" rx="10" fill="#78350f" stroke="#fbbf24" stroke-width="2"/>
              <text x="275" y="55" text-anchor="middle" fill="#fbbf24" font-family="JetBrains Mono" font-size="14" font-weight="800">5 MIN (20%)</text>
              <text x="275" y="80" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">2. Gargalos/Sobrecarga</text>

              <!-- 40% = 10 min -->
              <rect x="370" y="25" width="340" height="75" rx="10" fill="#1e1b4b" stroke="#818cf8" stroke-width="2.5"/>
              <text x="540" y="55" text-anchor="middle" fill="#818cf8" font-family="JetBrains Mono" font-size="14" font-weight="800">10 MIN (40% DO TEMPO)</text>
              <text x="540" y="80" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="15" font-weight="800">3. Alinhamento Prioridades Dev × Atendimento</text>

              <!-- 20% = 5 min -->
              <rect x="720" y="25" width="170" height="75" rx="10" fill="#064e3b" stroke="#34d399" stroke-width="2"/>
              <text x="805" y="55" text-anchor="middle" fill="#34d399" font-family="JetBrains Mono" font-size="14" font-weight="800">5 MIN (20%)</text>
              <text x="805" y="80" text-anchor="middle" fill="#f8fafc" font-family="Plus Jakarta Sans" font-size="14" font-weight="800">4. Dono e Prazo</text>
            </svg>
          </div>
          <div class="modal-stat-box" style="border-color: var(--accent-cyan-border);">
            <span class="modal-stat-label">POR QUE APENAS 25 MINUTOS?</span>
            <div class="modal-stat-value">Reunião longa e sem pauta só aumenta a sobrecarga da equipe</div>
            <p class="modal-stat-desc">Com cronômetro travado em 4 blocos objetivos, o time alinha prioridades e volta para a execução com clareza.</p>
          </div>`
      }
    ]
  },

  "s6-q2": {
    kicker: "SLIDE 06 • QUADRANTE 2 DO PROTOCOLO PRÁTICO",
    title: "As 4 Regras de Escuta Responsável",
    tabs: [
      {
        label: "🎧 Esquema das 4 Regras de Ouro",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-cyan-border);">
              <span class="modal-stat-label">REGRA 01 • FOCO OBJETIVO</span>
              <div class="modal-stat-value">Falar sobre processos e fatos, nunca rotular pessoas</div>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-indigo-border);">
              <span class="modal-stat-label">REGRA 02 • ESCUTA ATIVA</span>
              <div class="modal-stat-value">Ouvir o relato completo antes de responder</div>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
              <span class="modal-stat-label" style="color: var(--accent-amber);">REGRA 03 • SAIR DA POSIÇÃO</span>
              <div class="modal-stat-value">Explicitar o interesse real por trás do pedido</div>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">REGRA 04 • RASTREABILIDADE</span>
              <div class="modal-stat-value">Todo problema levantado sai com encaminhamento registrado</div>
            </div>
          </div>`
      }
    ]
  },

  "s6-q3": {
    kicker: "SLIDE 06 • QUADRANTE 3 (TRANSFORMADOR INTERATIVO CNV)",
    title: "Reescrita de Mensagem: Avaliativa → Descritiva (CNV)",
    tabs: [
      {
        label: "1. Contraste: Antes vs. Depois",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border); background: var(--accent-rose-bg);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">✕ ANTES (ACUSATÓRIA / AVALIATIVA)</span>
              <div class="modal-stat-value">“O pessoal de dev nunca entrega no prazo e deixa o atendimento levando bronca do cliente.”</div>
              <p class="modal-stat-desc">→ Ataque generalizado ("nunca entrega").<br>→ Ativa reação defensiva imediata no desenvolvedor.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border); background: var(--accent-emerald-bg);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">✓ DEPOIS (REESCRITA EM CNV DESCRITIVA)</span>
              <div class="modal-stat-value">“Os 3 chamados da Instituição X estão há 4 dias sem atualização (Observação). A equipe de atendimento fica pressionada e sem resposta para o usuário (Sentimento). Precisamos de previsibilidade para orientar o cliente (Necessidade). Podemos definir hoje uma prioridade e um prazo realista de retorno? (Pedido)”</div>
            </div>
          </div>`
      },
      {
        label: "2. Anatomia dos 4 Blocos na Frase",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-cyan-border);">
              <span class="modal-stat-label">1. OBSERVAÇÃO (DADO VERIFICÁVEL)</span>
              <div class="modal-stat-value">“Os 3 chamados da Instituição X estão há 4 dias sem atualização.”</div>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-indigo-border);">
              <span class="modal-stat-label">2. SENTIMENTO (IMPACTO NA EQUIPE)</span>
              <div class="modal-stat-value">“A equipe de atendimento fica pressionada e sem resposta para o usuário.”</div>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
              <span class="modal-stat-label" style="color: var(--accent-amber);">3. NECESSIDADE (INTERESSE REAL)</span>
              <div class="modal-stat-value">“Precisamos de previsibilidade para orientar o cliente.”</div>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">4. PEDIDO (ENCAMINHAMENTO CLARO)</span>
              <div class="modal-stat-value">“Podemos definir hoje uma prioridade e um prazo realista de retorno?”</div>
            </div>
          </div>`
      }
    ]
  },

  "s6-q4": {
    kicker: "SLIDE 06 • QUADRANTE 4 DO PROTOCOLO PRÁTICO",
    title: "Encaminhamento Verificável do Conflito (Dev × Atendimento)",
    tabs: [
      {
        label: "📈 Ciclo de 15 Dias & Métricas de Sucesso",
        html: `
          <div class="modal-grid-3">
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">1. SEPARAÇÃO DE FLUXO</span>
              <div class="modal-stat-value">Urgência Real ≠ Melhoria</div>
              <p class="modal-stat-desc">Sistema fora do ar é atendido na hora; melhoria funcional entra na fila priorizada.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-amber-border);">
              <span class="modal-stat-label" style="color: var(--accent-amber);">2. PONTO FOCAL ÚNICO</span>
              <div class="modal-stat-value">1 Responsável de Triagem</div>
              <p class="modal-stat-desc">Interface oficial entre Desenvolvimento e Atendimento para evitar pedidos paralelos.</p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">3. REVISÃO EM 15 DIAS</span>
              <div class="modal-stat-value">Avaliação Baseada em Dados</div>
              <p class="modal-stat-desc">O acordo é auditado com 2 indicadores: <strong>Tempo Médio de Resposta</strong> e <strong>Taxa de Retrabalho</strong>.</p>
            </div>
          </div>`
      }
    ]
  },

  // ==========================================================================
  // SLIDE 7 MODAL
  // ==========================================================================
  "s7-debate": {
    kicker: "SLIDE 07 • SÍNTESE VISUAL PARA O DEBATE",
    title: "Como Diferenciar Discordância Produtiva de Conflito Prejudicial?",
    tabs: [
      {
        label: "⚖️ Painel Comparativo do Grupo 3",
        html: `
          <div class="modal-grid-2">
            <div class="modal-stat-box" style="border-color: var(--accent-emerald-border);">
              <span class="modal-stat-label" style="color: var(--accent-emerald);">✓ DISCORDÂNCIA PRODUTIVA (CONSTRUTIVA)</span>
              <div class="modal-stat-value">Melhora o Produto e Fortalece a Equipe</div>
              <p class="modal-stat-desc">
                → <strong>Alvo:</strong> ideias, arquitetura, critérios e processos.<br>
                → <strong>Comunicação:</strong> descritiva, baseada em fatos e interesses.<br>
                → <strong>Resultado:</strong> decisão técnica mais madura e aprendizado mútuo.
              </p>
            </div>
            <div class="modal-stat-box" style="border-color: var(--accent-rose-border);">
              <span class="modal-stat-label" style="color: var(--accent-rose);">✕ CONFLITO PREJUDICIAL (DESTRUTIVO)</span>
              <div class="modal-stat-value">Desgasta as Pessoas e Trava a Operação</div>
              <p class="modal-stat-desc">
                → <strong>Alvo:</strong> pessoas, cargos e busca por culpados.<br>
                → <strong>Comunicação:</strong> avaliativa, acusatória e presa em posições rígidas.<br>
                → <strong>Resultado:</strong> medo, silêncio, sobrecarga e queda de qualidade.
              </p>
            </div>
          </div>`
      }
    ]
  }
};
/* ============================================================================
   DOUBLY LINKED LIST (LISTA DUPLAMENTE ENCADEADA) & PREDICTIVE PACING ENGINE
   Every node has .prev and .next pointers for strict linear arrow navigation,
   plus expected duration weights and presenter tips for the classroom screen.
   ============================================================================ */

const SPEAKER_PHASES = {
  yago: {
    key: "yago",
    name: "Yago Armand",
    shortName: "YAGO",
    roleLabel: "Slides 1 e 2 • Problema & Base I",
    budgetSec: 240, // 1m30s (Slide 1) + 2m30s (Slide 2) = 4m00s
    slides: [1, 2],
    nextPhase: "carlos"
  },
  carlos: {
    key: "carlos",
    name: "Carlos",
    shortName: "CARLOS",
    roleLabel: "Slides 3 e 4 • Base II & Diagnóstico",
    budgetSec: 270, // 2m30s (Slide 3) + 2m00s (Slide 4) = 4m30s
    slides: [3, 4],
    nextPhase: "amando"
  },
  amando: {
    key: "amando",
    name: "Amando Luiz",
    shortName: "AMANDO",
    roleLabel: "Slides 5, 6 e 7 • Propostas, Protocolo & Fecho",
    budgetSec: 330, // 2m30s (Slide 5) + 2m30s (Slide 6) + 30s (Slide 7) = 5m30s
    slides: [5, 6, 7],
    nextPhase: "perguntas"
  },
  perguntas: {
    key: "perguntas",
    name: "Perguntas & Debate",
    shortName: "PERGUNTAS",
    roleLabel: "Debate com a Turma e Professor (3 a 5 min)",
    budgetSec: 240, // 4m00s default countdown for Q&A
    slides: [7],
    nextPhase: null
  }
};

// Raw specification of the Linear Presentation Nodes in exact speaking order
const RAW_LINEAR_NODES = [
  // --- SLIDE 1: YAGO ARMAND (90s total) ---
  {
    slideIndex: 0, modalId: null, tabIdx: 0, speakerKey: "yago", expectedSec: 20,
    shortLabel: "S1 • Visão Geral",
    title: "Slide 1: Capa e Recorte da Nexo Campus",
    tips: [
      "Abrir direto no problema: 18 pessoas quebra a informalidade",
      "Não é falta de código: é falha de coordenação humana",
      "Apresentar as 5 áreas e os 3 sintomas críticos"
    ]
  },
  {
    slideIndex: 0, modalId: "s1-empresa", tabIdx: 0, speakerKey: "yago", expectedSec: 18,
    shortLabel: "S1 • Gráfico 5 Áreas",
    title: "Gráfico de Sobrecarga das 5 Áreas (18 Pessoas)",
    tips: [
      "Mostrar que Dev (7) e Atendimento (4) concentram a tensão",
      "Cresceu rápido mantendo hábitos informais de startup",
      "Interdependência alta sem filtro de gestão"
    ]
  },
  {
    slideIndex: 0, modalId: "s1-sintomas", tabIdx: 0, speakerKey: "yago", expectedSec: 18,
    shortLabel: "S1 • Ciclo 3 Sintomas",
    title: "Ciclo Vicioso dos 3 Sintomas Críticos",
    tips: [
      "Prioridade instável gera tarefa sem dono",
      "Decisão não explicada tira confiança técnica",
      "Resultado final: atrito diário Dev × Atendimento"
    ]
  },
  {
    slideIndex: 0, modalId: "s1-mapa", tabIdx: 0, speakerKey: "yago", expectedSec: 18,
    shortLabel: "S1 • Curva 153 Canais",
    title: "Escala: 5 Pessoas (10 canais) vs. 18 Pessoas (153 canais)",
    tips: [
      "Com 5 pessoas todo mundo se resolve na mesma mesa",
      "Com 18 pessoas são 153 canais: improviso vira caos",
      "Gancho direto para a Pergunta Norteadora"
    ]
  },
  {
    slideIndex: 0, modalId: null, tabIdx: 0, speakerKey: "yago", expectedSec: 16,
    shortLabel: "S1 • Pergunta Norteadora",
    title: "Slide 1: Leitura da Pergunta Norteadora",
    tips: [
      "Ler a Pergunta Norteadora com ênfase no destaque inferior",
      "Conectar clareza, escuta, feedback e divergências",
      "Avançar para a Base Conceitual I (Slide 2)"
    ]
  },

  // --- SLIDE 2: YAGO ARMAND (150s total) ---
  {
    slideIndex: 1, modalId: null, tabIdx: 0, speakerKey: "yago", expectedSec: 25,
    shortLabel: "S2 • Visão Geral Base I",
    title: "Slide 2: Base Conceitual I (Blocos 1, 2 e 3)",
    tips: [
      "Apresentar os 3 primeiros pilares teóricos do seminário",
      "Liderança/Legitimidade, Papéis/Equipe e Segurança Psicológica",
      "Vamos abrir cada bloco para aplicar à tecnologia"
    ]
  },
  {
    slideIndex: 1, modalId: "s2-lideranca", tabIdx: 0, speakerKey: "yago", expectedSec: 42,
    shortLabel: "S2 • 1. Liderança & Legitimidade",
    title: "Bloco 1: Autoridade Formal vs. Legitimidade",
    tips: [
      "Autoridade formal é só o cargo ('façam porque mandei')",
      "Legitimidade é respeito conquistado por coerência e critério",
      "Papel do líder: alinhar direção e destravar a equipe"
    ]
  },
  {
    slideIndex: 1, modalId: "s2-papeis", tabIdx: 0, speakerKey: "yago", expectedSec: 42,
    shortLabel: "S2 • 2. Papéis & Coordenação",
    title: "Bloco 2: Quem Decide → Executa → Valida (Equipe ≠ Grupo)",
    tips: [
      "Clareza de papéis: quem decide, executa e valida",
      "Sem coordenação, duas áreas competentes batem cabeça",
      "Equipe ≠ Grupo: metas compartilhadas e responsabilidade mútua"
    ]
  },
  {
    slideIndex: 1, modalId: "s2-seguranca", tabIdx: 0, speakerKey: "yago", expectedSec: 41,
    shortLabel: "S2 • 3. Segurança Psicológica",
    title: "Bloco 3: Matriz 2×2 de Segurança Psicológica e Feedback",
    tips: [
      "Segurança psicológica NÃO é passar a mão na cabeça",
      "É poder avisar que um prazo é inviável antes de explodir no cliente",
      "Passar a palavra para o Carlos (Base Conceitual II)"
    ]
  },

  // --- SLIDE 3: CARLOS (150s total) ---
  {
    slideIndex: 2, modalId: null, tabIdx: 0, speakerKey: "carlos", expectedSec: 24,
    shortLabel: "S3 • Visão Geral Base II",
    title: "Slide 3: Base Conceitual II (Conflitos e Comunicação)",
    tips: [
      "Assumir a fala fechando os 6 blocos conceituais (Blocos 4 a 6)",
      "Foco em como divergências técnicas viram solução ou guerra",
      "Conflito, Posição vs. Interesse e CNV"
    ]
  },
  {
    slideIndex: 2, modalId: "s3-conflito", tabIdx: 0, speakerKey: "carlos", expectedSec: 42,
    shortLabel: "S3 • 4. Construtivo × Destrutivo",
    title: "Bloco 4: Conflito Construtivo vs. Conflito Destrutivo",
    tips: [
      "Quebrar o mito: equipe boa de TI TEM conflito técnico",
      "Construtivo foca no processo e melhora a solução",
      "Destrutivo foca em ataques pessoais e trava a operação"
    ]
  },
  {
    slideIndex: 2, modalId: "s3-iceberg", tabIdx: 0, speakerKey: "carlos", expectedSec: 42,
    shortLabel: "S3 • 5. Iceberg Posição/Interesse",
    title: "Bloco 5: O Iceberg (Posição Rígida vs. Interesse Real)",
    tips: [
      "Posição é a exigência rígida na superfície ('quero hoje!')",
      "Interesse é a necessidade real (orientar cliente / proteger sistema)",
      "Escuta ativa é ouvir o contexto antes de rebater"
    ]
  },
  {
    slideIndex: 2, modalId: "s3-cnv", tabIdx: 0, speakerKey: "carlos", expectedSec: 42,
    shortLabel: "S3 • 6. CNV & Linguagem",
    title: "Bloco 6: 4 Passos da CNV e Linguagem Descritiva",
    tips: [
      "4 pilares: Observação → Sentimento → Necessidade → Pedido",
      "Linguagem avaliativa ('vocês são lentos') ativa defesa",
      "Linguagem descritiva ('chamado parado há 3d') foca na solução"
    ]
  },

  // --- SLIDE 4: CARLOS (120s total) ---
  {
    slideIndex: 3, modalId: null, tabIdx: 0, speakerKey: "carlos", expectedSec: 35,
    shortLabel: "S4 • Tabela Diagnóstico",
    title: "Slide 4: Diagnóstico (Sintoma → Raiz Conceitual)",
    tips: [
      "Conectar os 4 sintomas da Nexo aos 6 conceitos dos Slides 2 e 3",
      "Mostrar que o atrito Dev × Atendimento é efeito, não causa primária",
      "A causa começa na falha de coordenação e falta de critério da gestão"
    ]
  },
  {
    slideIndex: 3, modalId: "s4-circuito", tabIdx: 0, speakerKey: "carlos", expectedSec: 55,
    shortLabel: "S4 • Engrenagem do Atrito",
    title: "Mecanismo Causal do Atrito: Gestão → Atendimento ⇄ Dev",
    tips: [
      "Atendimento pressiona porque sente a dor do cliente (interesse legítimo)",
      "Dev resiste porque está sobrecarregado e protege produção",
      "Sem filtro da gestão e sem CNV, os dois lados se atacam"
    ]
  },
  {
    slideIndex: 3, modalId: null, tabIdx: 0, speakerKey: "carlos", expectedSec: 30,
    shortLabel: "S4 • Passagem p/ Amando",
    title: "Slide 4: Gancho de Transição para as Propostas",
    tips: [
      "Fechar o raciocínio da matriz de diagnóstico",
      "Passar a bola ao Amando: 'O que a Nexo precisa mudar na prática?'",
      "Preparar transição para o Slide 5"
    ]
  },

  // --- SLIDE 5: AMANDO LUIZ (150s total) ---
  {
    slideIndex: 4, modalId: null, tabIdx: 0, speakerKey: "amando", expectedSec: 26,
    shortLabel: "S5 • Visão Geral Propostas",
    title: "Slide 5: 4 Propostas de Ação Justificadas",
    tips: [
      "Trazer vivência prática de TI/bancada/código + atendimento ao cliente",
      "O maior gerador de conflito é a falta de filtro entre cliente e execução",
      "Apresentar as 4 intervenções operacionais conectadas ao diagnóstico"
    ]
  },
  {
    slideIndex: 4, modalId: "s5-prop1", tabIdx: 0, speakerKey: "amando", expectedSec: 34,
    shortLabel: "S5 • Prop 01: Fila Única",
    title: "Proposta 01: Matriz de Papéis e Fila Única de Triagem",
    tips: [
      "Se tudo é urgente, nada é prioritário",
      "Separar falha crítica (sistema fora) de melhoria nova",
      "Protege o dev e dá previsão real para o atendimento informar ao cliente"
    ]
  },
  {
    slideIndex: 4, modalId: "s5-prop2", tabIdx: 0, speakerKey: "amando", expectedSec: 30,
    shortLabel: "S5 • Prop 02: Critérios",
    title: "Proposta 02: Registro Transparente de Decisões e Critérios",
    tips: [
      "Profissional técnico respeita critério lógico, não ordem arbitrária",
      "Explicar por que a tarefa A veio antes da B constrói legitimidade",
      "Elimina a sensação de retrabalho sem propósito"
    ]
  },
  {
    slideIndex: 4, modalId: "s5-prop3", tabIdx: 0, speakerKey: "amando", expectedSec: 30,
    shortLabel: "S5 • Prop 03: Feedback Seguro",
    title: "Proposta 03: Rotina Curta de Alinhamento e Feedback Seguro",
    tips: [
      "Feedback não é só cobrança de cima para baixo",
      "Espaço seguro para sinalizar 'estamos em 85%/limite de capacidade'",
      "Trata o gargalo antes que vire crise no cliente"
    ]
  },
  {
    slideIndex: 4, modalId: "s5-prop4", tabIdx: 0, speakerKey: "amando", expectedSec: 30,
    shortLabel: "S5 • Prop 04: Padrão Descritivo",
    title: "Proposta 04: Padrão de Comunicação Descritiva entre Áreas",
    tips: [
      "Substituir cobrança acusatória por relato de fato e impacto",
      "Evita que um bug ou atraso vire guerra pessoal",
      "Gancho direto para o Produto Prático no Slide 6"
    ]
  },

  // --- SLIDE 6: AMANDO LUIZ (150s total) ---
  {
    slideIndex: 5, modalId: null, tabIdx: 0, speakerKey: "amando", expectedSec: 25,
    shortLabel: "S6 • Visão 4 Quadrantes",
    title: "Slide 6: Produto Prático — Protocolo de Reunião e Feedback",
    tips: [
      "Apresentar o entregável prático do Grupo 3 organizado em 4 quadrantes",
      "Protocolo enxuto para funcionar na rotina sem criar burocracia",
      "Pauta de 25 min, Regras de Escuta, Reescrita CNV e Encaminhamento"
    ]
  },
  {
    slideIndex: 5, modalId: "s6-q1", tabIdx: 0, speakerKey: "amando", expectedSec: 25,
    shortLabel: "S6 • Q1: Pauta 25 min",
    title: "Quadrante 1: Pauta Breve de 25 Minutos (5 + 5 + 10 + 5)",
    tips: [
      "Reunião longa e sem pauta só aumenta a sobrecarga",
      "5m Fatos + 5m Gargalos + 10m Prioridades Dev×Atend + 5m Dono/Prazo",
      "Aliado às 4 Regras de Escuta do Quadrante 2 (foco no fato, não na pessoa)"
    ]
  },
  {
    slideIndex: 5, modalId: "s6-q3", tabIdx: 0, speakerKey: "amando", expectedSec: 40,
    shortLabel: "S6 • Q3: Antes × Depois CNV",
    title: "Quadrante 3: Contraste da Mensagem Acusatória vs. CNV",
    tips: [
      "Ler o contraste direto entre o 'Antes' (acusatório) e o 'Depois' (CNV)",
      "Mostrar como a acusação ativa defesa e a CNV abre cooperação técnica",
      "Vamos decompor os 4 elementos na frase"
    ]
  },
  {
    slideIndex: 5, modalId: "s6-q3", tabIdx: 1, speakerKey: "amando", expectedSec: 25,
    shortLabel: "S6 • Q3: 4 Blocos CNV",
    title: "Quadrante 3: Anatomia dos 4 Elementos na Mensagem",
    tips: [
      "Apontar: 1. Observação (3 chamados/4 dias) → 2. Sentimento (pressão)",
      "3. Necessidade (previsibilidade) → 4. Pedido (definir prazo realista hoje)",
      "Avançar para o encaminhamento verificável (Quadrante 4)"
    ]
  },
  {
    slideIndex: 5, modalId: "s6-q4", tabIdx: 0, speakerKey: "amando", expectedSec: 35,
    shortLabel: "S6 • Q4: Ciclo 15 Dias",
    title: "Quadrante 4: Encaminhamento Verificável em 15 Dias",
    tips: [
      "O conflito só termina quando o combinado vira processo verificável",
      "Separar urgência real de melhoria + 1 responsável de triagem",
      "Revisar em 15 dias com dados: tempo de resposta e retrabalho"
    ]
  },

  // --- SLIDE 7: AMANDO LUIZ (30s) + DEBATE (240s) ---
  {
    slideIndex: 6, modalId: null, tabIdx: 0, speakerKey: "amando", expectedSec: 30,
    shortLabel: "S7 • Pergunta de Reflexão",
    title: "Slide 7: Síntese Final e Pergunta de Reflexão",
    tips: [
      "Síntese: liderar TI não é eliminar divergências, é dar clareza e método",
      "Fazer as divergências melhorarem o produto em vez de desgastar pessoas",
      "Lançar a pergunta central para a turma e abrir para questões!"
    ]
  },
  {
    slideIndex: 6, modalId: "s7-debate", tabIdx: 0, speakerKey: "perguntas", expectedSec: 240,
    shortLabel: "S7 • Painel do Debate",
    title: "Debate Aberto: Discordância Produtiva vs. Conflito Prejudicial",
    tips: [
      "Usar este comparativo para apoiar respostas às perguntas da turma/professor",
      "Discordância produtiva ataca o problema com dados e respeito",
      "Conflito prejudicial ataca pessoas com rótulos e trava a equipe"
    ]
  }
];

class DoublyLinkedNode {
  constructor(data, index) {
    this.index = index;
    this.slideIndex = data.slideIndex;
    this.modalId = data.modalId;
    this.tabIdx = data.tabIdx || 0;
    this.speakerKey = data.speakerKey;
    this.expectedSec = data.expectedSec;
    this.shortLabel = data.shortLabel;
    this.title = data.title;
    this.tips = data.tips || [];
    this.prev = null;
    this.next = null;
  }
}

class DoublyLinkedPresentation {
  constructor(rawNodes) {
    this.nodes = [];
    this.head = null;
    this.tail = null;

    rawNodes.forEach((item, idx) => {
      const node = new DoublyLinkedNode(item, idx);
      if (idx === 0) {
        this.head = node;
      } else {
        const prevNode = this.nodes[idx - 1];
        prevNode.next = node;
        node.prev = prevNode;
      }
      this.tail = node;
      this.nodes.push(node);
    });
  }

  getNode(index) {
    if (index < 0 || index >= this.nodes.length) return this.head;
    return this.nodes[index];
  }

  // Find the closest matching node when the operator navigates freely with mouse/hotkeys
  findBestMatch(slideIndex, modalId, tabIdx = 0) {
    // 1. Exact match on slideIndex + modalId + tabIdx
    let exact = this.nodes.find(
      (n) => n.slideIndex === slideIndex && n.modalId === (modalId || null) && n.tabIdx === (tabIdx || 0)
    );
    if (exact) return exact;

    // 2. Match on slideIndex + modalId
    let modalMatch = this.nodes.find(
      (n) => n.slideIndex === slideIndex && n.modalId === (modalId || null)
    );
    if (modalMatch) return modalMatch;

    // 3. First node of that slideIndex
    let slideMatch = this.nodes.find((n) => n.slideIndex === slideIndex);
    return slideMatch || this.head;
  }
}

const PRESENTATION_LINKED_LIST = new DoublyLinkedPresentation(RAW_LINEAR_NODES);

/* ============================================================================
   INTELLIGENT HUMAN-FACTOR PREDICTIVE PACING ENGINE
   Predicts if the current speaker and the overall seminar will finish on time,
   returning 'green', 'yellow', or 'red' + human-factor guidance!
   ============================================================================ */
class PredictivePacingEngine {
  static evaluate(state) {
    const activePhaseKey = state.speakerPhase || "yago";
    const phase = SPEAKER_PHASES[activePhaseKey] || SPEAKER_PHASES.yago;
    const currentNode = PRESENTATION_LINKED_LIST.getNode(state.linearNodeIndex || 0);

    const generalElapsed = state.generalElapsedSec || 0;
    const speakerRemaining = state.speakerRemainingSec !== undefined ? state.speakerRemainingSec : phase.budgetSec;
    const speakerElapsed = phase.budgetSec - speakerRemaining;

    // 1. Calculate remaining expected content seconds for the current speaker from currentNode onwards
    let remainingContentForSpeaker = 0;
    let remainingNodesCount = 0;
    let ptr = currentNode;
    while (ptr) {
      if (ptr.speakerKey === activePhaseKey) {
        remainingContentForSpeaker += ptr.expectedSec;
        remainingNodesCount++;
      }
      ptr = ptr.next;
    }

    // Human-factor natural compression factor (presenters naturally condense ~16% when needed)
    const compressedNeedSec = Math.round(remainingContentForSpeaker * 0.84);

    // Drift for current speaker: positive means ahead of schedule, negative means behind schedule
    const speakerDriftSec = speakerRemaining - compressedNeedSec;

    // Determine Speaker Timer Color ('green' | 'yellow' | 'red')
    let speakerColor = "green";
    let pacingAdvice = "Ritmo excelente • Continue com naturalidade";

    if (activePhaseKey === "perguntas") {
      if (speakerRemaining <= 30) {
        speakerColor = "red";
        pacingAdvice = "Tempo de perguntas encerrando • Prepare fechamento";
      } else if (speakerRemaining <= 75) {
        speakerColor = "yellow";
        pacingAdvice = "Última pergunta da turma • ~1 min restante";
      } else {
        speakerColor = "green";
        pacingAdvice = "Debate aberto • Ouça e conecte aos conceitos";
      }
    } else {
      if (speakerRemaining <= 12 || speakerDriftSec < -48) {
        speakerColor = "red";
        pacingAdvice = "Atraso crítico neste bloco • Sintetize e vá ao gancho!";
      } else if (speakerRemaining <= 45 || speakerDriftSec < -15) {
        speakerColor = "yellow";
        pacingAdvice = "Atenção ao ritmo • Resuma os próximos exemplos";
      } else {
        speakerColor = "green";
        pacingAdvice = "Ritmo ideal para os tópicos restantes";
      }
    }

    // 2. Calculate Overall Seminar Prediction (Target: 13m00s to 14m00s = 780s to 840s; Max 15m00s = 900s)
    let remainingTotalSpeechSec = 0;
    let ptrTotal = currentNode;
    while (ptrTotal) {
      if (ptrTotal.speakerKey !== "perguntas") {
        remainingTotalSpeechSec += ptrTotal.expectedSec;
      }
      ptrTotal = ptrTotal.next;
    }

    const predictedTotalSpeechSec = generalElapsed + Math.round(remainingTotalSpeechSec * 0.88);
    let generalColor = "green";
    if (activePhaseKey !== "perguntas") {
      if (predictedTotalSpeechSec > 895 || generalElapsed > 870) {
        generalColor = "red";
      } else if (predictedTotalSpeechSec > 845 || generalElapsed > 810) {
        generalColor = "yellow";
      } else {
        generalColor = "green";
      }
    } else {
      // During Q&A (Total speech + Q&A target ~17-19 min)
      if (generalElapsed > 1140) {
        generalColor = "red";
      } else if (generalElapsed > 1020) {
        generalColor = "yellow";
      } else {
        generalColor = "green";
      }
    }

    return {
      speakerColor,
      generalColor,
      speakerDriftSec,
      predictedTotalSpeechSec,
      remainingNodesCount,
      pacingAdvice
    };
  }
}
