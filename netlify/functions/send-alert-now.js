const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  try {
    const token = (event.headers.authorization || "").replace("Bearer ", "");
    if (!token) return json(401, { ok:false, error:"Unauthorized" });

    try {
      jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms:["HS256"] });
    } catch (_error) {
      return json(401, { ok:false, error:"Unauthorized" });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const today = new Date();
    const limit = new Date(today); limit.setDate(limit.getDate() + 180);
    const { data: lots, error } = await supabase
      .from("chemical_lots")
      .select("*,materials(*)")
      .gt("remaining_qty", 0)
      .lte("expiry_date", limit.toISOString().slice(0,10))
      .order("expiry_date");
    if (error) throw error;
    if (!lots.length) return json(200, { ok:true, count:0 });

    const lines = ["⚠️ Chemical Expiry Alert",""];
    lots.forEach((x,i)=>{
      const d = Math.ceil((new Date(x.expiry_date+"T23:59:59")-today)/86400000);
      lines.push(`${i+1}. ${x.materials.material_code} ${x.materials.material_name}`);
      lines.push(`Lot: ${x.lot_no}`);
      lines.push(`คงเหลือ: ${x.remaining_qty} ${x.materials.unit}`);
      lines.push(`หมดอายุ: ${x.expiry_date}`);
      lines.push(d < 0 ? `สถานะ: หมดอายุแล้ว ${Math.abs(d)} วัน` : `เหลือ: ${d} วัน`);
      lines.push("");
    });

    const r = await fetch(process.env.DINGTALK_WEBHOOK_URL,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({msgtype:"text",text:{content:lines.join("\n")}})
    });
    const text = await r.text();
    if (!r.ok) throw new Error(text);
    return json(200,{ok:true,count:lots.length,response:text});
  } catch(e) {
    return json(500,{ok:false,error:e.message});
  }
};
function json(statusCode, body){return {statusCode,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)};}
