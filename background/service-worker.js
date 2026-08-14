// ツールバーアイコンのクリックを、対象タブに常駐しているパネル(content/panel.js)へ
// 「表示/最小化を切り替えて」というメッセージとして中継するだけの薄いservice worker。

chrome.action.onClicked.addListener((tab) => {
  if (!tab || typeof tab.id !== "number") return;

  chrome.tabs.sendMessage(tab.id, { type: "GCAL_SLOT_COPIER_TOGGLE_PANEL" }, () => {
    // calendar.google.com以外のタブなどでcontent scriptが存在しない場合、
    // chrome.runtime.lastError に "Could not establish connection" 等が入るだけなので無視する。
    void chrome.runtime.lastError;
  });
});
