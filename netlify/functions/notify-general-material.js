const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { ok:false, error:"Method not allowed" });
  try {
    const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply(401, { ok:false, error:"Unauthorized" });
    try {
      jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms:["HS256"] });
    } catch (_error) {
      return reply(401, { ok:false, error:"Unauthorized" });
    }

    const body = JSON.parse(event.body || "{}");
    const clean = (v, max=300) => String(v ?? "").trim().slice(0, max);
    const webhook = process.env.DINGTALK_MATERIAL_WEBHOOK_URL;
    if (!webhook) {
      return reply(503, { ok:false, error:"Netlify ยังไม่ได้ตั้งค่า DINGTALK_MATERIAL_WEBHOOK_URL สำหรับ General Material Workflow 2" });
    }

    if (body.test === true) {
      const testMessage = [
        "แจ้งเตือนวัสดุทั่วไป",
        "General Material DingTalk Connection Test",
        "Material Shelf-Life & Storage Control System",
        `Time: ${new Date().toLocaleString("th-TH", { timeZone:"Asia/Bangkok" })}`,
        "Mode: workflow_text"
      ].join("\n");
      const sent = await sendWorkflowText(webhook, testMessage);
      return reply(200, { ok:true, sent:true, test:true, sent_at:new Date().toISOString(), response:sent.text, http_status:sent.status });
    }

    const materialCode = clean(body.material_code, 80).toUpperCase();
    const materialGroup = clean(body.material_group, 80).toUpperCase();
    const mfgDate = clean(body.mfg_date, 20);
    const expiryDate = clean(body.expiry_date, 20);
    const status = clean(body.status, 40).toUpperCase();
    const remark = clean(body.remark, 1000);
    const source = clean(body.source || "GENERAL_EXPIRY_ALERT_PAGE", 60);
    const remainingDays = Number(body.remaining_days);
    const remainingPercent = Number(body.remaining_percent);

    if (!materialCode || !materialGroup || !mfgDate || !expiryDate || !status || !remark) {
      return reply(400, { ok:false, error:"Missing required alert fields" });
    }
    if (!Number.isFinite(remainingDays) || !Number.isFinite(remainingPercent)) {
      return reply(400, { ok:false, error:"Invalid remaining days or percent" });
    }

    if (!["EXPIRING_SOON","NEAR_EXPIRY","EXPIRED"].includes(status)) {
      return reply(409, { ok:false, error:`Status ${status} ยังไม่เข้าเงื่อนไข General Material Alert` });
    }

    const level = status === "EXPIRED" ? "🔴" : status === "NEAR_EXPIRY" ? "🟠" : "🟡";
    const lines = [
      "แจ้งเตือนวัสดุทั่วไป",
      `${level} General Material Shelf-Life Alert`,
      "",
      `Material Code: ${materialCode}`,
      `Material Group: ${materialGroup}`,
      `MFG Date: ${mfgDate}`,
      `Expiry Date: ${expiryDate}`,
      `Remaining Days: ${remainingDays}`,
      `Remaining: ${remainingPercent}%`,
      `Status: ${status}`,
      body.shelf_life ? `Shelf Life: ${clean(body.shelf_life,80)}` : null,
      body.storage_temperature ? `Storage Temp: ${clean(body.storage_temperature,150)}` : null,
      body.storage_humidity ? `Storage RH: ${clean(body.storage_humidity,250)}` : null,
      body.packaging ? `Packaging: ${clean(body.packaging,200)}` : null,
      body.profile_no ? `Storage Profile: ${clean(body.profile_no,20)}` : null,
      "",
      `Remark: ${remark}`,
      `Source: ${source}`,
      "",
      status === "EXPIRED"
        ? "Action Required: HOLD / SEGREGATE และส่ง Quality/IQC Review"
        : "Action Required: Warehouse / IQC / Quality Review"
    ].filter(Boolean);

    const sent = await sendWorkflowText(webhook, lines.join("\n"));
    return reply(200, { ok:true, sent:true, material_code:materialCode, status, sent_at:new Date().toISOString(), response:sent.text, http_status:sent.status });
  } catch (error) {
    console.error("General material DingTalk alert error:", error);
    return reply(500, { ok:false, error:error.message || "DingTalk alert failed" });
  }
};

async function sendWorkflowText(webhook, message) {
  const response = await fetch(webhook, {
    method:"POST",
    headers:{"Content-Type":"text/plain; charset=utf-8"},
    body:message
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`DingTalk HTTP ${response.status}: ${text.slice(0,300)}`);
  return { status:response.status, text };
}

function reply(statusCode, body) {
  return { statusCode, headers:{"Content-Type":"application/json","Cache-Control":"no-store"}, body:JSON.stringify(body) };
}
