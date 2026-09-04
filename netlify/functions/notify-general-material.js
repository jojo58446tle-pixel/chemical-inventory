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
    const materialCode = clean(body.material_code, 80).toUpperCase();
    const materialGroup = clean(body.material_group, 80).toUpperCase();
    const mfgDate = clean(body.mfg_date, 20);
    const expiryDate = clean(body.expiry_date, 20);
    const status = clean(body.status, 40).toUpperCase();
    const remark = clean(body.remark, 1000);
    const source = clean(body.source || "WAREHOUSE_CHECK", 60);
    const remainingDays = Number(body.remaining_days);
    const remainingPercent = Number(body.remaining_percent);

    if (!materialCode || !materialGroup || !mfgDate || !expiryDate || !status || !remark) {
      return reply(400, { ok:false, error:"Missing required alert fields" });
    }
    if (!Number.isFinite(remainingDays) || !Number.isFinite(remainingPercent)) {
      return reply(400, { ok:false, error:"Invalid remaining days or percent" });
    }

    const webhook = process.env.DINGTALK_MATERIAL_WEBHOOK_URL || process.env.DINGTALK_WEBHOOK_URL;
    if (!webhook) {
      return reply(503, { ok:false, error:"DingTalk webhook is not configured. Add DINGTALK_MATERIAL_WEBHOOK_URL in Netlify Environment Variables." });
    }

    const level = status === "EXPIRED" ? "🔴" : status === "EXPIRING_SOON" ? "🟠" : "🟡";
    const lines = [
      `${level} Material Shelf-Life Alert`,
      "วัสดุที่ Warehouse ตรวจพบและต้องการแจ้งตรวจสอบ",
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
      `Warehouse Remark: ${remark}`,
      `Source: ${source}`,
      "",
      status === "EXPIRED"
        ? "Action Required: HOLD / SEGREGATE และส่ง Quality/IQC Review"
        : "Action Required: Warehouse / IQC / Quality Review"
    ].filter(Boolean);

    const response = await fetch(webhook, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ msgtype:"text", text:{ content:lines.join("\n") } })
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`DingTalk HTTP ${response.status}: ${text.slice(0,300)}`);

    let dingResponse = text;
    try { dingResponse = JSON.parse(text); } catch (_e) {}
    if (dingResponse && typeof dingResponse === "object" && "errcode" in dingResponse && Number(dingResponse.errcode) !== 0) {
      throw new Error(`DingTalk error ${dingResponse.errcode}: ${dingResponse.errmsg || "Unknown error"}`);
    }

    return reply(200, { ok:true, sent:true, material_code:materialCode, status, sent_at:new Date().toISOString() });
  } catch (error) {
    console.error("General material DingTalk alert error:", error);
    return reply(500, { ok:false, error:error.message || "DingTalk alert failed" });
  }
};

function reply(statusCode, body) {
  return { statusCode, headers:{"Content-Type":"application/json","Cache-Control":"no-store"}, body:JSON.stringify(body) };
}
