/**
 * Reusable first-run / replayable guided tour.
 * Pass mode-specific `steps` + `storageKey` from the host page.
 */

export const PLATEAU_TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: '札幌を自由に歩けます',
    body: 'この画面は、国交省 Project PLATEAU の実在都市データでつくった札幌の3Dマップです。まずはカメラ操作から始めましょう。',
    hint: '約30秒の短いガイドです',
    target: null,
    place: 'center',
  },
  {
    id: 'camera',
    title: 'カメラの動かし方',
    body: '左ドラッグで回転、ホイールでズーム、右ドラッグ（または二本指）で平行移動します。街の上をドローンのように飛べます。',
    hint: '地図をドラッグしてみてください',
    target: null,
    place: 'bottom',
  },
  {
    id: 'menu',
    title: 'メニューは左上の ☰',
    body: '普段は地図を広く見せるため、操作ボタンは隠してあります。左上の ☰ を押すと「移動・表示・大気」などが開きます。',
    hint: '☰ を一度押してみましょう',
    target: '#btn-ui-toggle',
    place: 'below',
    openChrome: true,
  },
  {
    id: 'move',
    title: '行きたい場所へジャンプ',
    body: '「移動」から札幌の10区や現在地へカメラを飛ばせます。気になるエリアを選んで周囲を見てみましょう。',
    hint: 'メニュー内の「移動」',
    target: '#ui-chrome',
    place: 'below',
    openChrome: true,
  },
  {
    id: 'rail',
    title: '地下鉄・JRの駅へ行く',
    body: '「🚆 路線」を開くと、右下に駅一覧パネルが出ます。駅名を選ぶか、地図上の駅名バッジをクリックすると、その駅へカメラが移動します。地下駅は透視表示に切り替わります。',
    hint: '右下の路線パネルと駅一覧',
    target: '#btn-rail-panel',
    targets: ['#btn-rail-panel', '#rail-panel'],
    place: 'left',
    openChrome: true,
    openRail: true,
  },
  {
    id: 'visitor',
    title: '観光・トイレ・Wi-Fi',
    body: '「📍 案内」では札幌市オープンデータの観光スポット、公園トイレ、公衆Wi-Fiを地図上に表示できます。一覧やピンからその場所へ飛べます。',
    hint: '右下の案内パネル',
    target: '#btn-visitor-panel',
    targets: ['#btn-visitor-panel', '#visitor-panel'],
    place: 'left',
    openChrome: true,
    openVisitor: true,
  },
  {
    id: 'look',
    title: '見た目を変える',
    body: '「表示」で LOD・地図（航空写真など）・質感を、「大気」で昼夜・季節・天候を切り替えられます。下部のスライダーは降水の強さです。',
    hint: '表示 / 大気',
    target: '#ui-chrome',
    place: 'below',
    openChrome: true,
  },
  {
    id: 'done',
    title: '準備完了',
    body: 'あとは好きな場所を探検してください。ガイドはメニューの「？」からいつでもやり直せます。雪まつりのシネマ演出は「雪まつり版」へどうぞ。',
    hint: '楽しんでください',
    target: null,
    place: 'center',
  },
];

