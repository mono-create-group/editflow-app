# EditFlow 引き継ぎドキュメント

最終更新: 2026-07-03 / APP_VERSION `20260628-18`

このファイルは EditFlow（クリエイター向け業務管理PWA）と mono.create 事業管理ツール統合作業の
引き継ぎ用まとめ。**別セッションはまずこれを読むこと。**

---

## 0. 最重要ルール（必ず守る）

1. **2ファイル必須編集**: 同一アプリが `editflow.html` と `index.html` の2ファイルに分岐している。
   機能変更は**必ず両方に同じ編集**を適用する。片方だけだと「直っていない」報告になる。
   - `editflow.html` = 共有URL（`?v=...`で開くリンク）
   - `index.html` = PWAの start_url（`/editflow-app/`）。**ユーザーがインストールして使うのはこちら**
   - 2ファイルは細部が分岐していることがある（例: `signInWithGoogle` の実装、行番号）。
     アンカー文字列は都度 `grep` で確認する。
2. **バージョン bump**: 変更後は必ず以下を同じ番号へ更新（例 `20260628-19`）:
   - 両ファイルの `const APP_VERSION='...'`
   - `sw.js` の `CACHE`（`editflow-YYYYMMDD-NN`）と先頭コメント `Service Worker vYYYYMMDD-NN`
   - これで `forceAppUpdate` が走り自動更新。反映には端末で**1回更新**（再インストール or ⌘+Shift+R 2回）が必要。
3. **linter が index.html を頻繁に触る** → Edit 前に必ず再 `Read`（"modified since read" エラー対策）。
4. **実証してから完了報告**: プレビュー(port 5566 `editflow-app`)で描画/保存/計算を実機検証し、
   `node --check` で構文チェック、console エラーゼロを確認してからコミット。
