# 🚀 Prompt Mestre — Gerador de Apresentações Web + App Android com Servidor Local (LAN)

Copie todo o bloco abaixo e cole em uma nova conversa sempre que quiser criar um novo seminário ou apresentação com exatamente esta mesma engenharia, visual, aplicativo Android e publicação automática no GitHub.

---

```markdown
Quero que você atue como Engenheiro de Software Sênior e Designer de Apresentações Interativas para criar um **Sistema Completo de Apresentação de Slides (Tela de Projeção Web + Aplicativo Android Nativo de Controle via Rede Local LAN/Hotspot)**, compilar o `.apk` funcional e publicar tudo documentado em um **novo repositório no meu GitHub**.

======================================================================
FASE 1 — ENTREVISTA INICIAL (COLETA DAS INFORMAÇÕES VOLÁTEIS)
======================================================================
Se eu ainda não tiver enviado o conteúdo completo dos slides junto com este prompt, **PARE e faça primeiro estas perguntas objetivas** para coletar os dados voláteis da apresentação antes de gerar o código:

1. **Identidade do Projeto & GitHub:**
   - Qual é o **Título principal**, **Subtítulo/Estudo de Caso** e **Disciplina/Contexto** da apresentação?
   - Qual nome você prefere para o **novo repositório no GitHub** e para o **App Android**? (Ou posso sugerir um nome limpo baseado no tema, ex.: `seminario-<tema>-slides`?).
2. **Apresentadores e Tempos (Para os Timers Preditivos e Confirmação de Troca):**
   - Quem são os **apresentadores** (na ordem de fala), quais slides cada um apresenta e qual é o **tempo-alvo (em minutos/segundos)** de cada slide/apresentador?
   - Quanto tempo será reservado ao final para a fase de **Perguntas & Debate** (ex.: 4 minutos)?
3. **Estrutura e Conteúdo dos Slides:**
   - Quantos slides serão no total e qual o conteúdo de cada um? *(Você pode colar seu roteiro bruto, tópicos ou texto base, e eu mesmo organizarei cada slide em colunas, matrizes, quadrantes, fluxos e palavras-chave, além de criar os gráficos SVG interativos e o roteiro do teleprompter!)*.
4. **Preferência Visual Inicial:**
   - Deseja que o projetor inicie por padrão no **Modo Escuro (Obsidian High-Contrast)** ou no **Modo Claro (Daylight Crisp)**? *(Ambos os temas estarão disponíveis com alternância em 1 toque pelo celular)*.

*(Assim que eu responder — ou caso eu já tenha colado o roteiro junto com este prompt — execute imediatamente as Fases 2 e 3 abaixo sem pular nenhum componente).*

======================================================================
FASE 2 — ARQUITETURA INVARIÁVEL DO SISTEMA (REGRAS OBRIGATÓRIAS)
======================================================================
Construa a aplicação mantendo 100% desta arquitetura e padrão de qualidade:

### 1. Tela da Sala / Projetor (`projetor.html` + `styles.css`)
- **Design System de Alto Contraste (Inspirado em Linear.app, Pitch.com e Vercel):**
  - Suporte nativo a **Dual-Theme**: Modo Escuro (`#07090e` / `#0f131d`) e Modo Claro (`#f8fafc` / `#ffffff`) com contraste WCAG AAA.
  - Tipografia calibrada para projetor de sala de aula: fontes sem serifa (`Plus Jakarta Sans` + `JetBrains Mono`), **corpo com tamanho mínimo equivalente a 22–24 pt** e **títulos entre 32–40 pt**, com escala ajustável remotamente (`--font-scale`).
  - **Proibido parágrafos corridos nos slides:** use apenas palavras-chave em destaque, badges técnicos, setas de relação (`→`, `⇄`, `≠`) e esquemas visuais enxutos.
- **Janelas Interativas Profundas (Full-Stage Deep-Dive Modals):**
  - Todo card, bloco, linha de diagnóstico ou quadrante de qualquer slide deve possuir um identificador (`data-modal-id`) que abre uma **Janela Interativa de Tela Cheia** com **gráficos vetoriais SVG customizados, diagramas arquitetônicos, matrizes 2×2, curvas ou comparadores** e sub-abas internas.
