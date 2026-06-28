/**
 * EditFlow → スプレッドシート 同期（Apps Script ウェブアプリ）
 *
 * 【設置手順】
 * 1. 同期したいスプレッドシートを開く
 * 2. 上部メニュー「拡張機能」→「Apps Script」
 * 3. 既定のコードを全部消して、このファイルの中身を貼り付けて保存
 * 4. 右上「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 *    →「デプロイ」→（初回は承認を求められるので許可）
 * 5. 表示された「ウェブアプリのURL」(https://script.google.com/macros/s/.../exec) をコピー
 *    ※スプレッドシートのURL(docs.google.com...)ではない点に注意
 * 6. EditFlowアプリの 案件管理 →「📊 シート同期」を押し、上記URLを貼り付ける
 *    （以降は保存のたびに自動で同期されます）
 *
 * 注意: ウェブアプリのPOST実行では SpreadsheetApp.getActiveSpreadsheet() は null になるため、
 *       必ず openById(SHEET_ID) でシートを開くこと。
 */

var SHEET_ID = "1SxcKhu4b_GI45Ziep8lIulwtlyDEXgCThoikRY5oHDs";
var HEADERS = ["案件名","ステータス","担当編集者","編集共有日","編集者初稿日","クライアント初稿日","納品日","報酬","素材リンク","参考動画","プロマネ","備考"];
var ALL_STATUSES = ["案件掲載中","受注済み","未着手","進行中","編集者進行中","確認待ち","FB待ち","初稿完成","修正中","完了","キャンセル"];
var STATUS_ORDER = ["案件掲載中","受注済み","編集者進行中","進行中","初稿完成","確認待ち","FB待ち","修正中","完了","キャンセル"];

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var data = { jobs: body.jobs || [], clients: body.clients || [], workers: body.workers || [] };
    console.log("doPost received: clients=" + data.clients.length + " jobs=" + data.jobs.length + " workers=" + data.workers.length);
    var n = syncToSheet_(data);
    console.log("synced sheets=" + n);
    return _json_({ ok: true, clients: n });
  } catch (err) {
    console.error("doPost error: " + err);
    return _json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return _json_({ ok: true, message: "EditFlow sheet sync is live. Use POST to sync." });
}

function _json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
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

function syncToSheet_(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var jobs = data.jobs.filter(function (j) { return !j.deleted; });
  var count = 0;

  data.clients.forEach(function (client) {
    if (!client || !client.name || client.deleted) return;
    var cjobs = jobs.filter(function (j) { return j.clientId === client.id; });
    if (!cjobs.length) return;

    cjobs.sort(function (a, b) {
      var ia = STATUS_ORDER.indexOf(a.status); if (ia < 0) ia = 99;
      var ib = STATUS_ORDER.indexOf(b.status); if (ib < 0) ib = 99;
      return ia - ib;
    });

    var sh = ss.getSheetByName(client.name);
    if (!sh) sh = ss.insertSheet(client.name);
    sh.clear();
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
    count++;
  });

  return count;
}
