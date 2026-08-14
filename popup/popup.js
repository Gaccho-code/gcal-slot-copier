import { DEFAULT_OPTIONS, ERROR_MESSAGES } from "../shared/constants.js";
import { computeFreeSlots } from "../shared/free-slot-calculator.js";
import { formatSlotAsBullet } from "../shared/time-utils.js";

const stateLoading = document.getElementById("state-loading");
const stateError = document.getElementById("state-error");
const stateResult = document.getElementById("state-result");
const errorMessageEl = document.getElementById("error-message");
const previewEl = document.getElementById("preview");
const warningNoteEl = document.getElementById("warning-note");
const copyButton = document.getElementById("copy-button");
const retryButton = document.getElementById("retry-button");
const toastEl = document.getElementById("toast");
const optionsLink = document.getElementById("options-link");

function setState(name, message) {
  stateLoading.hidden = name !== "loading";
  stateError.hidden = name !== "error";
  stateResult.hidden = name !== "result";
  if (name === "error") {
    errorMessageEl.textContent = message || ERROR_MESSAGES.SCAN_EXCEPTION;
  }
}

/** content-script が返す ISO 文字列群を Date を含むオブジェクトに戻す */
function reviveScanResult(raw) {
  return {
    days: raw.days.map((iso) => new Date(iso)),
    busyIntervals: raw.busyIntervals.map((b) => ({
      date: new Date(b.date),
      start: new Date(b.start),
      end: new Date(b.end),
    })),
    unparsedCount: raw.unparsedCount,
  };
}

function renderPreview(slots, hasUnparsed) {
  previewEl.value = slots.map(formatSlotAsBullet).join("\n");
  warningNoteEl.hidden = !hasUnparsed;
  setState("result");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // フォールバック: 旧来の execCommand 方式
    previewEl.focus();
    previewEl.select();
    try {
      return document.execCommand("copy");
    } catch (e2) {
      return false;
    }
  }
}

async function run() {
  setState("loading");

  const options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.startsWith("https://calendar.google.com/")) {
    setState("error", ERROR_MESSAGES.NOT_CALENDAR_TAB);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/content-script.js"],
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__gcalSlotCopierScan(),
    });

    if (!result || result.error) {
      const code = result ? result.error : "SCAN_EXCEPTION";
      setState("error", ERROR_MESSAGES[code] || ERROR_MESSAGES.SCAN_EXCEPTION);
      return;
    }

    const scan = reviveScanResult(result);
    const slots = computeFreeSlots(scan.days, scan.busyIntervals, options);

    if (slots.length === 0) {
      setState("error", ERROR_MESSAGES.NO_SLOTS_FOUND);
      return;
    }

    renderPreview(slots, scan.unparsedCount > 0);
  } catch (e) {
    console.error("[gcal-slot-copier] popup run failed", e);
    setState("error", ERROR_MESSAGES.SCAN_EXCEPTION);
  }
}

copyButton.addEventListener("click", async () => {
  const ok = await copyToClipboard(previewEl.value);
  toastEl.hidden = !ok;
  toastEl.textContent = ok ? "コピーしました" : "コピーに失敗しました";
  toastEl.hidden = false;
  setTimeout(() => {
    toastEl.hidden = true;
  }, 2000);
});

retryButton.addEventListener("click", run);

optionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.addEventListener("DOMContentLoaded", run);