- **HUD Discreto do Apresentador no Canto Superior Direito da Sala (`projector-right-hud`):**
  1. **Timer 1 — Geral Crescente (`GERAL ↗ 00:00`):** conta o tempo total decorrido do seminário desde a confirmação de início.
  2. **Timer 2 — Específico Decrescente por Apresentador / Perguntas (`<NOME> ↘ MM:SS`):** mostra apenas os minutos restantes do apresentador atual (ou da fase de Perguntas) e **só reinicia quando o operador confirma a troca de apresentador**.
  3. **Cores Preditivas (`🟢 Verde`, `🟡 Amarelo`, `🔴 Vermelho`) em Ambos os Timers:** controladas pelo algoritmo `PredictivePacingEngine`.
  4. **Card Discreto de Dicas do Momento (`💡 Dicas do Nó`):** exibe 3 lembretes curtos de fala específicos do nó atual + a previsão de término (`Prev ~MM:SS`) e dica de ritmo (pode ser ligado/desligado remotamente pelo app Android).

### 2. App Mestre de Controle Mobile-First (`index.html` + `mobile-app.css` + `app.js`)
- **Redesign Mobile-First Minimalista e Fluido (Nunca um site desktop espremido):**
  - Folha de estilo exclusiva (`mobile-app.css`) com **rolagem vertical nativa livre e fluida (`overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y`)** e barra de rolagem visível.
  - **Barra Superior Compacta (`56px`):**
    - À esquerda: Pílula de status da rede local (`🟢 <IP>:8080 (N PC)`).
    - À direita: Os **2 Timers Preditivos (`GERAL` e `<APRESENTADOR>`)** lado a lado com cores dinâmicas (Verde/Amarelo/Vermelho).
  - **Dock Inferior Ergonômico na Zona do Polegar:**
    - **Linha 1 — Controle Linear da Lista Duplamente Encadeada:** Botões grandes **`⬅ Ant.`** e **`Avançar ➡`** + indicador central **`NÓ XX / YY`** com o rótulo do nó atual.
    - **Linha 2 — 4 Abas Minimalistas de Navegação:**
      1. **`🎛️ Controle`:** Banner automático de confirmação de troca de apresentador (quando aplicável), Card Hero com slide atual, apresentador atual, pílula de previsão IA de ritmo, botão rápido de início/troca/pausa de timer e lista vertical limpa dos cards/gráficos SVG do slide atual (e suas sub-abas) para projeção em 1 toque.
      2. **`🎙️ Roteiro`:** Teleprompter de leitura confortável no celular com o objetivo do slide, as 3 dicas enviadas ao canto do projetor no nó atual e os tópicos detalhados de fala (*"O que falar com naturalidade e não ler"*).
      3. **`🗂️ Slides`:** Grade para confirmação manual de qualquer apresentador/etapa, lista de todos os slides para pulo direto e lista completa de todos os nós da Lista Duplamente Encadeada.
      4. **`📡 Rede & Tela`:** Card em destaque com o **Link Gerado pelo App (`http://<IP-DO-CELULAR>:8080`)**, botão **`📋 Copiar Link`**, lista de todos os IPs detectados no aparelho e controles remotos da tela do PC (*Tema Claro/Escuro*, *Dicas ON/OFF* e *Tamanho da Fonte `A-` / `A+`*).

### 3. Lista Duplamente Encadeada + Motor Preditivo com Fator Humano (`shared-data.js`)
- **`DoublyLinkedPresentation` & `DoublyLinkedNode`:**
  - Modele toda a sequência linear da apresentação (visão geral do slide → cada janela/gráfico → cada sub-aba → fechamento/transição) como uma **Lista Duplamente Encadeada** onde cada nó tem `.prev`, `.next`, `.slideIndex`, `.modalId`, `.tabIdx`, `.speakerKey`, `.expectedSec`, `.shortLabel`, `.title` e `.tips`.
  - As setas **`ArrowLeft` (`←`) e `ArrowRight` (`→`)**, os botões **`⬅ Ant.` / `Avançar ➡`** e os **botões físicos de `Volume +` e `Volume -` do Android** percorrem exclusivamente `.prev` e `.next`.
  - Qualquer clique paralelo em slides, janelas ou sub-abas ressincroniza automaticamente o ponteiro da lista encadeada via `findBestMatch(slideIndex, modalId, tabIdx)`.
