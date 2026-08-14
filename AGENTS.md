# AGENTS.md — GCal 空き時間コピー 開発ガイド

## 概要

Manifest V3のChrome拡張機能。ビルドツールは使わず、素のES modules(popup/options)と
classic script(content script)だけで構成されている。`npm install` や build コマンドは不要。

## アーキテクチャ

```
manifest.json          … MV3マニフェスト。permissions は activeTab / scripting / storage のみ
popup/popup.js          … ポップアップのエントリポイント。タブ確認→content-script注入→計算→表示
options/options.js      … オプション画面。chrome.storage.sync に設定を保存
content/content-script.js … calendar.google.com の週表示ページに都度注入される薄いスキャナ
shared/                 … popup/options からimportして使う純粋関数群(日時ユーティリティ、区間演算)
```

- `content-script.js` は `content_scripts` として常駐登録していない。popup操作のたびに
  `chrome.scripting.executeScript` で対象タブに注入し、`window.__gcalSlotCopierScan()` を
  呼び出す2段階方式。理由: 権限を最小化し、ページを開いているだけで常時DOM監視するコードを
  走らせないため。
- 空き時間の計算(`shared/free-slot-calculator.js`)はcontent-script側ではなくpopup側で行う。
  content-scriptは「週の日付一覧」と「予定の開始/終了時刻」を返すだけに徹する。

## 重要な運用上の注意: GoogleカレンダーのDOM変更

GoogleカレンダーのHTML構造・クラス名は**予告なく変更される**。`content/content-script.js` 内の
セレクタ(`HEADER_SELECTORS` / `EVENT_CHIP_SELECTORS`)や `aria-label` の正規表現
(`HEADER_PATTERN_JA` / `EVENT_LABEL_PATTERN` 等)が動かなくなった場合の対処:

1. 実際にGoogleカレンダーの週表示をDevToolsで開き、日付ヘッダやイベントチップ要素の
   現在の `role` / `aria-label` / `data-*` 属性を確認する。
2. クラス名(難読化された自動生成文字列)には依存しない。`role` や `aria-*` など
   セマンティックな属性を優先してセレクタ候補に追加する。
3. 既存のセレクタ配列に新しい候補を**追加**する形で直し、古い候補も残しておく
   (Google側がA/Bテスト等で複数のDOM構造を混在させる可能性があるため)。
4. セレクタ・正規表現が全滅した場合、`content-script.js` は `HEADER_NOT_FOUND` /
   `HEADER_PARSE_FAILED` / `SCAN_EXCEPTION` のいずれかを返す。これらは
   `shared/constants.js` の `ERROR_MESSAGES` でユーザー向け日本語メッセージに変換される。
   **サイレントに失敗させず、必ずエラー表示するようにすること。**

## 既知の未実装事項

- `parseFromPixelPosition()`(ピクセル位置からの時刻推定フォールバック)は
  v0.1時点では未実装(`content/content-script.js` 内にコメントあり)。
  `aria-label` 解析に失敗したイベントは `unparsedCount` としてカウントされ、
  popup側で注意メッセージが表示されるのみに留まる。
- `icons/*.png` は単色のプレースホルダー画像(`icons/icon16.png` 等)。
  正式なアイコンに差し替える際は同じファイル名・サイズ(16/48/128)を維持すること。

## 動作確認

`chrome://extensions` でデベロッパーモードをON→「パッケージ化されていない拡張機能を読み込む」で
このフォルダを選択する。ビルド手順は不要。詳しい確認項目は [README.md](README.md) を参照。
