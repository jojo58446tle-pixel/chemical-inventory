const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");

// เบิกจ่ายแบบไม่ต้องใช้ SUPABASE_SERVICE_ROLE_KEY
// ใช้ JWT ของ Admin + Publishable Key เดิมของหน้าเว็บ
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

  try {
    const token = String(event.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token || !process.env.SUPABASE_JWT_SECRET) return json(401, { ok:false, error:"Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" });

    try {
      jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms:["HS256"] });
    } catch (_error) {
      return json(401, { ok:false, error:"Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" });
    }

    const { lot_id, qty, note } = JSON.parse(event.body || "{}");
    const issueQty = Number(qty);
    if (!lot_id) return json(400, { ok:false, error:"ไม่พบ Lot ที่ต้องการเบิก" });
    if (!Number.isFinite(issueQty) || issueQty <= 0) return json(400, { ok:false, error:"จำนวนเบิกไม่ถูกต้อง" });

    const publishableKey = event.headers["x-supabase-key"] || event.headers["X-Supabase-Key"];
    if (!publishableKey) return json(500, { ok:false, error:"ไม่พบ Supabase Publishable Key" });

    // ใช้ URL เดิมของโปรเจกต์เป็น fallback จึงไม่ต้องเพิ่มค่าใหม่ใน Netlify
    const supabaseUrl = process.env.SUPABASE_URL || "https://eknwvgjftjimurlynfmv.supabase.co";
    const supabase = createClient(supabaseUrl, publishableKey, {
      auth:{ persistSession:false, autoRefreshToken:false },
      global:{ headers:{ Authorization:`Bearer ${token}` } }
    });

    const { data:lot, error:lotError } = await supabase
      .from("chemical_lots")
      .select("id,material_id,remaining_qty,is_active")
      .eq("id", lot_id)
      .maybeSingle();
    if (lotError) throw lotError;
    if (!lot || lot.is_active === false) return json(404, { ok:false, error:"ไม่พบ Lot หรือ Lot ถูกยกเลิกแล้ว" });

    const currentQty = Number(lot.remaining_qty);
    if (currentQty < issueQty) return json(409, { ok:false, error:`Stock ไม่เพียงพอ (คงเหลือ ${currentQty})` });
    const newQty = currentQty - issueQty;

    // ป้องกันการเบิกซ้ำ/เบิกชนกันจากหลายเครื่อง
    const { data:updatedRows, error:updateError } = await supabase
      .from("chemical_lots")
      .update({ remaining_qty:newQty })
      .eq("id", lot_id)
      .eq("remaining_qty", currentQty)
      .select("id,remaining_qty");
    if (updateError) throw updateError;
    if (!updatedRows || updatedRows.length !== 1) return json(409, { ok:false, error:"Stock มีการเปลี่ยนแปลงจากอีกเครื่อง กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง" });

    // ไม่ผูกกับ auth.users เพื่อให้เข้ากับระบบ Username/Password ปัจจุบัน
    const { error:movementError } = await supabase
      .from("stock_movements")
      .insert({
        movement_type:"OUT",
        material_id:lot.material_id,
        lot_id,
        qty:issueQty,
        note:String(note || "FIFO"),
        performed_by:null
      });

    if (movementError) {
      // คืน stock ถ้าบันทึก history ไม่สำเร็จ
      const { error:rollbackError } = await supabase
        .from("chemical_lots")
        .update({ remaining_qty:currentQty })
        .eq("id", lot_id)
        .eq("remaining_qty", newQty);
      if (rollbackError) console.error("CRITICAL rollback failed", rollbackError);
      throw movementError;
    }

    return json(200, { ok:true, issued_qty:issueQty, remaining_qty:newQty });
  } catch (error) {
    console.error("issue-stock error:", error);
    return json(500, { ok:false, error:error?.message || "บันทึกเบิกจ่ายไม่สำเร็จ" });
  }
};

function json(statusCode, body){
  return { statusCode, headers:{ "Content-Type":"application/json", "Cache-Control":"no-store" }, body:JSON.stringify(body) };
}