- **`PredictivePacingEngine` (Algoritmo Inteligente de Previsão de Tempo):**
  - A cada segundo e a cada transição de nó, calcule a soma de `expectedSec` dos nós que ainda faltam para o apresentador atual (aplicando um fator humano de compressão natural de ~16%, `0.84`) e compare com o tempo restante no timer decrescente (`speakerDriftSec`), além de projetar a duração total do seminário (`predictedTotalSpeechSec`):
    - **🟢 Verde:** ritmo confortável dentro da meta.
    - **🟡 Amarelo:** atraso moderado projetado para os cards restantes — avisa para sintetizar exemplos.
    - **🔴 Vermelho:** atraso crítico projetado ou tempo esgotando — avisa para ir direto ao gancho de transição.
- **`NexoSyncBus` (Sincronização em Tempo Real):**
  - No App Android, envia o estado diretamente via ponte nativa `window.AndroidHost.pushState(json)` e lê IPs/clientes conectados via `window.AndroidHost.getServerInfo()`.
  - No navegador do PC (`projetor.html`), recebe atualizações instantâneas via **Server-Sent Events (`EventSource('/api/events')`)** + polling resiliente (`GET /api/state` a cada 450ms).

### 4. Aplicativo Android Nativo com Servidor LAN Embarcado (`android-app/` + `.apk`)
- **`LanPresentationServer.java`:**
  - Servidor HTTP + SSE (`text/event-stream`) + REST (`/api/state`, `/api/info`, `/api/events`) multi-thread em Java puro escutando em `0.0.0.0:8080` (com fallback `8081..8090`).
  - Detecta automaticamente os IPs IPv4 ativos do celular (`wlan0`, `ap0`, `swlan0`, `rndis0`) e serve `projetor.html` na rota raiz `/` (e todos os arquivos `.css`, `.js`, `.svg` do `AssetManager` `assets/www/`) para qualquer computador na mesma rede Wi-Fi ou Hotspot.
- **`MainActivity.java`:**
  - `WebView` tela cheia acelerada por hardware (`file:///android_asset/www/index.html`), barra de rolagem vertical habilitada, `FLAG_KEEP_SCREEN_ON`, `WifiLock` (`WIFI_MODE_FULL_HIGH_PERF`), feedback tátil (`Vibrator`) e interceptação física de `KEYCODE_VOLUME_UP` (`window.nexoStepNext()`) e `KEYCODE_VOLUME_DOWN` (`window.nexoStepPrev()`).
- **`build_apk.sh` & `servidor_local.py`:**
  - Crie e execute o script `android-app/build_apk.sh` (usando `aapt2`, `javac`, `d8`, `zipalign` e `apksigner` com assinatura v1+v2+v3) para gerar e verificar o arquivo `.apk` instalável na raiz do projeto, além de incluir `servidor_local.py` como alternativa desktop.

======================================================================
FASE 3 — BUILD DO APK, DOCUMENTAÇÃO E PUBLICAÇÃO NO GITHUB
======================================================================
1. Compile e valide o `.apk` real garantindo zero erros de sintaxe e 100% de correspondência de IDs no DOM.
2. Crie um `README.md` completo com diagrama Mermaid da arquitetura Android LAN + PC, link de download direto para o `.apk`, tabela completa dos slides/gráficos e guia passo a passo de uso via Wi-Fi ou Hotspot do celular.
3. Crie um **novo repositório público no meu GitHub** (`gh repo create <nome-do-repositorio> --public --source=. --remote=origin --push`), ative o **GitHub Pages** nele, configure a descrição e os tópicos do repositório e me entregue os links finais prontos!
```