export const FESTIVAL_TUTORIAL_STEPS = [
  {
    id: 'welcome',
    title: '雪まつりのシネマ体験',
    body: 'ここは札幌雪まつりをイメージした3Dシネマモードです。カメラが自動で見どころを巡ります。まずは画面上部のショットから始めましょう。',
    hint: '約30秒の短いガイドです',
    target: '#shot-bar',
    place: 'below',
  },
  {
    id: 'shots',
    title: 'ショットで場面を選ぶ',
    body: '「大雪像・城」「テレビ塔」などのボタンを押すと、その場面のカメラワークに切り替わります。下部の再生バーで一時停止やシークもできます。',
    hint: '上部の番号付きショット',
    target: '#shot-bar',
    place: 'below',
  },
  {
    id: 'transport',
    title: '再生とタイムライン',
    body: '左下の「一時停止 / 再生」とスライダーで、シネマの進行をコントロールできます。雪の量も右下のスライダーで調整できます。',
    hint: '画面下部のコントロール',
    target: '#btn-play',
    targets: ['#btn-play', '#timeline'],
    place: 'bottom',
  },
  {
    id: 'camera',
    title: '自由に飛びたいとき',
    body: '画面をドラッグするか「自由ドローン」を押すと、自分でカメラを操作できます。もう一度「シネマ自動」に戻すと演出が再開します。',
    hint: 'シネマ自動 / 自由ドローン',
    target: '#btn-cam',
    place: 'below',
  },
  {
    id: 'look',
    title: '演出を変える',
    body: '「マッピング」で雪像の投影をON/OFF、「トワイライト」ボタンで時間帯を変えられます。全画面や録画も右下にあります。',
    hint: 'マッピング / 時間帯',
    target: '#btn-proj',
    targets: ['#btn-proj', '#btn-time'],
    place: 'below',
  },
  {
    id: 'plateau',
    title: '実在の札幌へ',
    body: '右上の「PLATEAU実寸マップ」から、本物の都市データで札幌全市を自由飛行できます。地下鉄・JRの駅にも行けます。',
    hint: 'PLATEAU実寸マップへ',
    target: '#link-plateau',
    place: 'below',
  },
  {
    id: 'done',
    title: '準備完了',
    body: 'ショットを選んで雪まつりの雰囲気を楽しんでください。ガイドは右上の「？」からいつでもやり直せます。',
    hint: '楽しんでください',
    target: null,
    place: 'center',
  },
];

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
}

/**
 * @param {{
 *   steps?: typeof PLATEAU_TUTORIAL_STEPS,
 *   storageKey?: string,
 *   deferAutoStart?: boolean,
 *   setUiChromeOpen?: (open: boolean) => void,
 *   openRailPanel?: (open: boolean) => void,
 *   openVisitorPanel?: (open: boolean) => void,
 * }} api
 */
