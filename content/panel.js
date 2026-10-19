// Googleカレンダーの全ページに常駐する、空き時間を集めてコピーするための小さなフローティングパネル。
//
// 使い方:
//   1. カレンダー上で空いている時間をドラッグ選択する(予定作成のポップアップが出る操作と同じ)
//   2. パネルの「＋ 選択中の時間を追加」を押す → ポップアップのテキストから日付・時間帯を読み取り一覧に追加
//   3. 好きな件数集めたら「コピー」でクリップボードへ箇条書きテキストをコピー
//
// GoogleカレンダーのDOM構造・クラス名は予告なく変わるため、
// 個々の予定チップのaria-label解析には依存せず、
// 「ドラッグ選択した直後に出る、日付+時間帯を含む小さなポップアップ要素」だけを
// その場で1回スキャンする設計にしている(詳細はdetectSelection関数を参照)。

(function () {
  "use strict";

  const HOST_ID = "gcal-slot-copier-host";
  if (document.getElementById(HOST_ID)) return; // 二重注入防止

  const STORAGE_KEY_SLOTS = "gcalSlotCopier.slots";
  const STORAGE_KEY_COLLAPSED = "gcalSlotCopier.collapsed";

  const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  /** {start, end} (ISO文字列) を「・8/18(火) 10:00〜11:00」の形式に整形する(一覧表示用) */
  function formatBullet(slot) {
    const s = new Date(slot.start);
    const e = new Date(slot.end);
    return `・${formatDateLabel(s)} ${formatTimeRange(slot)}`;
  }

  /** Dateを「8/18(火)」の形式に整形する */
  function formatDateLabel(date) {
    const w = WEEKDAY_JA[date.getDay()];
    return `${date.getMonth() + 1}/${date.getDate()}(${w})`;
  }

  /** {start, end} (ISO文字列) を「10:00〜11:00」の形式に整形する */
  function formatTimeRange(slot) {
    const s = new Date(slot.start);
    const e = new Date(slot.end);
    return `${pad2(s.getHours())}:${pad2(s.getMinutes())}〜${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
  }

  /**
   * コピー用テキストを組み立てる。同じ日付の枠は1行にまとめ、時間帯を「、」で区切る。
   * 例: ・8/18(火) 10:00〜11:00、14:00〜15:00
   */
  function buildCopyText(slotList) {
    const sorted = [...slotList].sort((a, b) => new Date(a.start) - new Date(b.start));
    const groups = [];
    for (const slot of sorted) {
      const d = new Date(slot.start);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.key === key) {
        lastGroup.slots.push(slot);
      } else {
        groups.push({ key, date: d, slots: [slot] });
      }
    }
    return groups
      .map((g) => `・${formatDateLabel(g.date)} ${g.slots.map(formatTimeRange).join("、")}`)
      .join("\n");
  }

  /** 月日から、今日に一番近い年を推定してDateを作る(年またぎの誤判定を防ぐ) */
  function buildYearAwareDate(month, date) {
    const today = new Date();
    const candidates = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];
    let best = null;
    let bestDiff = Infinity;
    for (const y of candidates) {
      const d = new Date(y, month - 1, date);
      const diff = Math.abs(d.getTime() - today.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        best = d;
      }
    }
    return best;
  }

  function to24Hour(hour, meridiem) {
    if (meridiem === "午後" && hour < 12) return hour + 12;
    if (meridiem === "午前" && hour === 12) return 0;
    return hour;
  }

  // 例: "8月18日" / "8月18日(火)" などにマッチ
  const DATE_PATTERN = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
  // 例: "10:00〜11:00" / "午前10:00～11:00" / "10:00 - 11:00" などにマッチ
  // 区切り文字は波ダッシュ(〜)・全角チルダ(～)・半角チルダ・ハイフン・各種ダッシュを許容
  const TIME_RANGE_PATTERN =
    /(午前|午後)?\s*(\d{1,2}):(\d{2})\s*[〜～~\-–—]\s*(午前|午後)?\s*(\d{1,2}):(\d{2})/;

  const MAX_CANDIDATE_TEXT_LENGTH = 300;

  /** 「ドラッグ選択直後に出る小さなポップアップ」らしき要素を集める */
  function findCandidateOverlayElements() {
    const candidates = new Set();

    document.querySelectorAll('[role="dialog"]').forEach((el) => candidates.add(el));

    // フォールバック: body直下にある「ポップアップサイズ」の要素も候補にする
    // (Googleの予定作成ポップアップがrole="dialog"を持たない場合に備える)
    Array.from(document.body.children).forEach((el) => {
      if (el.id === HOST_ID) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 500 && rect.height > 0 && rect.height < 500) {
        candidates.add(el);
      }
    });

    return Array.from(candidates);
  }

  /**
   * 候補要素の中から「日付+時間帯」を両方含む、短いテキストの要素を探す。
   * 見つかれば {start, end} (ISO文字列) を、見つからなければ null を返す。
   */
  function detectSelection() {
    const candidates = findCandidateOverlayElements();

    for (const el of candidates) {
      const text = el.innerText || "";
      if (!text || text.length > MAX_CANDIDATE_TEXT_LENGTH) continue;

      const dateMatch = text.match(DATE_PATTERN);
      const timeMatch = text.match(TIME_RANGE_PATTERN);
      if (!dateMatch || !timeMatch) continue;

      const day = buildYearAwareDate(parseInt(dateMatch[1], 10), parseInt(dateMatch[2], 10));
      const startMeridiem = timeMatch[1];
      // 終了側に午前/午後が書かれていない("午後1:00〜2:00"等)場合は開始側と同じとみなす
      const endMeridiem = timeMatch[4] || startMeridiem;
      const startHour = to24Hour(parseInt(timeMatch[2], 10), startMeridiem);
      const startMin = parseInt(timeMatch[3], 10);
      const endHour = to24Hour(parseInt(timeMatch[5], 10), endMeridiem);
      const endMin = parseInt(timeMatch[6], 10);

      const start = new Date(day);
      start.setHours(startHour, startMin, 0, 0);
      const end = new Date(day);
      end.setHours(endHour, endMin, 0, 0);
      if (end <= start) continue;

      return { start: start.toISOString(), end: end.toISOString() };
    }

    return null;
  }

  // ---- Shadow DOM でパネルを構築(ページ本体のCSSの影響を受けないようにする) ----
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  host.style.bottom = "16px";
  host.style.right = "87px";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; }
      .panel {
        width: 280px;
        background: #fff;
        border: 1px solid #dadce0;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,.2);
        overflow: hidden;
        font-size: 13px;
        color: #202124;
        transition: opacity .15s;
      }
      .panel.collapsed .body { display: none; }
      .panel.collapsed { opacity: .5; }
      .panel.collapsed:hover { opacity: 1; }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #039be5;
        color: #fff;
        padding: 8px 10px;
        cursor: pointer;
        user-select: none;
      }
      .header .title { font-weight: bold; font-size: 13px; }
      .header .count { font-weight: normal; opacity: .85; margin-left: 4px; }
      .header button {
        background: transparent;
        border: none;
        color: #fff;
        cursor: pointer;
        font-size: 14px;
        padding: 0 4px;
      }
      .body { padding: 10px; }
      button.primary {
        background: #039be5;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        width: 100%;
      }
      button.primary:disabled { background: #c7c7c7; cursor: default; }
      button.secondary {
        background: #f1f3f4;
        color: #202124;
        border: none;
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .hint { color: #666; font-size: 11px; margin: 6px 0; }
      .error { color: #d93025; font-size: 11px; margin: 6px 0; }
      ul#slot-list { list-style: none; padding: 0; margin: 8px 0; max-height: 160px; overflow-y: auto; }
      ul#slot-list li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px solid #f1f3f4;
        font-size: 12px;
      }
      ul#slot-list li button {
        background: transparent;
        border: none;
        color: #d93025;
        cursor: pointer;
        font-size: 13px;
      }
      .empty-note { color: #999; font-size: 11px; padding: 4px 0; }
      .actions { display: flex; gap: 6px; margin-top: 8px; }
      .actions button { flex: 1; }
      .toast { margin-top: 6px; color: #188038; font-size: 11px; }
    </style>
    <div class="panel" id="panel">
      <div class="header" id="header">
        <span class="title">🕓 空き時間コピーくん<span class="count" id="count-label"></span></span>
        <button id="toggle-btn" title="最小化/展開">▁</button>
      </div>
      <div class="body">
        <button id="auto-add-btn" class="primary">＋ 選択中の時間を追加</button>
        <p class="hint">カレンダー上で空いている時間をドラッグして選択してから押してください</p>
        <p id="detect-error" class="error" hidden></p>

        <ul id="slot-list"></ul>
        <p id="empty-note" class="empty-note">まだ追加された時間帯はありません</p>

        <div class="actions">
          <button id="copy-btn" class="primary" disabled>コピー</button>
          <button id="clear-btn" class="secondary" disabled>クリア</button>
        </div>
        <p id="toast" class="toast" hidden></p>
      </div>
    </div>
  `;

  const panelEl = shadow.getElementById("panel");
  const headerEl = shadow.getElementById("header");
  const countLabelEl = shadow.getElementById("count-label");
  const toggleBtn = shadow.getElementById("toggle-btn");
  const autoAddBtn = shadow.getElementById("auto-add-btn");
  const detectErrorEl = shadow.getElementById("detect-error");
  const listEl = shadow.getElementById("slot-list");
  const emptyNoteEl = shadow.getElementById("empty-note");
  const copyBtn = shadow.getElementById("copy-btn");
  const clearBtn = shadow.getElementById("clear-btn");
  const toastEl = shadow.getElementById("toast");

  /** @type {{id: string, start: string, end: string}[]} */
  let slots = [];
  let contextInvalidated = false;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    setTimeout(() => {
      toastEl.hidden = true;
    }, 2000);
  }

  /**
   * 拡張機能を再読み込み/更新した後も、このタブに古いバージョンのスクリプトが残っていると
   * chrome.* API呼び出しが "Extension context invalidated" で失敗するようになる。
   * この状態を検知したら未捕捉エラーを出さず、ページ再読み込みを促すメッセージに置き換える。
   */
  function isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function handleContextInvalidated() {
    if (contextInvalidated) return;
    contextInvalidated = true;
    panelEl.classList.remove("collapsed");
    const body = shadow.querySelector(".body");
    if (body) {
      body.innerHTML =
        '<p class="error">拡張機能が更新されました。このページを再読み込みしてください。</p>';
    }
  }

  function persist() {
    if (!isExtensionContextValid()) {
      handleContextInvalidated();
      return;
    }
    try {
      chrome.storage.local.set({ [STORAGE_KEY_SLOTS]: slots });
    } catch (e) {
      handleContextInvalidated();
    }
  }

  function sortedSlots() {
    return [...slots].sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  function render() {
    listEl.innerHTML = "";
    const sorted = sortedSlots();

    for (const slot of sorted) {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.textContent = formatBullet(slot);
      const delBtn = document.createElement("button");
      delBtn.textContent = "×";
      delBtn.title = "削除";
      delBtn.addEventListener("click", () => {
        slots = slots.filter((s) => s.id !== slot.id);
        persist();
        render();
      });
      li.appendChild(span);
      li.appendChild(delBtn);
      listEl.appendChild(li);
    }

    const hasSlots = slots.length > 0;
    copyBtn.disabled = !hasSlots;
    clearBtn.disabled = !hasSlots;
    emptyNoteEl.hidden = hasSlots;
    countLabelEl.textContent = hasSlots ? `(${slots.length})` : "";
  }

  function addSlot(start, end) {
    slots.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      start,
      end,
    });
    persist();
    render();
    showToast("追加しました");
  }

  autoAddBtn.addEventListener("click", () => {
    detectErrorEl.hidden = true;
    const detected = detectSelection();
    if (!detected) {
      detectErrorEl.textContent =
        "選択中の時間帯が見つかりませんでした。カレンダー上でドラッグして予定作成ポップアップを表示してから、もう一度押してください。";
      detectErrorEl.hidden = false;
      return;
    }
    addSlot(detected.start, detected.end);
  });

  copyBtn.addEventListener("click", async () => {
    const text = buildCopyText(slots);
    try {
      await navigator.clipboard.writeText(text);
      showToast("コピーしました");
    } catch (e) {
      // フォールバック: 一時的なtextareaを使ったコピー
      const ta = document.createElement("textarea");
      ta.value = text;
      shadow.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast("コピーしました");
      } catch (e2) {
        showToast("コピーに失敗しました");
      }
      ta.remove();
    }
  });

  clearBtn.addEventListener("click", () => {
    slots = [];
    persist();
    render();
  });

  function setCollapsed(collapsed) {
    panelEl.classList.toggle("collapsed", collapsed);
    toggleBtn.textContent = collapsed ? "▔" : "▁";
    if (!isExtensionContextValid()) {
      handleContextInvalidated();
      return;
    }
    try {
      chrome.storage.local.set({ [STORAGE_KEY_COLLAPSED]: collapsed });
    } catch (e) {
      handleContextInvalidated();
    }
  }

  headerEl.addEventListener("click", (e) => {
    if (e.target === toggleBtn) return;
    setCollapsed(!panelEl.classList.contains("collapsed"));
  });
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setCollapsed(!panelEl.classList.contains("collapsed"));
  });

  // 保存済みの状態を復元(ページ再読み込みをまたいで一覧を保持する)
  // 初回(未保存)はデフォルトで最小化しておく。一度でも展開した場合はその状態を記憶する。
  try {
    chrome.storage.local.get([STORAGE_KEY_SLOTS, STORAGE_KEY_COLLAPSED], (result) => {
      if (chrome.runtime.lastError) {
        handleContextInvalidated();
        return;
      }
      if (Array.isArray(result[STORAGE_KEY_SLOTS])) {
        slots = result[STORAGE_KEY_SLOTS];
      }
      render();
      if (result[STORAGE_KEY_COLLAPSED] !== false) {
        setCollapsed(true);
      }
    });
  } catch (e) {
    handleContextInvalidated();
  }

  // 拡張アイコンのクリックで表示/最小化を切り替える
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === "GCAL_SLOT_COPIER_TOGGLE_PANEL") {
        setCollapsed(!panelEl.classList.contains("collapsed"));
      }
    });
  } catch (e) {
    // リスナー登録自体が失敗するケースは稀だが、念のため無視する
  }
})();