5. コミットは日本語。末尾に `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## 1. アーキテクチャ

- 単一HTMLアプリ。全状態 `S`（オブジェクト）を1つのJSON blobとして保存。
- 保存先: localStorage キー `ef_v5` ＋ Firebase Firestore（Google Auth）。
- デプロイ: GitHub Pages `mono-create-group.github.io/editflow-app/`。git push で反映。
- リポジトリ: `git@github.com:mono-create-group/editflow-app.git`（サブフォルダ `chatwork/editflow-app`）。

### 画面の追加方法（4点セット）
1. `BUILTIN_VIEWS` に `{id:'xxx',label:'…',icon:'…'}` を追加
2. `views` ディスパッチ（`render()`内）に `xxx:rXxx` を追加
3. レンダ関数 `rXxx()` を定義（HTML文字列を返す）
4. データ配列を使うなら `defState()` と ensure-array リスト（`_applyCloudData`内）に追加

### 主要ヘルパー
- `esc()` HTMLエスケープ / `today()` ローカル日付 `YYYY-MM-DD` / `uid()` ID生成
- `openModal()/openModalLg()/closeModal()` モーダル / `toast(msg,type)` 通知
- `save()` 保存（localStorage＋`fbSave()`） / `render()` 再描画 / `secTitle()` 見出し
- `jobTotalIn(j)/jobTotalOut(j)/jobProfit(j)` サブタスク込み金額

### JSTタイムゾーン注意
`toISOString().slice(0,10)` は-1日ズレる。日付はローカルで
`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`。

---

## 2. Firebase / チーム共有（フェーズ1b）

- Firebaseプロジェクト `task-management-app-bd1b1`。
  **中村さんの4アカウントのどれでも所有していない**（コンソール不可・ルール変更不可）。
- 2026-06-30 実測: 未認証で `shared/team` 読取→403 PERMISSION_DENIED、匿名サインインは無効。
  → ルールはほぼ確実に `if request.auth != null`（サインイン者全員アクセス可）。
- **設計**: `TEAM_KEYS` のデータだけを共有doc `shared/team` に相乗り。個人データは `users/{uid}` のまま非公開。
  - `TEAM_KEYS = ['jobs','clients','workers','pipeline','teamKgis','teamKpis','teamPosts','teamDocs']`
  - 個人データ（非公開）: `tasks, habits, goals, journals, checkIns, meals, workouts` 等
  - エンティティ単位の `updatedAt` で新しい方優先マージ（`mergeTeamArr`）→ 同時編集の全体クロバー回避
  - `permission-denied` 検知で自動的に個人モードへフォールバック（無害・現状維持）
  - サイン欄に「👥 チーム共有 ON / 👤 個人モード」表示
- 恒久解決（任意）: `mono.create.group@gmail.com` 所有の新Firebaseプロジェクトへ移行すればルールを自分で設定可能。

### アカウント分離バグ修正（2026-07-03, v-18）
- 症状: 「アカウントごとに表示が変わらない」＝別アカウントに切替えても同じ個人データが出る。
- 原因: 端末に残った前アカウントの localStorage を、新アカウントのクラウドへ push/上書きしていた。
- 修正: 保存データに `S._uid` を記録。`fbSetupRealtimeSync` 冒頭で
  `S._uid && S._uid!==FB_USER.uid` なら**ローカルを初期化しクラウド優先**に。
  初回サインイン（`S._uid`未設定）のローカル→クラウド移行は維持。

---

## 3. 実装済み機能（統合の成果）

| 機能 | ナビ | 主な関数 | データキー | 共有 |
|---|---|---|---|---|
| ダッシュボード | 🏠 | `rDash`, `rDashTeamSummary` | - | 🤝チーム/🔒個人で二分割表示 |
| 案件管理 | 🎬 | `rProjects`, `openJobModal`, `saveJob` | jobs, clients | ✅ |
| 商談管理 | 🤝 | `rPipeline`, `openDealModal`, `saveDeal`, `moveDealStage` | pipeline | ✅ |
| チームKGI/KPI | 📈 | `rTeamGoals`, `tgOpenKgi/tgSaveKgi/tgDelKgi`, `tgOpenKpi/tgSaveKpi/tgDelKpi`, `bumpKpi` | teamKgis, teamKpis | ✅ |
| 投稿管理 | 📅 | `rPosts`, `tpOpenPost/tpSavePost/tpDelPost/tpMarkPosted` | teamPosts | ✅ |
| ドキュメント | 📁 | `rDocs`, `tdOpenDoc/tdSaveDoc/tdDelDoc` | teamDocs | ✅ |
| ワーカー管理 | 👥 | `rWorkers` | workers | ✅ |
| 請求書 | 案件管理内タブ | `rProjInvoice` ほか（下記） | jobs参照 | - |

> ⚠️ **命名衝突に注意**: 既存の目標ページ（divisions）に `openKgiModal/saveKgi/delKgi/openKpiModal/saveKpi/delKpi` が
> 別シグネチャで存在する。チーム用は必ず `tg` 接頭辞（`tgOpenKgi` 等）を使う。投稿=`tp`、ドキュメント=`td`。

### 請求書機能（Misoca風・案件管理→🧾請求書タブ）
- 主関数: `rProjInvoice`, `_invoiceJobs`, `_invAmt`, `_jobInvDate`, `_invMonthMatch`,
  `openInvoiceEditor`, `openInvoiceEditorFromSelection`, `_renderInvoiceEditor`, `_invRecalc`,
  `_invItemRow`, `_invAddItem`, `markDraftInvoiced`, `markClientInvoiced`,
  `genInvoiceText`, `copyInvoiceText`, `openInvoiceInfo`, `saveInvoiceInfo`
- 表示基準: **請求書提出日（`invoiceDate`）が該当月**の案件。既定＝今月「提出予定」。「すべての期間」も選択可。
- 月判定フォールバック: `invoiceDate → deliveryDate → サブタスク最新deliveryDate`（`_jobInvDate`）。
  親に日付が無くサブタスクにしか無い案件を取りこぼさない。
- 金額: `_invAmt` = `jobTotalIn`（メイン＋サブタスク単価合計）ベース。
- 案件を☑選択 → 選んだ分だけで請求書作成。明細はサブタスクごとに個別行へ展開。
- 税区分: 外税(税抜+10%)／内税(税込・10%内包)／なし。源泉徴収(個人10.21%、100万超20.42%)。インボイス登録番号表示。
- 請求元情報: `S.settings.issuer`（屋号/担当/住所/TEL/メール/登録番号/振込先/支払期限/既定値）。
- 請求済みは `invoicedAt` で管理（提出予定日 `invoiceDate` と分離）。
- PDF: `_invPrint()` が `window.print()`。`@media print` で `#inv-paper` 以外を隠す。
- **案件追加時に請求書提出日を必須化**（`saveJob` で未入力なら保存不可）。

