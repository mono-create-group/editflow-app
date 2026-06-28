/**
 * EditFlow → スプレッドシート 同期（Apps Script ウェブアプリ）
 *
 * 【設置手順】
 * 1. 同期したいスプレッドシートを開く → 拡張機能 → Apps Script
 * 2. このコードを貼り付けて保存
 * 3. デプロイ → 新しいデプロイ → ウェブアプリ（実行:自分 / アクセス:全員）→ デプロイ → 承認
 * 4. 表示された「ウェブアプリのURL」(https://script.google.com/macros/s/.../exec) をコピー
 *    ※スプレッドシートのURL(docs.google.com...)ではない
 * 5. EditFlowアプリの 案件管理 →「📊 シート同期」にそのURLを貼る（以降は保存毎に自動同期）
 *
 * 重要な実装ポイント:
 *  - ウェブアプリのPOSTでは getActiveSpreadsheet() が null になるため openById を使う
 *  - シート名に使えない文字 (/ \ ? * [ ] :) は safeName_ で「-」へ置換
 *  - clear() では旧シートの入力規則(ドロップダウン)が残るので clearDataValidations() で除去
 *  - クライアント単位で try/catch し、1件失敗しても他を止めない
 *  - クライアント未設定の案件は「未分類」タブへ
 */

var SHEET_ID = "1SxcKhu4b_GI45Ziep8lIulwtlyDEXgCThoikRY5oHDs";
var HEADERS = ["案件名","ステータス","担当編集者","編集共有日","編集者初稿日","クライアント初稿日","納品日","報酬","素材リンク","参考動画","プロマネ","備考"];
var ALL_STATUSES = ["案件掲載中","受注済み","未着手","進行中","編集者進行中","確認待ち","FB待ち","初稿完成","修正中","完了","キャンセル"];
var STATUS_ORDER = ["案件掲載中","受注済み","編集者進行中","進行中","初稿完成","確認待ち","FB待ち","修正中","完了","キャンセル"];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var data = { jobs: body.jobs || [], clients: body.clients || [], workers: body.workers || [] };
    var r = syncToSheet_(data);
    return _json_({ ok: true, sheets: r.count, errors: r.errors });
  } catch (err) {
    return _json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return _json_({ ok: true, message: "EditFlow sheet sync is live. Use POST to sync." });
}

function _json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function safeName_(name) {
  var n = String(name == null ? "" : name).replace(/[\/\\?*\[\]:]/g, "-").trim();
  if (n.length > 99) n = n.slice(0, 99);
  return n || "シート";
}

function workerName_(data, id) {
  if (!id || id === "__self") return "❌";
  for (var i = 0; i < data.workers.length; i++) {
    if (data.workers[i].id === id) return data.workers[i].name || "";
  }
  return "";
}

function jobRow_(data, j) {
  return [ j.title || "", j.status || "", workerName_(data, j.workerId),
    j.sharedDate || "", j.editorDraftDate || "", j.clientDraftDate || "", j.deliveryDate || "",
    (j.workerPay != null ? j.workerPay : ""), "", "", "", j.notes || "" ];
}

function subRow_(data, s) {
  return [ "  └ " + (s.title || ""), s.status || "", workerName_(data, s.workerId),
    s.sharedDate || "", s.editorDraftDate || "", s.clientDraftDate || "", s.deliveryDate || "",
    (s.workerPay != null ? s.workerPay : ""), "", "", "", "" ];
}

function writeSheet_(ss, name, cjobs, data) {
  cjobs.sort(function (a, b) {
    var ia = STATUS_ORDER.indexOf(a.status); if (ia < 0) ia = 99;
    var ib = STATUS_ORDER.indexOf(b.status); if (ib < 0) ib = 99;
    return ia - ib;
  });
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();

  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight("bold").setBackground("#4285f4").setFontColor("#ffffff");

  var rows = [], subIdx = [], r = 2;
  cjobs.forEach(function (j) {
    rows.push(jobRow_(data, j)); r++;
    (j.subtasks || []).forEach(function (s) { rows.push(subRow_(data, s)); subIdx.push(r); r++; });
  });

  if (rows.length) {
    sh.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(ALL_STATUSES, true).setAllowInvalid(true).build();
    sh.getRange(2, 2, rows.length, 1).setDataValidation(rule);
    subIdx.forEach(function (ri) { sh.getRange(ri, 1, 1, HEADERS.length).setBackground("#f2f2f2"); });
  }
  sh.setFrozenRows(1);
}

function syncToSheet_(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var jobs = data.jobs.filter(function (j) { return !j.deleted; });
  var count = 0, errors = [];
  var seen = {};

  data.clients.forEach(function (client) {
    if (!client || !client.name || client.deleted) return;
    seen[client.id] = true;
    var cjobs = jobs.filter(function (j) { return j.clientId === client.id; });
    if (!cjobs.length) return;
    try {
      writeSheet_(ss, safeName_(client.name), cjobs, data);
      count++;
    } catch (err) {
      errors.push(client.name + ": " + String(err).slice(0, 80));
    }
  });

  var orphan = jobs.filter(function (j) { return !seen[j.clientId]; });
  if (orphan.length) {
    try { writeSheet_(ss, "未分類", orphan, data); count++; }
    catch (err) { errors.push("未分類: " + String(err).slice(0, 80)); }
  }

  return { count: count, errors: errors };
}
