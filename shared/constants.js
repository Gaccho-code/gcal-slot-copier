// 拡張全体で共有する定数

/** オプションのデフォルト値・chrome.storage.sync のキーも兼ねる */
export const DEFAULT_OPTIONS = {
  startHour: 9,
  endHour: 18,
  minDurationMin: 60,
  weekdaysOnly: true,
};

/** 空き枠として提案する最大件数 */
export const MAX_SUGGESTIONS = 3;

/** content-script が返すエラーコード → popup 向け日本語メッセージ */
export const ERROR_MESSAGES = {
  NOT_CALENDAR_TAB:
    "Googleカレンダーの週表示タブを開いた状態でアイコンをクリックしてください。",
  HEADER_NOT_FOUND:
    "カレンダー画面を認識できませんでした。週表示を開いた状態で再度お試しください。",
  HEADER_PARSE_FAILED:
    "日付の読み取りに失敗しました。週表示を開いた状態で再度お試しください。",
  SCAN_EXCEPTION:
    "カレンダー画面の解析に失敗しました。ページを再読み込みしてから再度お試しください。",
  NO_SLOTS_FOUND:
    "条件に合う空き時間が見つかりませんでした。オプションで営業時間や最低所要時間を調整してください。",
};