### 案件（job）データモデル主要フィールド
`title, jobType('edit'|'consul'), clientId, workerIds/workerId, scope, status, isTrial,
unitPrice(=profit), workerPay, sharedDate, editorDraftDate, clientDraftDate, thumbnailDate,
deliveryDate, invoiceDate(請求書提出日/必須), dueDate(支払期日), paymentDate, payoutDate,
invoicedAt(請求済み日), notes, subtasks[], updatedAt`
- **コンサル案件**: `jobType==='consul'` で編集専用項目（初稿/サムネ/外注費/利益/サブタスク/担当範囲）を非表示、
  単価→報酬・納品日→完了予定日にラベル変更。ステータスに商談中/契約中/継続中を追加。カードに💼バッジ。

---

## 4. 未着手・今後の候補

- 事業管理ツールの残り（売上/KPIグラフ等）はEditFlow既存の収益・目標ページと重複するため未移植。
- X/Threads自動生成・自動投稿は既存の GitHub Actions（`automation/`）が担当。投稿管理はリンク連携に留めている。
- （要確認）アカウント分離バグ以前に**クラウドで混在したデータ**が残っている可能性 → 実データで各アカウント検証推奨。

---

## 5. 検証環境・コマンド

- プレビュー: MCP `preview_start` name=`editflow-app`（port 5566）。
  `location.replace('/editflow.html')` または `/index.html` で読み込み → `preview_eval` で関数を直接検証。
  - 注意: `const`（TEAM_KEYS/BUILTIN_VIEWS等）は `window` 非公開。eval では裸の識別子で参照する。
  - 注意: 未サインイン時は `checkDailyLock()` 等のロックで `render()` がダッシュボードに戻ることがある。
    レンダ関数は `rXxx()` を直接呼んで検証する。
- 構文チェック: 最大の `<script>` を抽出して `node --check`。
  ```
  node -e 'const fs=require("fs");const h=fs.readFileSync("editflow.html","utf8");let s=[],re=/<script>([\s\S]*?)<\/script>/g,m;while((m=re.exec(h)))s.push(m[1]);fs.writeFileSync("/tmp/ef.js",s.sort((a,b)=>b.length-a.length)[0]);' && node --check /tmp/ef.js
  ```
- バージョン bump 一括（例）:
  ```
  CUR=$(grep -o "20260628-[0-9][0-9]" editflow.html | head -1)
  sed -i '' "s/const APP_VERSION='$CUR';/const APP_VERSION='20260628-19';/" editflow.html index.html
  SWV=$(grep -o "editflow-20260628-[0-9][0-9]" sw.js | head -1)
  sed -i '' "s/$SWV/editflow-20260628-19/; s#Service Worker v20260628-[0-9][0-9]#Service Worker v20260628-19#" sw.js
  ```

---

## 6. コミット履歴（この統合作業・新しい順）

- v-18 fix: アカウント切替時に前アカウントの個人データが漏れる/上書きするのを防止
- v-17 feat: ダッシュボードにチームサマリー（商談/KGI/投稿予定）
- v-16 feat: 投稿管理・ドキュメント管理を追加（チーム共有）
- v-15 feat: チームKGI/KPIを追加（tg接頭辞で命名衝突回避）
- v-14 feat: 請求書の各案件行に「詳細」ボタン
- v-13 fix: 請求書でサブタスクを反映（合算/月フォールバック/明細展開）
- v-12 feat: 請求書を請求書提出日ベース＋案件選択・内税/外税、請求書提出日を必須化
- v-11 feat: 商談管理（パイプライン）を追加・チーム共有
- v-10 feat: フェーズ1b チームデータ共有（案件/クライアント/編集者）
- v-09 feat: 請求書をMisoca風に刷新（PDF/インボイス/源泉徴収）
- v-08 feat: 案件にコンサルタイプを追加

（詳細は `git log` 参照。関連メモリ: `editflow_two_file_rule`, `editflow_team_share`）
