// 日時のパース・整形まわりの小さなヘルパー群

export const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** 0埋め2桁 */
function pad2(n) {
  return String(n).padStart(2, "0");
}

/** 同じ日付(年月日)かどうか */
export function isSameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 土日判定 */
export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** base の年月日はそのままに、時刻だけを差し替えた新しい Date を返す */
export function setTime(base, hour, minute) {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** date を stepMin 分単位で切り上げる */
export function roundUpTo(date, stepMin) {
  const ms = stepMin * 60000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

export function maxDate(a, b) {
  return a > b ? a : b;
}

/**
 * 空き枠1件を「・8/18(火) 10:00〜11:00」の形式に整形する
 * @param {{date: Date, start: Date, end: Date}} slot
 */
export function formatSlotAsBullet(slot) {
  const w = WEEKDAY_JA[slot.date.getDay()];
  const m = slot.date.getMonth() + 1;
  const d = slot.date.getDate();
  const s = `${pad2(slot.start.getHours())}:${pad2(slot.start.getMinutes())}`;
  const e = `${pad2(slot.end.getHours())}:${pad2(slot.end.getMinutes())}`;
  return `・${m}/${d}(${w}) ${s}〜${e}`;
}
