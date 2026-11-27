/**
 * ============================================================================
 * CASO NEXO CAMPUS TECNOLOGIA — SEMINÁRIO GRUPO 3
 * Android Master Controller App & Local Network (LAN) Presentation Logic
 * Doubly Linked List Linear Navigation + Parallel Triggers + Predictive Timers
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  const syncBus = new NexoSyncBus("controller");

  // LAN Connection Bar & Modal Elements
  const lanPrimaryUrlText = document.getElementById("lanPrimaryUrlText");
  const copyLanUrlBtn = document.getElementById("copyLanUrlBtn");
  const showLanModalBtn = document.getElementById("showLanModalBtn");
  const lanModalBackdrop = document.getElementById("lanModalBackdrop");
  const closeLanModalBtn = document.getElementById("closeLanModalBtn");
  const modalPrimaryUrl = document.getElementById("modalPrimaryUrl");
  const allDetectedUrlsList = document.getElementById("allDetectedUrlsList");
  const syncStatusPill = document.getElementById("syncStatusPill");
  const syncStatusDot = document.getElementById("syncStatusDot");
  const syncStatusText = document.getElementById("syncStatusText");

  // Timers & Handoff Elements
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

  // Cockpit Panels & Mobile Tabs
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
  const mobileTabBar = document.getElementById("mobileTabBar");

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

  /* ==========================================================================
     0. LAN SERVER INFO & LINK GENERATION UI
     ========================================================================== */
  function updateLanServerUI(info) {
    if (!info) return;
    const url = info.primaryUrl || "http://192.168.0.100:8080";
    lanPrimaryUrlText.textContent = url;
    modalPrimaryUrl.textContent = url;

    const clients = info.connectedClients || 0;
    syncStatusPill.classList.add("connected");
    syncStatusDot.textContent = clients > 0 ? "🟢" : "📡";
    syncStatusText.textContent = clients > 0
      ? `${clients} PC(s) Conectado(s) na Sala`
      : "Servidor Ativo • Abra o link no PC";

    const urls = (info.urls && info.urls.length > 0) ? info.urls : [url];
    allDetectedUrlsList.innerHTML = urls.map((u) => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-radius:8px; background:#161c2a; border:1px solid rgba(255,255,255,0.1);">
        <span style="font-family:var(--font-mono); font-size:0.95rem; font-weight:700; color:#f8fafc; user-select:all;">${u}</span>
        <button class="lan-copy-btn" data-copy-url="${u}" style="padding:4px 10px; font-size:0.76rem;">Copiar</button>
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
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const orig = btnEl.textContent;
        btnEl.textContent = "✓ Copiado!";
        setTimeout(() => { btnEl.textContent = orig; }, 1500);
      }).catch(() => fallbackCopy(text, btnEl));
    } else {
      fallbackCopy(text, btnEl);
    }
  }

  function fallbackCopy(text, btnEl) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    const orig = btnEl.textContent;
    btnEl.textContent = "✓ Copiado!";
    setTimeout(() => { btnEl.textContent = orig; }, 1500);
  }

  copyLanUrlBtn.addEventListener("click", () => {
    copyTextToClipboard(lanPrimaryUrlText.textContent, copyLanUrlBtn);
  });

  showLanModalBtn.addEventListener("click", () => {
    syncBus.vibrate(20);
    lanModalBackdrop.classList.add("open");
  });

  closeLanModalBtn.addEventListener("click", () => {
    lanModalBackdrop.classList.remove("open");
  });

  lanModalBackdrop.addEventListener("click", (e) => {
    if (e.target === lanModalBackdrop) lanModalBackdrop.classList.remove("open");
  });

  syncBus.onServerInfoChange((info) => updateLanServerUI(info));

  // Mobile Bottom Tabs Switcher
  if (mobileTabBar) {
    mobileTabBar.querySelectorAll(".mobile-tab-item").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        syncBus.vibrate(15);
        const targetId = tabBtn.getAttribute("data-target-panel");
        mobileTabBar.querySelectorAll(".mobile-tab-item").forEach((b) => b.classList.remove("active"));
        tabBtn.classList.add("active");

        document.querySelectorAll(".cockpit-panel").forEach((p) => {
          p.classList.toggle("mobile-active-panel", p.id === targetId);
        });
      });
    });
  }

  /* ==========================================================================
     1. DOUBLY LINKED LIST NAVIGATION (Ant <-> Atual <-> Prox)
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

  // Expose to Android Physical Volume Keys (Volume Up = Next Node, Volume Down = Prev Node)
  window.nexoStepNext = stepLinearNext;
  window.nexoStepPrev = stepLinearPrev;

  linearPrevNodeBtn.addEventListener("click", stepLinearPrev);
  linearNextNodeBtn.addEventListener("click", stepLinearNext);

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
     2. PARALLEL NAVIGATION (Touch / Mouse / Hotkeys) WITH LINKED LIST SYNC
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
     3. SPEAKER START & HANDOFF CONFIRMATION SYSTEM + PREDICTIVE TIMERS
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

    ctrlGeneralTime.textContent = formatSec(state.generalElapsedSec || 0);
    ctrlPredictedTotal.textContent = `(Prev ~${state.predictedTotalText || "14:00"})`;
    ctrlGeneralTimerPill.className = `timer-pill-state state-${state.generalColor || "green"}`;

    ctrlSpeakerPhaseLabel.textContent = `${phase.shortName} ↘`;
    ctrlSpeakerTime.textContent = formatSec(state.speakerRemainingSec !== undefined ? state.speakerRemainingSec : phase.budgetSec);
    ctrlSpeakerTimerPill.className = `timer-pill-state state-${state.speakerColor || "green"}`;

    if (!state.presentationStarted) {
      quickConfirmPhaseBtn.textContent = `✅ Confirmar Início: Yago (04:00)`;
    } else if (state.pendingHandoffTo && SPEAKER_PHASES[state.pendingHandoffTo]) {
      const nextP = SPEAKER_PHASES[state.pendingHandoffTo];
      quickConfirmPhaseBtn.textContent = `🔔 Confirmar: ${nextP.name} (${formatSec(nextP.budgetSec)})`;
    } else if (phase.nextPhase && SPEAKER_PHASES[phase.nextPhase]) {
      const nextP = SPEAKER_PHASES[phase.nextPhase];
      quickConfirmPhaseBtn.textContent = `🔄 Trocar p/ ${nextP.shortName} (${formatSec(nextP.budgetSec)})`;
    } else {
      quickConfirmPhaseBtn.textContent = `🔄 Reiniciar Perguntas (04:00)`;
    }

    phaseButtonsGrid.querySelectorAll("[data-confirm-phase]").forEach((btn) => {
      const pKey = btn.getAttribute("data-confirm-phase");
      btn.classList.toggle("active", state.presentationStarted && state.speakerPhase === pKey);
    });

    if (state.pendingHandoffTo && SPEAKER_PHASES[state.pendingHandoffTo]) {
      const pendingP = SPEAKER_PHASES[state.pendingHandoffTo];
      handoffConfirmBanner.style.display = "flex";
      handoffBannerTitle.textContent = `Troca para: ${pendingP.name} (${pendingP.roleLabel})`;
      handoffBannerDesc.textContent = `Toque para confirmar a entrada e reiniciar o timer decrescente para ${formatSec(pendingP.budgetSec)}.`;
      bannerConfirmBtn.textContent = `✅ Confirmar ${pendingP.shortName} (${formatSec(pendingP.budgetSec)})`;
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
        🟢 <strong>JANELA ABERTA NO PC DA SALA:</strong> ${mData.title}
        ${activeTabLabel ? `<br><span style="font-size:0.82rem; color:#22d3ee;">↳ Aba: ${activeTabLabel}</span>` : ""}
      `;
      closeRemoteModalBtn.style.display = "inline-flex";
    } else {
      liveModalStatusBanner.style.borderColor = "rgba(255,255,255,0.12)";
      liveModalStatusBanner.style.background = "#0f131d";
      liveModalStatusBanner.innerHTML = `📺 Tela do PC mostrando: <strong>Slide 0${slideNum} Limpo (Visão Geral)</strong>`;
      closeRemoteModalBtn.style.display = "none";
    }

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
            ${isActive ? "🟢 EXIBINDO NO PC DA SALA" : "JANELA & GRÁFICO"}
          </span>
          <span class="hotkey-pill">Atalho ${cardInfo.hotkey}</span>
        </div>
        <button class="trigger-main-btn" data-toggle-modal="${cardInfo.id}">
          <span style="text-align:left;">${cardInfo.label}</span>
          <span>${isActive ? "✕ Fechar" : "📺 Projetar"}</span>
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

  // Keyboard Ergonomics (when used with external clicker/keyboard)
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

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
