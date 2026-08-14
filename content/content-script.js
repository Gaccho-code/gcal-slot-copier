// Googleカレンダーの週表示ページに一時的に注入されるスキャナ。
// 常駐はせず、popup からの chrome.scripting.executeScript 呼び出しのたびに実行される。
// window.__gcalSlotCopierScan() を定義し、popup 側は続けてこれを呼び出して結果を取得する。
//
// 注意: GoogleカレンダーのDOM/クラス名は予告なく変わる。
// そのため取得したい情報ごとに複数のセレクタ候補を用意し、role/aria-* を優先して使う。

(function () {
  /** 候補セレクタを順に試し、最初にヒット(1件以上)したものを返す */
  function queryAllFallback(selectors, root) {
    root = root || document;
    for (const sel of selectors) {
      try {
        const nodes = root.querySelectorAll(sel);
        if (nodes.length > 0) {
          return { nodes: Array.from(nodes), matchedSelector: sel };
        }
      } catch (e) {
        // 不正なセレクタは無視して次の候補へ
      }
    }
    return { nodes: [], matchedSelector: null };
  }

  var HEADER_SELECTORS = [
    '[role="columnheader"][aria-label]',
    '[role="grid"] [role="columnheader"]',
  ];

  var EVENT_CHIP_SELECTORS = [
    '[data-eventid][role="button"][aria-label]',
    '[role="button"][data-eventchip][aria-label]',
    '[role="gridcell"] [role="button"][aria-label]',
  ];

  // 日本語ロケール想定: "8月18日火曜日" 等
  var HEADER_PATTERN_JA = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
  // 英語ロケール想定: "Tue, Aug 18" 等
  var HEADER_PATTERN_EN = /([A-Za-z]{3,9})\s+(\d{1,2})/;
  var EN_MONTHS = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];

  /** ページ上の月表示("2026年8月"等)から年を推定。見つからなければ null */
  function detectYearFromPage() {
    var text = document.title + " " + document.body.innerText.slice(0, 2000);
    var m = text.match(/(\d{4})\s*年/);
    if (m) return parseInt(m[1], 10);
    return null;
  }

  /** ヘッダのラベル文字列から Date(年月日のみ、時刻は00:00)を作る */
  function parseHeaderDateLabel(label, baseYear) {
    if (!label) return null;

    var mJa = label.match(HEADER_PATTERN_JA);
    if (mJa) {
      var month = parseInt(mJa[1], 10);
      var date = parseInt(mJa[2], 10);
      return buildYearAwareDate(baseYear, month, date);
    }

    var mEn = label.match(HEADER_PATTERN_EN);
    if (mEn) {
      var monthIdx = EN_MONTHS.indexOf(mEn[1].slice(0, 3).toLowerCase());
      if (monthIdx >= 0) {
        return buildYearAwareDate(baseYear, monthIdx + 1, parseInt(mEn[2], 10));
      }
    }
    return null;
  }

  /** 年またぎ(12月→1月など)を今日の日付との近さで補正しつつ Date を作る */
  function buildYearAwareDate(baseYear, month, date) {
    var today = new Date();
    var candidates = [baseYear - 1, baseYear, baseYear + 1];
    var best = null;
    var bestDiff = Infinity;
    for (const y of candidates) {
      var d = new Date(y, month - 1, date);
      var diff = Math.abs(d.getTime() - today.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        best = d;
      }
    }
    return best;
  }

  /** 週の日付一覧を取得する */
  function scanWeekDays() {
    var found = queryAllFallback(HEADER_SELECTORS);
    if (found.nodes.length === 0) {
      return { error: "HEADER_NOT_FOUND" };
    }

    var baseYear = detectYearFromPage();
    if (baseYear == null) baseYear = new Date().getFullYear();

    var days = [];
    for (const h of found.nodes) {
      var label = h.getAttribute("aria-label") || h.textContent;
      var parsed = parseHeaderDateLabel(label, baseYear);
      if (parsed) days.push(parsed);
    }

    if (days.length === 0) {
      return { error: "HEADER_PARSE_FAILED" };
    }
    return { days: days };
  }

  // 例: "打ち合わせ、8月18日 午前10:00～11:00" のような aria-label を想定
  // 区切り文字は「〜」(波ダッシュ U+301C) と「～」(全角チルダ U+FF5E) の
  // どちらも実際のUIで使われうるため両方許容する
  var EVENT_LABEL_PATTERN =
    /(\d{1,2})\s*月\s*(\d{1,2})\s*日.*?(午前|午後)?\s*(\d{1,2}):(\d{2})\s*[〜～~\-–]\s*(午前|午後)?\s*(\d{1,2}):(\d{2})/;

  function to24Hour(hour, meridiem) {
    if (meridiem === "午後" && hour < 12) return hour + 12;
    if (meridiem === "午前" && hour === 12) return 0;
    return hour;
  }

  /** イベントチップの aria-label から {date, start, end} を抽出する */
  function parseEventLabel(label, baseYear) {
    var m = label.match(EVENT_LABEL_PATTERN);
    if (!m) return null;

    var month = parseInt(m[1], 10);
    var date = parseInt(m[2], 10);
    var day = buildYearAwareDate(baseYear, month, date);

    var startHour = to24Hour(parseInt(m[4], 10), m[3]);
    var startMin = parseInt(m[5], 10);
    var endHour = to24Hour(parseInt(m[7], 10), m[6]);
    var endMin = parseInt(m[8], 10);

    var start = new Date(day);
    start.setHours(startHour, startMin, 0, 0);
    var end = new Date(day);
    end.setHours(endHour, endMin, 0, 0);
    // 終了が開始より前(日またぎ表記など)は解析対象外にする
    if (end <= start) return null;

    return { date: day, start: start, end: end };
  }

  /**
   * aria-label解析に失敗した場合の最終フォールバック。
   * グリッドの「1時間あたりのpx高さ」を、当日列の columnheader からの相対位置で概算し、
   * イベントチップの bounding rect から開始・終了時刻を推定する。
   * 概算値のため、失敗したら諦めて null を返す(致命的エラーにはしない)。
   */
  function parseFromPixelPosition() {
    // 現行のGoogleカレンダーDOMから安定して基準線(始業時刻の行など)を
    // 取得する一般的な方法が確認できなかったため、v0.1では未実装。
    // aria-label解析で拾えなかったイベントは unparsedCount としてカウントし、
    // popup側で注意メッセージを表示するに留める。
    return null;
  }

  /** 予定(busy区間)一覧を取得する */
  function scanBusyEvents(baseYear) {
    var found = queryAllFallback(EVENT_CHIP_SELECTORS);
    var busyIntervals = [];
    var unparsedCount = 0;

    for (const chip of found.nodes) {
      var label = chip.getAttribute("aria-label") || "";
      if (!label) continue;
      if (/終日/.test(label) || /all[ -]?day/i.test(label)) continue;

      var parsed = parseEventLabel(label, baseYear);
      if (parsed) {
        busyIntervals.push(parsed);
      } else {
        var fallback = parseFromPixelPosition(chip);
        if (fallback) {
          busyIntervals.push(fallback);
        } else {
          unparsedCount++;
        }
      }
    }

    return { busyIntervals: busyIntervals, totalChips: found.nodes.length, unparsedCount: unparsedCount };
  }

  window.__gcalSlotCopierScan = function () {
    try {
      var weekResult = scanWeekDays();
      if (weekResult.error) return { error: weekResult.error };

      var baseYear = weekResult.days[0].getFullYear();
      var busyResult = scanBusyEvents(baseYear);

      return {
        days: weekResult.days.map(function (d) { return d.toISOString(); }),
        busyIntervals: busyResult.busyIntervals.map(function (b) {
          return {
            date: b.date.toISOString(),
            start: b.start.toISOString(),
            end: b.end.toISOString(),
          };
        }),
        unparsedCount: busyResult.unparsedCount,
      };
    } catch (e) {
      console.error("[gcal-slot-copier] scan failed", e);
      return { error: "SCAN_EXCEPTION" };
    }
  };
})();
