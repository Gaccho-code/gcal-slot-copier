# AGENTS.md — GCal 空き時間コピー 開発ガイド

## 概要

Manifest V3のChrome拡張機能。ビルドツールは使わず、素のJS(classic script)だけで構成されている。
`npm install` や build コマンドは不要。

## アーキテクチャ(v0.2〜: 手動選択方式)

```
manifest.json               … MV3マニフェスト。permissions は storage のみ
background/service-worker.js … アイコンクリックをcontent scriptへ中継するだけの薄いworker
content/panel.js             … calendar.google.com の全ページに常駐するフローティングパネル本体
```

v0.1では「カレンダー画面のDOMを自動スキャンして空き時間を計算する」方式だったが、
Googleカレンダーの実際のDOM構造・`aria-label`の文言パターンが想定と合わず検出に失敗したため、
**v0.2で「ユーザーが目で見て空いている時間をドラッグ選択し、その選択をパネルに取り込む」方式に
設計変更した。** この経緯は重要なので、今後DOM解析方式に戻すことを検討する場合は
この制約を踏まえること。

### content/panel.js の仕組み

- `content_scripts` として `calendar.google.com` の全ページに常駐登録(常時実行、都度注入ではない)
- Shadow DOM(`host.attachShadow`)でパネルを構築し、ページ本体のCSSと干渉しないようにしている
- 「＋ 選択中の時間を追加」ボタンを押した時だけ、`detectSelection()` が1回DOMをスキャンする:
  1. `[role="dialog"]` 要素、および body直下にある「ポップアップサイズ(500px未満四方)」の要素を候補として集める
  2. 各候補の `innerText` に対して「日付パターン(`○月○日`)」と「時間帯パターン(`HH:MM〜HH:MM`等)」の
     両方がマッチするものを探す(個々の予定チップの`aria-label`は解析しない)
  3. マッチしなければ `null` を返し、パネル側は「手動で追加」を促すエラーメッセージを表示する
- 一覧(`slots`)は `chrome.storage.local` に保存し、ページ再読み込み後も復元する

## 重要な運用上の注意: Googleカレンダーの表記ゆれ

`content/panel.js` 内の `DATE_PATTERN` / `TIME_RANGE_PATTERN` が実際のポップアップ文言と
合わず検出に失敗した場合の対処:

1. 実際に選択操作をしてDevToolsで予定作成ポップアップのDOMを確認し、`innerText` がどう見えるかを確認する
2. 日付は「○月○日」、時間帯は「HH:MM + 区切り文字(〜/～/~/-/–/—) + HH:MM」を含む形を前提にしている。
   区切り文字や午前/午後の位置が違う場合は正規表現に候補を**追加**する(既存の候補は残す)
3. `[role="dialog"]` で見つからない場合のフォールバック(body直下のポップアップサイズ要素)条件
   (`rect.width < 500 && rect.height < 500`)がGoogle側のレイアウト変更で外れていないか確認する
4. それでも解決しない・調査に時間がかかる場合は、「手動で追加」欄(`manual-date`/`manual-start`/`manual-end`)
   が常に動作する保険になっているため、致命的な機能不全にはならない設計になっている

## 既知の未実装事項

- 複数の候補要素が同時にマッチした場合、最初に見つかったものを採用する(優先順位付けはしていない)
- `icons/*.png` は単色のプレースホルダー画像。正式なアイコンに差し替える際は
  同じファイル名・サイズ(16/48/128)を維持すること

## 動作確認

`chrome://extensions` でデベロッパーモードをON→「パッケージ化されていない拡張機能を読み込む」で
このフォルダを選択する。ビルド手順は不要。詳しい確認項目は [README.md](README.md) を参照。
