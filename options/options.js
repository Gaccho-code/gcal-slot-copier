import { DEFAULT_OPTIONS } from "../shared/constants.js";

const form = document.getElementById("options-form");
const startHourEl = document.getElementById("start-hour");
const endHourEl = document.getElementById("end-hour");
const minDurationEl = document.getElementById("min-duration");
const weekdaysOnlyEl = document.getElementById("weekdays-only");
const errorListEl = document.getElementById("error-list");
const savedToastEl = document.getElementById("saved-toast");

function populateHourOptions(selectEl) {
  for (let h = 0; h <= 24; h++) {
    const opt = document.createElement("option");
    opt.value = String(h);
    opt.textContent = `${h}:00`;
    selectEl.appendChild(opt);
  }
}

function fillForm(values) {
  startHourEl.value = String(values.startHour);
  endHourEl.value = String(values.endHour);
  minDurationEl.value = String(values.minDurationMin);
  weekdaysOnlyEl.checked = !!values.weekdaysOnly;
}

function readForm() {
  return {
    startHour: parseInt(startHourEl.value, 10),
    endHour: parseInt(endHourEl.value, 10),
    minDurationMin: parseInt(minDurationEl.value, 10),
    weekdaysOnly: weekdaysOnlyEl.checked,
  };
}

function validate(values) {
  const errors = [];
  if (!(values.startHour >= 0 && values.startHour <= 24)) {
    errors.push("営業時間(開始)が不正です。");
  }
  if (!(values.endHour >= 0 && values.endHour <= 24)) {
    errors.push("営業時間(終了)が不正です。");
  }
  if (values.startHour >= values.endHour) {
    errors.push("営業時間(開始)は終了より前である必要があります。");
  }
  if (!(values.minDurationMin >= 5 && values.minDurationMin <= 480)) {
    errors.push("最低所要時間は5〜480分の範囲で指定してください。");
  }
  return errors;
}

async function init() {
  populateHourOptions(startHourEl);
  populateHourOptions(endHourEl);
  const current = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  fillForm(current);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const values = readForm();
  const errors = validate(values);

  if (errors.length > 0) {
    errorListEl.textContent = errors.join(" ");
    errorListEl.hidden = false;
    savedToastEl.hidden = true;
    return;
  }

  errorListEl.hidden = true;
  await chrome.storage.sync.set(values);
  savedToastEl.hidden = false;
  setTimeout(() => {
    savedToastEl.hidden = true;
  }, 2000);
});

document.addEventListener("DOMContentLoaded", init);
