// 「営業時間 − 予定占有時間」の区間演算で空き枠を求める

import { MAX_SUGGESTIONS } from "./constants.js";
import { isSameDate, isWeekend, setTime, roundUpTo, maxDate } from "./time-utils.js";

/**
 * busy区間を [clipStart, clipEnd] の範囲内に切り詰める。範囲外なら null。
 */
function clipInterval(interval, clipStart, clipEnd) {
  const start = maxDate(interval.start, clipStart);
  const end = interval.end < clipEnd ? interval.end : clipEnd;
  if (start >= end) return null;
  return { start, end };
}

/** 時系列でソート済みの区間群を、重なり・隣接しているものだけマージする */
function mergeOverlappingIntervals(sortedIntervals) {
  const merged = [];
  for (const cur of sortedIntervals) {
    const last = merged[merged.length - 1];
    if (last && cur.start <= last.end) {
      last.end = maxDate(last.end, cur.end);
    } else {
      merged.push({ start: cur.start, end: cur.end });
    }
  }
  return merged;
}

function pushIfLongEnough(list, day, start, end, minDurationMin) {
  if ((end - start) / 60000 >= minDurationMin) {
    list.push({ date: day, start, end });
  }
}

/**
 * @param {Date[]} days 週表示で検出した日付一覧
 * @param {{date:Date, start:Date, end:Date}[]} busyIntervals 検出した予定
 * @param {{startHour:number, endHour:number, minDurationMin:number, weekdaysOnly:boolean}} options
 * @returns {{date:Date, start:Date, end:Date}[]} 空き枠(最大 MAX_SUGGESTIONS 件、時系列順)
 */
export function computeFreeSlots(days, busyIntervals, options) {
  const { startHour, endHour, minDurationMin, weekdaysOnly } = options;
  const now = new Date();
  const candidates = [];

  for (const day of days) {
    if (weekdaysOnly && isWeekend(day)) continue;

    let windowStart = setTime(day, startHour, 0);
    const windowEnd = setTime(day, endHour, 0);

    // 今日の場合、既に過ぎた時間帯は候補から除外する
    if (isSameDate(day, now) && now > windowStart) {
      windowStart = roundUpTo(now, 30);
    }
    if (windowStart >= windowEnd) continue;

    const busyToday = busyIntervals
      .filter((b) => isSameDate(b.date, day))
      .map((b) => clipInterval(b, windowStart, windowEnd))
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
    const merged = mergeOverlappingIntervals(busyToday);

    let cursor = windowStart;
    for (const busy of merged) {
      if (busy.start > cursor) {
        pushIfLongEnough(candidates, day, cursor, busy.start, minDurationMin);
      }
      cursor = maxDate(cursor, busy.end);
    }
    if (cursor < windowEnd) {
      pushIfLongEnough(candidates, day, cursor, windowEnd, minDurationMin);
    }
  }

  candidates.sort((a, b) => a.start - b.start);
  return candidates.slice(0, MAX_SUGGESTIONS);
}