export function initTutorial(api = {}) {
  const root = document.getElementById('tutorial-root');
  if (!root) return { open() {}, isOpen: () => false, startIfNeeded() {}, hasCompleted: () => true };

  const STEPS = api.steps || PLATEAU_TUTORIAL_STEPS;
  const STORAGE_KEY = api.storageKey || 'plateau-tutorial-v2-done';

  const card = root.querySelector('.tutorial-card');
  const titleEl = root.querySelector('[data-tut-title]');
  const bodyEl = root.querySelector('[data-tut-body]');
  const hintEl = root.querySelector('[data-tut-hint]');
  const stepEl = root.querySelector('[data-tut-step]');
  const spotlights = Array.from(root.querySelectorAll('[data-tut-spot]'));
  const btnNext = root.querySelector('[data-tut-next]');
  const btnPrev = root.querySelector('[data-tut-prev]');
  const btnSkip = root.querySelector('[data-tut-skip]');

  let stepIndex = 0;
  let open = false;
  let highlightTimer = 0;

  function markDone() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  function hasCompleted() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function clearHighlight() {
    document.querySelectorAll('.tutorial-pulse').forEach(el => el.classList.remove('tutorial-pulse'));
    for (const spot of spotlights) {
      spot.style.opacity = '0';
      spot.style.width = '0';
      spot.style.height = '0';
    }
  }

  function placeCard(place) {
    card.classList.remove('place-center', 'place-bottom', 'place-below', 'place-left');
    card.classList.add(`place-${place || 'center'}`);
  }

  function fitSpotlight(spot, el, { round = false, pad = 8 } = {}) {
    if (!spot || !el || el.classList.contains('hidden')) {
      if (spot) spot.style.opacity = '0';
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      spot.style.opacity = '0';
      return false;
    }

    el.classList.add('tutorial-pulse');
    const w = rect.width + pad * 2;
    const h = rect.height + pad * 2;
    spot.style.opacity = '1';
    spot.style.width = `${w}px`;
    spot.style.height = `${h}px`;
    spot.style.left = `${rect.left - pad}px`;
    spot.style.top = `${rect.top - pad}px`;
    spot.style.borderRadius = round ? '999px' : '12px';
    return true;
  }

  function rectLooksCompact(el) {
    const r = el.getBoundingClientRect();
    return r.height <= 42 && r.width <= 160;
  }

  function highlight(step) {
    clearHighlight();
    if (!step) return;

    const selectors = (step.targets && step.targets.length)
      ? step.targets
      : (step.target ? [step.target] : []);

    const multi = selectors.length > 1;
    spotlights.forEach((spot, i) => {
      spot.classList.toggle('secondary', multi || i > 0);
    });

    selectors.forEach((selector, i) => {
      const spot = spotlights[i];
      const el = document.querySelector(selector);
      if (!spot || !el) return;
      const round = selector === '#btn-ui-toggle'
        || selector === '#btn-rail-panel'
        || selector === '#btn-visitor-panel'
        || selector === '#btn-guide'
        || (el.classList.contains('chip') && rectLooksCompact(el));
      fitSpotlight(spot, el, {
        round: Boolean(round),
        pad: selector === '#rail-panel' || selector === '#visitor-panel' || selector === '#shot-bar' ? 10 : 8,
      });
    });
  }

  function scheduleHighlight(step) {
    window.clearTimeout(highlightTimer);
    const delay = (step?.openRail || step?.openVisitor) ? 80 : 0;
    highlightTimer = window.setTimeout(() => {
      requestAnimationFrame(() => highlight(step));
    }, delay);
  }

  function render() {
    const step = STEPS[stepIndex];
    if (!step) return;

    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    hintEl.textContent = step.hint || '';
    stepEl.textContent = `${stepIndex + 1} / ${STEPS.length}`;

    btnPrev.disabled = stepIndex === 0;
    btnNext.textContent = stepIndex === STEPS.length - 1 ? 'はじめる' : '次へ';

    placeCard(step.place);

    if (step.openChrome) api.setUiChromeOpen?.(true);
    else if (stepIndex <= 1) api.setUiChromeOpen?.(false);

    if (step.openRail) api.openRailPanel?.(true);
    else if (step.id !== 'rail') api.openRailPanel?.(false);

    if (step.openVisitor) api.openVisitorPanel?.(true);
    else if (step.id !== 'visitor') api.openVisitorPanel?.(false);

    scheduleHighlight(step);
  }

  function show(startIndex = 0) {
    open = true;
    stepIndex = Math.max(0, Math.min(STEPS.length - 1, startIndex));
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    render();
  }

  function hide(completed) {
    open = false;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    clearHighlight();
    api.setUiChromeOpen?.(false);
    api.openRailPanel?.(false);
    api.openVisitorPanel?.(false);
    if (completed) markDone();
  }

  btnNext?.addEventListener('click', ev => {
    ev.stopPropagation();
    if (stepIndex >= STEPS.length - 1) {
      hide(true);
      return;
    }
    stepIndex += 1;
    render();
  });

  btnPrev?.addEventListener('click', ev => {
    ev.stopPropagation();
    if (stepIndex <= 0) return;
    stepIndex -= 1;
    render();
  });

  btnSkip?.addEventListener('click', ev => {
    ev.stopPropagation();
    hide(true);
  });

  root.addEventListener('click', ev => {
    if (ev.target === root.querySelector('.tutorial-backdrop')) {
      ev.stopPropagation();
    }
  });

  window.addEventListener('resize', () => {
    if (open) scheduleHighlight(STEPS[stepIndex]);
  });

  function startIfNeeded(delayMs) {
    if (hasCompleted() || open) return;
    const wait = delayMs ?? (prefersReducedMotion() ? 200 : 600);
    window.setTimeout(() => {
      if (!open && !hasCompleted()) show(0);
    }, wait);
  }

  if (!api.deferAutoStart && !hasCompleted()) {
    startIfNeeded();
  }

  return {
    open: () => show(0),
    isOpen: () => open,
    hasCompleted,
    startIfNeeded,
  };
}
