/**
 * ============================================================================
 * CASO NEXO CAMPUS TECNOLOGIA — SEMINÁRIO GRUPO 3
 * Minimalist Mobile-First Android Master Controller Logic (app.js)
 * Smooth Native Scrolling + Thumb-Zone Linear Steps + Predictive Timers
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  const syncBus = new NexoSyncBus("controller");

  // Top Header Elements
  const topLanChipBtn = document.getElementById("topLanChipBtn");
  const topLanDot = document.getElementById("topLanDot");
  const topLanText = document.getElementById("topLanText");
  const ctrlGeneralTimerPill = document.getElementById("ctrlGeneralTimerPill");
  const ctrlGeneralTime = document.getElementById("ctrlGeneralTime");
  const ctrlSpeakerTimerPill = document.getElementById("ctrlSpeakerTimerPill");
  const ctrlSpeakerPhaseLabel = document.getElementById("ctrlSpeakerPhaseLabel");
  const ctrlSpeakerTime = document.getElementById("ctrlSpeakerTime");

  // Main Scroll Container & Views
  const appScrollMain = document.getElementById("appScrollMain");
  const bottomNavTabs = document.getElementById("bottomNavTabs");

  // View 1 (Control & Graphics) Elements
  const handoffConfirmBanner = document.getElementById("handoffConfirmBanner");
  const handoffBannerTitle = document.getElementById("handoffBannerTitle");
  const bannerConfirmBtn = document.getElementById("bannerConfirmBtn");
  const bannerDismissBtn = document.getElementById("bannerDismissBtn");

  const heroSlideBadge = document.getElementById("heroSlideBadge");
  const liveSpeakerBadge = document.getElementById("liveSpeakerBadge");
  const liveSlideTitle = document.getElementById("liveSlideTitle");
  const livePacingBanner = document.getElementById("livePacingBanner");
  const livePacingText = document.getElementById("livePacingText");
  const ctrlPredictedTotal = document.getElementById("ctrlPredictedTotal");

  const quickConfirmPhaseBtn = document.getElementById("quickConfirmPhaseBtn");
  const timerPauseResumeBtn = document.getElementById("timerPauseResumeBtn");
  const timerResetAllBtn = document.getElementById("timerResetAllBtn");
  const closeRemoteModalBtn = document.getElementById("closeRemoteModalBtn");
  const triggersGridContainer = document.getElementById("triggersGridContainer");

  // View 2 (Script / Teleprompter) Elements
  const notesSpeakerName = document.getElementById("notesSpeakerName");
  const notesTargetTime = document.getElementById("notesTargetTime");
  const notesObjective = document.getElementById("notesObjective");
  const nodeSpecificTipsList = document.getElementById("nodeSpecificTipsList");
  const notesBulletsList = document.getElementById("notesBulletsList");

  // View 3 (Slides & Doubly Linked Nodes) Elements
  const phaseButtonsGrid = document.getElementById("phaseButtonsGrid");
  const slidesListContainer = document.getElementById("slidesListContainer");
  const linkedNodesFullList = document.getElementById("linkedNodesFullList");

  // View 4 (Network & Remote Settings) Elements
  const netClientsBadge = document.getElementById("netClientsBadge");
  const lanPrimaryUrlText = document.getElementById("lanPrimaryUrlText");
  const copyLanUrlBtn = document.getElementById("copyLanUrlBtn");
  const allDetectedUrlsList = document.getElementById("allDetectedUrlsList");
  const remoteThemeBtn = document.getElementById("remoteThemeBtn");
  const remoteThemeLabel = document.getElementById("remoteThemeLabel");
  const remoteTipsToggleBtn = document.getElementById("remoteTipsToggleBtn");
  const remoteFontDecBtn = document.getElementById("remoteFontDecBtn");
  const remoteFontIncBtn = document.getElementById("remoteFontIncBtn");

  // Bottom Thumb Bar Elements
  const linearPrevNodeBtn = document.getElementById("linearPrevNodeBtn");
  const linearNextNodeBtn = document.getElementById("linearNextNodeBtn");
  const centerNodeInfoBtn = document.getElementById("centerNodeInfoBtn");
  const liveNodeIndexLabel = document.getElementById("liveNodeIndexLabel");
  const bottomNodeShortLabel = document.getElementById("bottomNodeShortLabel");

  const totalSlides = 7;
  let timerRunning = false;
  let timerInterval = null;
  let dismissedHandoffPhase = null;

  function formatSec(sec) {
    const isNeg = sec < 0;
    const abs = Math.abs(sec);
    const mins = Math.floor(abs / 60);
    const rem = abs % 60;
    return `${isNeg ? "-" : ""}${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  /* ==========================================================================
     0. TAB NAVIGATION & SMOOTH SCROLL RESET
     ========================================================================== */
  function switchTab(targetViewId) {
    syncBus.vibrate(15);
    document.querySelectorAll(".tab-view").forEach((v) => {
      v.classList.toggle("active", v.id === targetViewId);
    });
    bottomNavTabs.querySelectorAll(".b-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab-target") === targetViewId);
    });
    if (appScrollMain) {
      appScrollMain.scrollTop = 0;
    }
  }

  bottomNavTabs.querySelectorAll(".b-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.getAttribute("data-tab-target"));
    });
  });

  // Tapping top LAN chip or center node counter jumps to the corresponding tab
  topLanChipBtn.addEventListener("click", () => switchTab("viewNetwork"));
  centerNodeInfoBtn.addEventListener("click", () => switchTab("viewSlides"));
  ctrlSpeakerTimerPill.addEventListener("click", () => switchTab("viewControl"));

  /* ==========================================================================
     1. LAN SERVER INFO & LINK GENERATION UI
     ========================================================================== */
  function updateLanServerUI(info) {
    if (!info) return;
    const url = info.primaryUrl || "http://192.168.0.100:8080";
    const shortHost = url.replace(/^https?:\/\//, "");
    const clients = info.connectedClients || 0;

    topLanDot.className = `status-dot ${clients > 0 ? "" : "waiting"}`;
    topLanText.textContent = clients > 0 ? `${shortHost} (${clients} PC)` : shortHost;

    lanPrimaryUrlText.textContent = url;
    netClientsBadge.textContent = clients > 0 ? `🟢 ${clients} PC(s) na Sala` : `📡 Aguardando PC`;

    const urls = (info.urls && info.urls.length > 0) ? info.urls : [url];
    allDetectedUrlsList.innerHTML = urls.map((u) => `
      <div class="m-row-between" style="padding:10px 12px; border-radius:10px; background:var(--bg-input); border:1px solid var(--border-hairline);">
        <span style="font-family:var(--font-mono); font-size:0.9rem; font-weight:700; color:var(--text-main); user-select:all;">${u}</span>
        <button class="m-btn" data-copy-url="${u}" style="min-height:32px; padding:4px 10px; font-size:0.76rem;">Copiar</button>
      </div>
    `).join("");

    allDetectedUrlsList.querySelectorAll("[data-copy-url]").forEach((btn) => {
      btn.addEventListener("click", () => {
        copyTextToClipboard(btn.getAttribute("data-copy-url"), btn);
      });
    });
  }

  function copyTextToClipboard(text, btnEl) {
    syncBus.vibrate(20);
    const done = () => {
      const orig = btnEl.textContent;
      btnEl.textContent = "✓ Copiado!";
      setTimeout(() => { btnEl.textContent = orig; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, cb) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    if (cb) cb();
  }

  copyLanUrlBtn.addEventListener("click", () => {
    copyTextToClipboard(lanPrimaryUrlText.textContent, copyLanUrlBtn);
  });

  syncBus.onServerInfoChange((info) => updateLanServerUI(info));

  /* ==========================================================================
     2. DOUBLY LINKED LIST NAVIGATION (Ant <-> Atual <-> Prox)
     ========================================================================== */
  function getCurrentLinkedNode() {
    return PRESENTATION_LINKED_LIST.getNode(syncBus.state.linearNodeIndex || 0);
  }

  function goToLinkedNode(node) {
    if (!node) return;
    syncBus.vibrate(25);

    const currentPhase = syncBus.state.speakerPhase || "yago";
    let pendingHandoff = syncBus.state.pendingHandoffTo;

    if (syncBus.state.presentationStarted && node.speakerKey !== currentPhase && dismissedHandoffPhase !== node.speakerKey) {
      pendingHandoff = node.speakerKey;
    } else if (node.speakerKey === currentPhase) {
      pendingHandoff = null;
    }

    const nextState = {
      ...syncBus.state,
      linearNodeIndex: node.index,
      slideIndex: node.slideIndex,
      activeModalId: node.modalId,
      activeModalTabIdx: node.tabIdx,
      pendingHandoffTo: pendingHandoff
    };

    const evalRes = PredictivePacingEngine.evaluate(nextState);
    syncBus.updateState({
      linearNodeIndex: node.index,
      slideIndex: node.slideIndex,
      activeModalId: node.modalId,
      activeModalTabIdx: node.tabIdx,
      pendingHandoffTo: pendingHandoff,
      generalColor: evalRes.generalColor,
      speakerColor: evalRes.speakerColor,
      pacingAdvice: evalRes.pacingAdvice,
      predictedTotalText: formatSec(evalRes.predictedTotalSpeechSec)
    });
  }

  function stepLinearPrev() {
    const curr = getCurrentLinkedNode();
    if (curr && curr.prev) goToLinkedNode(curr.prev);
  }

  function stepLinearNext() {
    const curr = getCurrentLinkedNode();
    if (curr && curr.next) goToLinkedNode(curr.next);
  }

  window.nexoStepNext = stepLinearNext;
  window.nexoStepPrev = stepLinearPrev;

  linearPrevNodeBtn.addEventListener("click", stepLinearPrev);
  linearNextNodeBtn.addEventListener("click", stepLinearNext);

  /* ==========================================================================
     3. PARALLEL NAVIGATION (Touch / Hotkeys) WITH LINKED LIST SYNC
     ========================================================================== */
  function navigateParallel(slideIndex, modalId = null, tabIdx = 0) {
    syncBus.vibrate(20);
    const matchedNode = PRESENTATION_LINKED_LIST.findBestMatch(slideIndex, modalId, tabIdx);
    const currentPhase = syncBus.state.speakerPhase || "yago";
    let pendingHandoff = syncBus.state.pendingHandoffTo;

    if (syncBus.state.presentationStarted && matchedNode.speakerKey !== currentPhase && dismissedHandoffPhase !== matchedNode.speakerKey) {
      pendingHandoff = matchedNode.speakerKey;
    } else if (matchedNode.speakerKey === currentPhase) {
      pendingHandoff = null;
    }

    const nextState = {
      ...syncBus.state,
      slideIndex,
      activeModalId: modalId,
      activeModalTabIdx: tabIdx,
      linearNodeIndex: matchedNode.index,
      pendingHandoffTo: pendingHandoff
    };

    const evalRes = PredictivePacingEngine.evaluate(nextState);
    syncBus.updateState({
      slideIndex,
      activeModalId: modalId,
      activeModalTabIdx: tabIdx,
      linearNodeIndex: matchedNode.index,
      pendingHandoffTo: pendingHandoff,
      generalColor: evalRes.generalColor,
      speakerColor: evalRes.speakerColor,
      pacingAdvice: evalRes.pacingAdvice,
      predictedTotalText: formatSec(evalRes.predictedTotalSpeechSec)
    });
  }

  /* ==========================================================================
     4. SPEAKER START & HANDOFF CONFIRMATION SYSTEM + PREDICTIVE TIMERS
     ========================================================================== */
  function confirmSpeakerPhase(phaseKey) {
    const phase = SPEAKER_PHASES[phaseKey];
    if (!phase) return;
    syncBus.vibrate(45);
    dismissedHandoffPhase = null;

    if (!timerRunning) {
      startTimerLoop();
    }

    const nextState = {
      ...syncBus.state,
      presentationStarted: true,
      speakerPhase: phaseKey,
      speakerRemainingSec: phase.budgetSec,
      pendingHandoffTo: null
    };

    const evalRes = PredictivePacingEngine.evaluate(nextState);
    syncBus.updateState({
      presentationStarted: true,
      speakerPhase: phaseKey,
      speakerRemainingSec: phase.budgetSec,
      pendingHandoffTo: null,
      generalColor: evalRes.generalColor,
      speakerColor: evalRes.speakerColor,
      pacingAdvice: evalRes.pacingAdvice,
      predictedTotalText: formatSec(evalRes.predictedTotalSpeechSec)
    });
  }

  function startTimerLoop() {
    if (timerInterval) clearInterval(timerInterval);
    timerRunning = true;
    timerPauseResumeBtn.textContent = "⏸";

    timerInterval = setInterval(() => {
      const nextGeneral = (syncBus.state.generalElapsedSec || 0) + 1;
      const nextSpeakerRem = (syncBus.state.speakerRemainingSec || 0) - 1;

      const tempState = {
        ...syncBus.state,
        generalElapsedSec: nextGeneral,
        speakerRemainingSec: nextSpeakerRem
      };

      const evalRes = PredictivePacingEngine.evaluate(tempState);

      syncBus.updateState({
        generalElapsedSec: nextGeneral,
        speakerRemainingSec: nextSpeakerRem,
        generalColor: evalRes.generalColor,
        speakerColor: evalRes.speakerColor,
        pacingAdvice: evalRes.pacingAdvice,
        predictedTotalText: formatSec(evalRes.predictedTotalSpeechSec)
      });
    }, 1000);
  }

  function pauseOrResumeTimer() {
    syncBus.vibrate(25);
    if (!syncBus.state.presentationStarted) {
      confirmSpeakerPhase("yago");
      return;
    }
    if (timerRunning) {
      timerRunning = false;
      clearInterval(timerInterval);
      timerPauseResumeBtn.textContent = "▶";
    } else {
      startTimerLoop();
    }
  }

  function resetAllTimers() {
    syncBus.vibrate(40);
    timerRunning = false;
    clearInterval(timerInterval);
    timerPauseResumeBtn.textContent = "▶";
    dismissedHandoffPhase = null;

    syncBus.updateState({
      presentationStarted: false,
      speakerPhase: "yago",
      pendingHandoffTo: null,
      generalElapsedSec: 0,
      speakerRemainingSec: SPEAKER_PHASES.yago.budgetSec,
      generalColor: "green",
      speakerColor: "green",
      pacingAdvice: "Aguardando confirmação de início",
      predictedTotalText: "14:00"
    });
  }

  quickConfirmPhaseBtn.addEventListener("click", () => {
    if (!syncBus.state.presentationStarted) {
      confirmSpeakerPhase("yago");
      return;
    }
    if (syncBus.state.pendingHandoffTo) {
      confirmSpeakerPhase(syncBus.state.pendingHandoffTo);
      return;
    }
    const currentPhase = SPEAKER_PHASES[syncBus.state.speakerPhase || "yago"];
    if (currentPhase && currentPhase.nextPhase) {
      confirmSpeakerPhase(currentPhase.nextPhase);
    } else {
      confirmSpeakerPhase(syncBus.state.speakerPhase || "yago");
    }
  });

  bannerConfirmBtn.addEventListener("click", () => {
    if (syncBus.state.pendingHandoffTo) {
      confirmSpeakerPhase(syncBus.state.pendingHandoffTo);
    }
  });

  bannerDismissBtn.addEventListener("click", () => {
    dismissedHandoffPhase = syncBus.state.pendingHandoffTo;
    syncBus.updateState({ pendingHandoffTo: null });
  });

  phaseButtonsGrid.querySelectorAll("[data-confirm-phase]").forEach((btn) => {
    btn.addEventListener("click", () => {
      confirmSpeakerPhase(btn.getAttribute("data-confirm-phase"));
      switchTab("viewControl");
    });
  });

  timerPauseResumeBtn.addEventListener("click", pauseOrResumeTimer);
  timerResetAllBtn.addEventListener("click", resetAllTimers);

  /* ==========================================================================
     5. RENDER UI VIEWS
     ========================================================================== */
  function renderAllUI() {
    const state = syncBus.state;
    const slideNum = (state.slideIndex || 0) + 1;
    const info = SLIDE_SPEAKER_DATA[slideNum];
    const phase = SPEAKER_PHASES[state.speakerPhase || "yago"] || SPEAKER_PHASES.yago;
    const currNode = getCurrentLinkedNode();
    const activeModalId = state.activeModalId;
    const activeTabIdx = state.activeModalTabIdx || 0;

    // 1. Top Bar Timers
    ctrlGeneralTime.textContent = formatSec(state.generalElapsedSec || 0);
    ctrlGeneralTimerPill.className = `mini-timer-pill state-${state.generalColor || "green"}`;

    ctrlSpeakerPhaseLabel.textContent = phase.shortName;
    ctrlSpeakerTime.textContent = formatSec(state.speakerRemainingSec !== undefined ? state.speakerRemainingSec : phase.budgetSec);
    ctrlSpeakerTimerPill.className = `mini-timer-pill state-${state.speakerColor || "green"}`;

    // 2. Bottom Thumb Bar
    linearPrevNodeBtn.disabled = !currNode.prev;
    linearNextNodeBtn.disabled = !currNode.next;
    liveNodeIndexLabel.textContent = `NÓ ${String(currNode.index + 1).padStart(2, "0")} / ${PRESENTATION_LINKED_LIST.nodes.length}`;
    bottomNodeShortLabel.textContent = currNode.shortLabel;

    // 3. View 1: Hero Card & Pacing
    heroSlideBadge.textContent = `SLIDE 0${slideNum} / 07`;
    liveSpeakerBadge.textContent = `🎙️ ${info.speaker}`;
    liveSlideTitle.textContent = currNode.title;

    const pColor = state.speakerColor || "green";
    const pIcon = pColor === "red" ? "🔴" : pColor === "yellow" ? "🟡" : "🟢";
    livePacingBanner.className = `pacing-pill state-${pColor}`;
    livePacingText.textContent = `${pIcon} ${state.pacingAdvice || "Ritmo ideal"}`;
    ctrlPredictedTotal.textContent = `Prev ~${state.predictedTotalText || "14:00"}`;

    if (!state.presentationStarted) {
      quickConfirmPhaseBtn.textContent = `✅ Iniciar: Yago (04:00)`;
    } else if (state.pendingHandoffTo && SPEAKER_PHASES[state.pendingHandoffTo]) {
      const nextP = SPEAKER_PHASES[state.pendingHandoffTo];
      quickConfirmPhaseBtn.textContent = `🔔 Confirmar: ${nextP.shortName} (${formatSec(nextP.budgetSec)})`;
    } else if (phase.nextPhase && SPEAKER_PHASES[phase.nextPhase]) {
      const nextP = SPEAKER_PHASES[phase.nextPhase];
      quickConfirmPhaseBtn.textContent = `🔄 Trocar p/ ${nextP.shortName} (${formatSec(nextP.budgetSec)})`;
    } else {
      quickConfirmPhaseBtn.textContent = `🔄 Reiniciar Perguntas (04:00)`;
    }

    if (state.pendingHandoffTo && SPEAKER_PHASES[state.pendingHandoffTo]) {
      const pendingP = SPEAKER_PHASES[state.pendingHandoffTo];
      handoffConfirmBanner.style.display = "flex";
      handoffBannerTitle.textContent = `Entrada de ${pendingP.name} (${formatSec(pendingP.budgetSec)})`;
      bannerConfirmBtn.textContent = `✅ Confirmar ${pendingP.name} (${formatSec(pendingP.budgetSec)})`;
    } else {
      handoffConfirmBanner.style.display = "none";
    }

    closeRemoteModalBtn.style.display = activeModalId ? "inline-flex" : "none";

    // Build Graphic Trigger Cards for Current Slide
    triggersGridContainer.innerHTML = "";
    info.cards.forEach((cardInfo) => {
      const mData = INTERACTIVE_MODALS[cardInfo.id];
      if (!mData) return;

      const isActive = activeModalId === cardInfo.id;
      const cardEl = document.createElement("div");
      cardEl.className = `graphic-item-card ${isActive ? "is-live" : ""}`;

      const tabs = mData.tabs || [];
      let subtabsHtml = "";
      if (tabs.length > 1) {
        subtabsHtml = `<div class="subtab-pills-wrap">`;
        tabs.forEach((t, tIdx) => {
          const isTabActive = isActive && activeTabIdx === tIdx;
          subtabsHtml += `
            <button class="subtab-pill-btn ${isTabActive ? "active" : ""}" data-modal="${cardInfo.id}" data-tab="${tIdx}">
              <span>${t.label}</span>
              <span style="font-family:var(--font-mono); font-size:0.72rem; opacity:0.8;">${isTabActive ? "● NO AR" : `Aba ${tIdx + 1}`}</span>
            </button>
          `;
        });
        subtabsHtml += `</div>`;
      }

      cardEl.innerHTML = `
        <button class="graphic-header-btn" data-toggle-modal="${cardInfo.id}">
          <div style="display:flex; flex-direction:column; gap:3px;">
            <span style="font-family:var(--font-mono); font-size:0.7rem; font-weight:800; color:${isActive ? "#38bdf8" : "#64748b"};">
              ${isActive ? "🟢 EXIBINDO NA TELA DO PC" : `GRÁFICO / JANELA [${cardInfo.hotkey}]`}
            </span>
            <span class="graphic-title-text">${cardInfo.label}</span>
          </div>
          <span class="graphic-action-pill">${isActive ? "✕ Fechar" : "Projetar"}</span>
        </button>
        ${subtabsHtml}
      `;
      triggersGridContainer.appendChild(cardEl);
    });

    triggersGridContainer.querySelectorAll("[data-toggle-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-toggle-modal");
        if (syncBus.state.activeModalId === targetId) {
          navigateParallel(syncBus.state.slideIndex, null, 0);
        } else {
          navigateParallel(syncBus.state.slideIndex, targetId, 0);
        }
      });
    });

    triggersGridContainer.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetModal = btn.getAttribute("data-modal");
        const targetTab = parseInt(btn.getAttribute("data-tab"), 10);
        navigateParallel(syncBus.state.slideIndex, targetModal, targetTab);
      });
    });

    // 4. View 2: Script / Teleprompter
    notesSpeakerName.textContent = `🎙️ ${info.speaker}`;
    notesTargetTime.textContent = `⏱️ Meta: ${info.timeText}`;
    notesObjective.textContent = info.objective;
    nodeSpecificTipsList.innerHTML = (currNode.tips || []).map((t) => `
      <div class="script-bullet-card cue-tip">💡 ${t}</div>
    `).join("");
    notesBulletsList.innerHTML = info.bullets.map((b) => `
      <div class="script-bullet-card">${b}</div>
    `).join("");

    // 5. View 3: 7 Slides & Full 28 Linked Nodes
    phaseButtonsGrid.querySelectorAll("[data-confirm-phase]").forEach((btn) => {
      const pKey = btn.getAttribute("data-confirm-phase");
      btn.classList.toggle("active", state.presentationStarted && state.speakerPhase === pKey);
    });

    slidesListContainer.innerHTML = "";
    for (let i = 1; i <= totalSlides; i++) {
      const idx = i - 1;
      const sInfo = SLIDE_SPEAKER_DATA[i];
      const row = document.createElement("div");
      row.className = `slide-list-card ${idx === (state.slideIndex || 0) ? "active" : ""}`;
      row.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:3px;">
          <span style="font-family:var(--font-mono); font-size:0.74rem; font-weight:800; color:var(--brand-primary);">SLIDE 0${i} • ${sInfo.speaker}</span>
          <span style="font-size:0.96rem; font-weight:800; color:var(--text-main);">${sInfo.shortTitle}</span>
        </div>
        <span class="m-badge">${sInfo.timeText}</span>
      `;
      row.addEventListener("click", () => {
        navigateParallel(idx, null, 0);
        switchTab("viewControl");
      });
      slidesListContainer.appendChild(row);
    }

    linkedNodesFullList.innerHTML = "";
    PRESENTATION_LINKED_LIST.nodes.forEach((node, nIdx) => {
      const isCurr = node.index === currNode.index;
      const nRow = document.createElement("div");
      nRow.className = `slide-list-card ${isCurr ? "active" : ""}`;
      nRow.style.padding = "10px 14px";
      nRow.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-family:var(--font-mono); font-size:0.78rem; font-weight:800; color:var(--brand-primary);">${String(nIdx + 1).padStart(2, "0")}</span>
          <span style="font-size:0.88rem; font-weight:700; color:var(--text-main);">${node.title}</span>
        </div>
        <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-dim);">${isCurr ? "● ATUAL" : "Ir →"}</span>
      `;
      nRow.addEventListener("click", () => {
        goToLinkedNode(node);
        switchTab("viewControl");
      });
      linkedNodesFullList.appendChild(nRow);
    });

    // 6. View 4: Remote Settings
    remoteThemeLabel.textContent = state.theme === "dark" ? "☀️ Mudar p/ Claro" : "🌙 Mudar p/ Escuro";
    remoteTipsToggleBtn.textContent = state.showProjectorTips !== false ? "💡 Dicas ON" : "🙈 Dicas OFF";
  }

  closeRemoteModalBtn.addEventListener("click", () => {
    navigateParallel(syncBus.state.slideIndex, null, 0);
  });

  remoteTipsToggleBtn.addEventListener("click", () => {
    syncBus.vibrate(15);
    syncBus.updateState({ showProjectorTips: syncBus.state.showProjectorTips === false });
  });

  remoteThemeBtn.addEventListener("click", () => {
    syncBus.vibrate(15);
    const nextTheme = syncBus.state.theme === "dark" ? "light" : "dark";
    syncBus.updateState({ theme: nextTheme });
  });

  remoteFontDecBtn.addEventListener("click", () => {
    syncBus.vibrate(15);
    const nextScale = Math.max(0.8, +((syncBus.state.fontScale || 1.0) - 0.06).toFixed(2));
    syncBus.updateState({ fontScale: nextScale });
  });

  remoteFontIncBtn.addEventListener("click", () => {
    syncBus.vibrate(15);
    const nextScale = Math.min(1.25, +((syncBus.state.fontScale || 1.0) + 0.06).toFixed(2));
    syncBus.updateState({ fontScale: nextScale });
  });

  // External Keyboard Support
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key === "ArrowRight") { e.preventDefault(); stepLinearNext(); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); stepLinearPrev(); return; }
    if (e.key === "Escape" && syncBus.state.activeModalId) {
      e.preventDefault();
      navigateParallel(syncBus.state.slideIndex, null, 0);
    }
  });

  syncBus.onStateChange(() => renderAllUI());
  renderAllUI();
});
