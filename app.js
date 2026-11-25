/**
 * ============================================================================
 * CASO NEXO CAMPUS TECNOLOGIA — SEMINÁRIO GRUPO 3
 * Doubly Linked List Linear Navigation + Parallel Triggers + Predictive Timers
 * Control Tab (index.html)  ===>  Projector Tab (projetor.html)
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  const syncBus = new NexoSyncBus("controller");

  // Top Bar Elements
  const launchProjectorBtn = document.getElementById("launchProjectorBtn");
  const syncStatusPill = document.getElementById("syncStatusPill");
  const syncStatusDot = document.getElementById("syncStatusDot");
  const syncStatusText = document.getElementById("syncStatusText");

  const ctrlGeneralTimerPill = document.getElementById("ctrlGeneralTimerPill");
  const ctrlGeneralTime = document.getElementById("ctrlGeneralTime");
  const ctrlPredictedTotal = document.getElementById("ctrlPredictedTotal");
  const ctrlSpeakerTimerPill = document.getElementById("ctrlSpeakerTimerPill");
  const ctrlSpeakerPhaseLabel = document.getElementById("ctrlSpeakerPhaseLabel");
  const ctrlSpeakerTime = document.getElementById("ctrlSpeakerTime");

  const quickConfirmPhaseBtn = document.getElementById("quickConfirmPhaseBtn");
  const timerPauseResumeBtn = document.getElementById("timerPauseResumeBtn");
  const timerResetAllBtn = document.getElementById("timerResetAllBtn");

  const remoteTipsToggleBtn = document.getElementById("remoteTipsToggleBtn");
  const remoteFontDecBtn = document.getElementById("remoteFontDecBtn");
  const remoteFontIncBtn = document.getElementById("remoteFontIncBtn");
  const remoteThemeBtn = document.getElementById("remoteThemeBtn");
  const remoteThemeLabel = document.getElementById("remoteThemeLabel");

  // Fixed Linear Track Bar (Doubly Linked List)
  const linearPrevNodeBtn = document.getElementById("linearPrevNodeBtn");
  const linearNextNodeBtn = document.getElementById("linearNextNodeBtn");
  const linkedNodesScroll = document.getElementById("linkedNodesScroll");

  // Speaker Handoff Confirmation Banner
  const handoffConfirmBanner = document.getElementById("handoffConfirmBanner");
  const handoffBannerTitle = document.getElementById("handoffBannerTitle");
  const handoffBannerDesc = document.getElementById("handoffBannerDesc");
  const bannerConfirmBtn = document.getElementById("bannerConfirmBtn");
  const bannerDismissBtn = document.getElementById("bannerDismissBtn");

  // Cockpit Columns
  const phaseButtonsGrid = document.getElementById("phaseButtonsGrid");
  const slidesListContainer = document.getElementById("slidesListContainer");
  const miniPreviewIframe = document.getElementById("miniPreviewIframe");
  const liveNodeIndexLabel = document.getElementById("liveNodeIndexLabel");
  const liveSpeakerBadge = document.getElementById("liveSpeakerBadge");
  const liveSlideTitle = document.getElementById("liveSlideTitle");
  const liveModalStatusBanner = document.getElementById("liveModalStatusBanner");
  const livePacingBanner = document.getElementById("livePacingBanner");
  const closeRemoteModalBtn = document.getElementById("closeRemoteModalBtn");
  const triggersGridContainer = document.getElementById("triggersGridContainer");

  // Teleprompter Elements
  const notesTargetTime = document.getElementById("notesTargetTime");
  const notesSpeakerName = document.getElementById("notesSpeakerName");
  const notesObjective = document.getElementById("notesObjective");
  const nodeSpecificTipsList = document.getElementById("nodeSpecificTipsList");
  const notesBulletsList = document.getElementById("notesBulletsList");

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

  function syncMiniPreview(state) {
    if (miniPreviewIframe && miniPreviewIframe.contentWindow) {
      try {
        miniPreviewIframe.contentWindow.postMessage({ type: "STATE_UPDATE", payload: state }, "*");
      } catch (e) {}
    }
  }

  // Launch Classroom Projector Tab
  launchProjectorBtn.addEventListener("click", () => {
    const win = syncBus.openProjectorTab();
    if (win) updateConnectionUI(true);
  });

  function updateConnectionUI(isConnected) {
    if (isConnected) {
      syncStatusPill.classList.add("connected");
      syncStatusDot.textContent = "🟢";
      syncStatusText.textContent = "Projetor Sincronizado";
      launchProjectorBtn.innerHTML = `<span>🔄 Focar / Reabrir Guia da Turma</span>`;
    } else {
      syncStatusPill.classList.remove("connected");
      syncStatusDot.textContent = "⚪";
      syncStatusText.textContent = "Guia da turma fechada";
      launchProjectorBtn.innerHTML = `<span>🚀 Iniciar Apresentação (Abrir Guia da Turma)</span>`;
    }
  }

  syncBus.onProjectorStatusChange((isOpen) => updateConnectionUI(isOpen));

  setInterval(() => {
    if (syncBus.projectorWindow && syncBus.projectorWindow.closed) {
      syncBus.projectorWindow = null;
      updateConnectionUI(false);
    }
  }, 1500);

  /* ==========================================================================
     1. DOUBLY LINKED LIST NAVIGATION (Ant <-> Atual <-> Prox)
     ========================================================================== */
  function getCurrentLinkedNode() {
    return PRESENTATION_LINKED_LIST.getNode(syncBus.state.linearNodeIndex || 0);
  }

  function goToLinkedNode(node) {
    if (!node) return;

    // Check if this node belongs to a different speaker phase than the currently confirmed one
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
    if (curr && curr.prev) {
      goToLinkedNode(curr.prev);
    }
  }

  function stepLinearNext() {
    const curr = getCurrentLinkedNode();
    if (curr && curr.next) {
      goToLinkedNode(curr.next);
    }
  }

  linearPrevNodeBtn.addEventListener("click", stepLinearPrev);
  linearNextNodeBtn.addEventListener("click", stepLinearNext);

  // Render the Fixed Linear Doubly Linked List Track Bar
  function renderLinearTrackBar() {
    const curr = getCurrentLinkedNode();
    linearPrevNodeBtn.disabled = !curr.prev;
    linearNextNodeBtn.disabled = !curr.next;

    linkedNodesScroll.innerHTML = "";
    PRESENTATION_LINKED_LIST.nodes.forEach((node, idx) => {
      if (idx > 0) {
        const arrow = document.createElement("span");
        arrow.className = "linked-node-arrow";
        arrow.textContent = "⇄";
        linkedNodesScroll.appendChild(arrow);
      }

      const pill = document.createElement("button");
      const isCurrent = node.index === curr.index;
      pill.className = `linked-node-pill ${isCurrent ? "current-node" : ""}`;
      pill.innerHTML = `
        <span style="font-family:var(--font-mono); font-size:0.74rem; opacity:0.8;">${String(idx + 1).padStart(2, "0")}</span>
        <span>${node.shortLabel}</span>
      `;
      pill.addEventListener("click", () => goToLinkedNode(node));
      linkedNodesScroll.appendChild(pill);

      if (isCurrent) {
        setTimeout(() => {
          pill.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        }, 30);
      }
    });
  }

  /* ==========================================================================
     2. PARALLEL NAVIGATION (Mouse / Hotkeys) WITH LINKED LIST SYNC
     ========================================================================== */
  function navigateParallel(slideIndex, modalId = null, tabIdx = 0) {
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
     3. SPEAKER START & HANDOFF CONFIRMATION SYSTEM + PREDICTIVE TIMERS
     ========================================================================== */
  function confirmSpeakerPhase(phaseKey) {
    const phase = SPEAKER_PHASES[phaseKey];
    if (!phase) return;

    dismissedHandoffPhase = null;

    // Ensure timer is running once confirmed
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

  // Quick Confirm Button in Top Bar
  quickConfirmPhaseBtn.addEventListener("click", () => {
    if (!syncBus.state.presentationStarted) {
      confirmSpeakerPhase("yago");
      return;
    }
    if (syncBus.state.pendingHandoffTo) {
      confirmSpeakerPhase(syncBus.state.pendingHandoffTo);
      return;
    }
    // Otherwise advance to next logical speaker phase
    const currentPhase = SPEAKER_PHASES[syncBus.state.speakerPhase || "yago"];
    if (currentPhase && currentPhase.nextPhase) {
      confirmSpeakerPhase(currentPhase.nextPhase);
    } else {
      confirmSpeakerPhase(syncBus.state.speakerPhase || "yago");
    }
  });

  // Banner Confirm & Dismiss
  bannerConfirmBtn.addEventListener("click", () => {
    if (syncBus.state.pendingHandoffTo) {
      confirmSpeakerPhase(syncBus.state.pendingHandoffTo);
    }
  });

  bannerDismissBtn.addEventListener("click", () => {
    dismissedHandoffPhase = syncBus.state.pendingHandoffTo;
    syncBus.updateState({ pendingHandoffTo: null });
  });

  // Manual 4-Phase Grid Buttons in Column 1
  phaseButtonsGrid.querySelectorAll("[data-confirm-phase]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetPhase = btn.getAttribute("data-confirm-phase");
      confirmSpeakerPhase(targetPhase);
    });
  });

  timerPauseResumeBtn.addEventListener("click", pauseOrResumeTimer);
  timerResetAllBtn.addEventListener("click", resetAllTimers);

  /* ==========================================================================
     4. RENDER COCKPIT UI
     ========================================================================== */
  function renderTimersAndHandoffUI() {
    const state = syncBus.state;
    const phase = SPEAKER_PHASES[state.speakerPhase || "yago"] || SPEAKER_PHASES.yago;

    // Top bar general timer
    ctrlGeneralTime.textContent = formatSec(state.generalElapsedSec || 0);
    ctrlPredictedTotal.textContent = `(Prev ~${state.predictedTotalText || "14:00"})`;
    ctrlGeneralTimerPill.className = `timer-pill-state state-${state.generalColor || "green"}`;

    // Top bar speaker timer
    ctrlSpeakerPhaseLabel.textContent = `${phase.shortName} ↘`;
    ctrlSpeakerTime.textContent = formatSec(state.speakerRemainingSec !== undefined ? state.speakerRemainingSec : phase.budgetSec);
    ctrlSpeakerTimerPill.className = `timer-pill-state state-${state.speakerColor || "green"}`;

    // Quick Confirm Button Label
    if (!state.presentationStarted) {
      quickConfirmPhaseBtn.textContent = `✅ Confirmar Início: Yago (04:00)`;
    } else if (state.pendingHandoffTo && SPEAKER_PHASES[state.pendingHandoffTo]) {
      const nextP = SPEAKER_PHASES[state.pendingHandoffTo];
      quickConfirmPhaseBtn.textContent = `🔔 Confirmar Entrada: ${nextP.name} (${formatSec(nextP.budgetSec)})`;
    } else if (phase.nextPhase && SPEAKER_PHASES[phase.nextPhase]) {
      const nextP = SPEAKER_PHASES[phase.nextPhase];
      quickConfirmPhaseBtn.textContent = `🔄 Trocar p/ ${nextP.shortName} (${formatSec(nextP.budgetSec)})`;
    } else {
      quickConfirmPhaseBtn.textContent = `🔄 Reiniciar Timer Perguntas (04:00)`;
    }

    // Highlight active phase in Column 1 grid
    phaseButtonsGrid.querySelectorAll("[data-confirm-phase]").forEach((btn) => {
      const pKey = btn.getAttribute("data-confirm-phase");
      btn.classList.toggle("active", state.presentationStarted && state.speakerPhase === pKey);
    });

    // Handoff Banner
    if (state.pendingHandoffTo && SPEAKER_PHASES[state.pendingHandoffTo]) {
      const pendingP = SPEAKER_PHASES[state.pendingHandoffTo];
      handoffConfirmBanner.style.display = "flex";
      handoffBannerTitle.textContent = `Confirmar Troca para: ${pendingP.name} (${pendingP.roleLabel})`;
      handoffBannerDesc.textContent = `Clique para confirmar a troca e reiniciar o timer decrescente para ${formatSec(pendingP.budgetSec)}.`;
      bannerConfirmBtn.textContent = `✅ Confirmar Entrada de ${pendingP.name} (${formatSec(pendingP.budgetSec)})`;
    } else {
      handoffConfirmBanner.style.display = "none";
    }
  }

  function renderSlidesTimeline() {
    const currentIdx = syncBus.state.slideIndex || 0;
    slidesListContainer.innerHTML = "";

    for (let i = 1; i <= totalSlides; i++) {
      const idx = i - 1;
      const info = SLIDE_SPEAKER_DATA[i];
      const item = document.createElement("div");
      item.className = `slide-nav-item ${idx === currentIdx ? "active" : ""}`;
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-family:var(--font-mono); font-size:0.8rem; font-weight:800; color:#22d3ee;">SLIDE 0${i}</span>
          <span style="font-family:var(--font-mono); font-size:0.78rem; color:#94a3b8;">⏱️ ${info.timeText}</span>
        </div>
        <div style="font-size:0.98rem; font-weight:800; color:#f8fafc; line-height:1.22;">
          ${info.shortTitle}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.8rem; font-weight:700; color:#a5b4fc;">🎙️ ${info.speaker}</span>
          <span style="font-family:var(--font-mono); font-size:0.72rem; color:#64748b;">${info.cards.length} janelas</span>
        </div>
      `;
      item.addEventListener("click", () => navigateParallel(idx, null, 0));
      slidesListContainer.appendChild(item);
    }
  }

  function renderSlideTriggersAndPreview() {
    const state = syncBus.state;
    const slideNum = (state.slideIndex || 0) + 1;
    const info = SLIDE_SPEAKER_DATA[slideNum];
    const currNode = getCurrentLinkedNode();
    const activeModalId = state.activeModalId;
    const activeTabIdx = state.activeModalTabIdx || 0;

    liveNodeIndexLabel.textContent = `${String(currNode.index + 1).padStart(2, "0")} / ${PRESENTATION_LINKED_LIST.nodes.length}`;
    liveSpeakerBadge.textContent = `🎙️ ${info.speaker}`;
    liveSlideTitle.textContent = currNode.title;

    if (activeModalId && INTERACTIVE_MODALS[activeModalId]) {
      const mData = INTERACTIVE_MODALS[activeModalId];
      const activeTabLabel = (mData.tabs && mData.tabs[activeTabIdx]) ? mData.tabs[activeTabIdx].label : "";
      liveModalStatusBanner.style.borderColor = "#22d3ee";
      liveModalStatusBanner.style.background = "rgba(6, 182, 212, 0.14)";
      liveModalStatusBanner.innerHTML = `
        🟢 <strong>JANELA ABERTA NA SALA:</strong> ${mData.title}
        ${activeTabLabel ? `<br><span style="font-size:0.82rem; color:#22d3ee;">↳ Aba: ${activeTabLabel}</span>` : ""}
      `;
      closeRemoteModalBtn.style.display = "inline-flex";
    } else {
      liveModalStatusBanner.style.borderColor = "rgba(255,255,255,0.12)";
      liveModalStatusBanner.style.background = "#0f131d";
      liveModalStatusBanner.innerHTML = `📺 Tela da sala mostrando: <strong>Slide 0${slideNum} Limpo (Visão Geral)</strong>`;
      closeRemoteModalBtn.style.display = "none";
    }

    // Predictive Pacing Banner
    const pColor = state.speakerColor || "green";
    const pIcon = pColor === "red" ? "🔴" : pColor === "yellow" ? "🟡" : "🟢";
    livePacingBanner.textContent = `${pIcon} Previsão de Ritmo: ${state.pacingAdvice || "Ritmo ideal"}`;
    if (pColor === "red") {
      livePacingBanner.style.background = "rgba(244,63,94,0.18)";
      livePacingBanner.style.borderColor = "rgba(251,113,133,0.6)";
      livePacingBanner.style.color = "#fb7185";
    } else if (pColor === "yellow") {
      livePacingBanner.style.background = "rgba(245,158,11,0.18)";
      livePacingBanner.style.borderColor = "rgba(251,191,36,0.6)";
      livePacingBanner.style.color = "#fbbf24";
    } else {
      livePacingBanner.style.background = "rgba(16,185,129,0.12)";
      livePacingBanner.style.borderColor = "rgba(52,211,153,0.45)";
      livePacingBanner.style.color = "#34d399";
    }

    // Build Parallel Trigger Cards
    triggersGridContainer.innerHTML = "";
    info.cards.forEach((cardInfo) => {
      const mData = INTERACTIVE_MODALS[cardInfo.id];
      if (!mData) return;

      const isActive = activeModalId === cardInfo.id;
      const cardEl = document.createElement("div");
      cardEl.className = `trigger-control-card ${isActive ? "active-on-projector" : ""}`;

      const tabs = mData.tabs || [];
      let subtabsHtml = "";
      if (tabs.length > 0) {
        subtabsHtml = `<div class="subtabs-control-list">`;
        tabs.forEach((t, tIdx) => {
          const isTabActive = isActive && activeTabIdx === tIdx;
          subtabsHtml += `
            <button class="subtab-control-btn ${isTabActive ? "active" : ""}" data-modal="${cardInfo.id}" data-tab="${tIdx}">
              <span>${t.label}</span>
              <span class="kbd-hint">${isTabActive ? "NO AR" : `Aba ${tIdx + 1}`}</span>
            </button>
          `;
        });
        subtabsHtml += `</div>`;
      }

      cardEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-family:var(--font-mono); font-size:0.76rem; font-weight:800; color:${isActive ? "#22d3ee" : "#94a3b8"};">
            ${isActive ? "🟢 PROJETANDO NA SALA" : "JANELA & GRÁFICO"}
          </span>
          <span class="hotkey-pill">Tecla ${cardInfo.hotkey}</span>
        </div>
        <button class="trigger-main-btn" data-toggle-modal="${cardInfo.id}">
          <span style="text-align:left;">${cardInfo.label}</span>
          <span>${isActive ? "✕ Fechar" : "📺 Abrir"}</span>
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
  }

  function renderTeleprompter() {
    const slideNum = (syncBus.state.slideIndex || 0) + 1;
    const info = SLIDE_SPEAKER_DATA[slideNum];
    const currNode = getCurrentLinkedNode();

    notesTargetTime.textContent = `⏱️ Slide: ${info.timeText}`;
    notesSpeakerName.textContent = `🎙️ ${info.speaker}`;
    notesObjective.textContent = info.objective;
    nodeSpecificTipsList.innerHTML = (currNode.tips || []).map((t) => `<li style="padding:8px 12px; font-size:0.94rem; border-left:3px solid #22d3ee;">${t}</li>`).join("");
    notesBulletsList.innerHTML = info.bullets.map((b) => `<li>${b}</li>`).join("");
  }

  function renderAllControlUI() {
    renderTimersAndHandoffUI();
    renderLinearTrackBar();
    renderSlidesTimeline();
    renderSlideTriggersAndPreview();
    renderTeleprompter();

    remoteThemeLabel.textContent = syncBus.state.theme === "dark" ? "☀️ Claro" : "🌙 Escuro";
    remoteTipsToggleBtn.classList.toggle("active", syncBus.state.showProjectorTips !== false);
    remoteTipsToggleBtn.textContent = syncBus.state.showProjectorTips !== false ? "💡 Dicas ON" : "💡 Dicas OFF";

    syncMiniPreview(syncBus.state);
  }

  // Projector Remote Controls
  closeRemoteModalBtn.addEventListener("click", () => {
    navigateParallel(syncBus.state.slideIndex, null, 0);
  });

  remoteTipsToggleBtn.addEventListener("click", () => {
    syncBus.updateState({ showProjectorTips: syncBus.state.showProjectorTips === false });
  });

  remoteThemeBtn.addEventListener("click", () => {
    const nextTheme = syncBus.state.theme === "dark" ? "light" : "dark";
    syncBus.updateState({ theme: nextTheme });
  });

  remoteFontDecBtn.addEventListener("click", () => {
    const nextScale = Math.max(0.8, +((syncBus.state.fontScale || 1.0) - 0.06).toFixed(2));
    syncBus.updateState({ fontScale: nextScale });
  });

  remoteFontIncBtn.addEventListener("click", () => {
    const nextScale = Math.min(1.25, +((syncBus.state.fontScale || 1.0) + 0.06).toFixed(2));
    syncBus.updateState({ fontScale: nextScale });
  });

  /* ==========================================================================
     5. KEYBOARD ERGONOMICS:
        - ArrowLeft & ArrowRight are EXCLUSIVELY Doubly Linked List (.prev / .next)
        - All other keys (1-7, A/S/D/F/V, Esc, Enter) work in parallel!
     ========================================================================== */
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    // EXCLUSIVE DOUBLY LINKED LIST NAVIGATION ON LEFT / RIGHT ARROWS
    if (e.key === "ArrowRight") {
      e.preventDefault();
      stepLinearNext();
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepLinearPrev();
      return;
    }

    // Enter confirms pending speaker handoff or start if pending
    if (e.key === "Enter" && (!syncBus.state.presentationStarted || syncBus.state.pendingHandoffTo)) {
      e.preventDefault();
      quickConfirmPhaseBtn.click();
      return;
    }

    if (e.key === "Escape") {
      if (syncBus.state.activeModalId) {
        e.preventDefault();
        navigateParallel(syncBus.state.slideIndex, null, 0);
      }
      return;
    }

    const keyUpper = e.key.toUpperCase();
    const slideNum = (syncBus.state.slideIndex || 0) + 1;
    const info = SLIDE_SPEAKER_DATA[slideNum];

    // Parallel Modal / Chart Triggers (A, S, D, F, V)
    if (["A", "S", "D", "F", "V"].includes(keyUpper)) {
      const cardMatch = info.cards.find((c) => c.hotkey.toUpperCase() === keyUpper);
      if (cardMatch) {
        e.preventDefault();
        if (syncBus.state.activeModalId === cardMatch.id) {
          const mData = INTERACTIVE_MODALS[cardMatch.id];
          const tabs = (mData && mData.tabs) || [];
          const currTab = syncBus.state.activeModalTabIdx || 0;
          if (currTab < tabs.length - 1) {
            navigateParallel(syncBus.state.slideIndex, cardMatch.id, currTab + 1);
          } else {
            navigateParallel(syncBus.state.slideIndex, null, 0);
          }
        } else {
          navigateParallel(syncBus.state.slideIndex, cardMatch.id, 0);
        }
        return;
      }
    }

    // Direct Slide Jump (Keys 1 to 7)
    if (["1", "2", "3", "4", "5", "6", "7"].includes(e.key)) {
      e.preventDefault();
      navigateParallel(parseInt(e.key, 10) - 1, null, 0);
    }
  });

  syncBus.onStateChange(() => {
    renderAllControlUI();
  });

  miniPreviewIframe.addEventListener("load", () => {
    syncMiniPreview(syncBus.state);
  });

  renderAllControlUI();
});
