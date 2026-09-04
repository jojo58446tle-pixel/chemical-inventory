const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

  try {
    const token = (event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return json(401, { ok:false, error:"Unauthorized" });
    try {
      jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms:["HS256"] });
    } catch (_error) {
      return json(401, { ok:false, error:"Unauthorized" });
    }

    const body = JSON.parse(event.body || "{}");
    const supabaseUrl = process.env.SUPABASE_URL || "https://eknwvgjftjimurlynfmv.supabase.co";
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const webhook = process.env.DINGTALK_WEBHOOK_URL;
    if (!serviceRoleKey) throw new Error("Netlify ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY");
    if (!webhook) throw new Error("Netlify ยังไม่ได้ตั้งค่า DINGTALK_WEBHOOK_URL");

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth:{ persistSession:false, autoRefreshToken:false } });

    let query = supabase
      .from("chemical_lots")
      .select("id,lot_no,expiry_date,remaining_qty,unit,storage_location,is_active,materials(material_code,material_name)")
      .eq("is_active", true)
      .gt("remaining_qty", 0)
      .not("expiry_date", "is", null);
    if (body.lot_id) query = query.eq("id", body.lot_id);

    const { data:lots, error:lotsError } = await query.order("expiry_date");
    if (lotsError) throw lotsError;
    if (!lots?.length) return json(200, { ok:true, sent:false, count:0, reason:"NO_ACTIVE_LOTS" });

    const { data:sentRows, error:sentError } = await supabase
      .from("expiry_notifications")
      .select("lot_id,alert_level")
      .eq("success", true)
      .in("lot_id", lots.map(x => x.id));
    if (sentError) throw sentError;
    const sentKeys = new Set((sentRows || []).map(x => `${x.lot_id}|${Number(x.alert_level)}`));

    const today = todayBangkok_();
    const evaluated = lots.map(lot => ({ lot, level:getAlertLevel_(today, parseDate_(lot.expiry_date)) }));
    const pending = evaluated.filter(x => x.level && !sentKeys.has(`${x.lot.id}|${x.level}`));
    if (!pending.length) {
      return json(200, {
        ok:true,
        sent:false,
        count:0,
        reason:"NO_PENDING_ALERT",
        evaluated:lots.length,
        qualified:evaluated.filter(x=>x.level).length
      });
    }

    const groups = new Map();
    pending.forEach(x => { if (!groups.has(x.level)) groups.set(x.level, []); groups.get(x.level).push(x.lot); });

    const saved = [];
    for (const [level, groupLots] of groups) {
      const message = buildMessage_(level, groupLots);
      // Chemical uses the existing DingTalk Workflow webhook contract.
      // Keep this as raw text/plain; do NOT send Robot msgtype JSON here.
      const dingResponse = await fetch(webhook, {
        method:"POST",
        headers:{ "Content-Type":"text/plain; charset=utf-8" },
        body:message
      });
      const responseText = await dingResponse.text();
      if (!dingResponse.ok) throw new Error(`DingTalk HTTP ${dingResponse.status}: ${responseText.slice(0,500)}`);
      validateDingTalkResponse_(responseText);

      groupLots.forEach(lot => saved.push({
        lot_id:lot.id,
        alert_level:level,
        sent_at:new Date().toISOString(),
        success:true,
        response_text:responseText
      }));
    }

    const { error:saveError } = await supabase
      .from("expiry_notifications")
      .upsert(saved, { onConflict:"lot_id,alert_level" });
    if (saveError) throw saveError;

    return json(200, {
      ok:true,
      sent:true,
      count:saved.length,
      level:body.lot_id ? saved[0].alert_level : null,
      reason:"SENT"
    });
  } catch (error) {
    console.error("Chemical DingTalk alert error:", error);
    return json(500, { ok:false, error:error.message || "Chemical DingTalk alert failed" });
  }
};

function validateDingTalkResponse_(text) {
  try {
    const r = JSON.parse(text);
    if (r && typeof r === "object" && "errcode" in r && Number(r.errcode) !== 0) {
      throw new Error(`DingTalk error ${r.errcode}: ${r.errmsg || "Unknown error"}`);
    }
  } catch (e) {
    if (String(e.message||"").startsWith("DingTalk error")) throw e;
  }
}
function buildMessage_(months, lots) {
  const lines = [`⚠️ แจ้งเตือนสารเคมีใกล้หมดอายุ ${months} เดือน`];
  lots.forEach((lot, index) => {
    if (lots.length > 1) lines.push("", `รายการที่ ${index + 1}`);
    lines.push(`Material Code: ${value_(lot.materials?.material_code)}`);
    lines.push(`Material Name: ${value_(lot.materials?.material_name)}`);
    lines.push(`Lot: ${value_(lot.lot_no)}`);
    lines.push(`คงเหลือ: ${formatQty_(lot.remaining_qty)} ${value_(lot.unit)}`);
    lines.push(`วันหมดอายุ: ${formatDate_(lot.expiry_date)}`);
    lines.push(`Location: ${value_(lot.storage_location)}`);
  });
  return lines.join("\n");
}
function getAlertLevel_(today, expiry) {
  if (!expiry || expiry < today) return null;
  if (today >= addMonths_(expiry, -1)) return 1;
  if (today >= addMonths_(expiry, -2)) return 2;
  if (today >= addMonths_(expiry, -3)) return 3;
  if (today >= addMonths_(expiry, -6)) return 6;
  return null;
}
function todayBangkok_() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Bangkok", year:"numeric", month:"2-digit", day:"2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return new Date(Number(map.year), Number(map.month) - 1, Number(map.day));
}
function parseDate_(text) { const m=String(text||"").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3])):null; }
function addMonths_(date, months) { const r=new Date(date.getFullYear(),date.getMonth(),1);r.setMonth(r.getMonth()+months);const last=new Date(r.getFullYear(),r.getMonth()+1,0).getDate();r.setDate(Math.min(date.getDate(),last));return r; }
function value_(value) { const text=String(value==null?"":value).trim(); return text||"NA"; }
function formatQty_(value) { const n=Number(value); return Number.isFinite(n)?String(n).replace(/\.0+$/,""):value_(value); }
function formatDate_(text) { const m=String(text||"").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${m[3]}/${m[2]}/${m[1]}`:value_(text); }
function json(statusCode, body) { return { statusCode, headers:{ "Content-Type":"application/json", "Cache-Control":"no-store" }, body:JSON.stringify(body) }; }
