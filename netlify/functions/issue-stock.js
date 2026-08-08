const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    verifyAdminToken(event.headers.authorization || "");

    const { lot_id, qty, note } = JSON.parse(event.body || "{}");
    const issueQty = Number(qty);

    if (!lot_id) return json(400, { ok: false, error: "ไม่พบ Lot ที่ต้องการเบิก" });
    if (!Number.isFinite(issueQty) || issueQty <= 0) {
      return json(400, { ok: false, error: "จำนวนเบิกไม่ถูกต้อง" });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Netlify ยังไม่ได้ตั้งค่า SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: lot, error: lotError } = await supabase
      .from("chemical_lots")
      .select("id,material_id,remaining_qty,is_active")
      .eq("id", lot_id)
      .maybeSingle();

    if (lotError) throw lotError;
    if (!lot || lot.is_active === false) {
      return json(404, { ok: false, error: "ไม่พบ Lot หรือ Lot ถูกยกเลิกแล้ว" });
    }

    const currentQty = Number(lot.remaining_qty);
    if (currentQty < issueQty) {
      return json(409, {
        ok: false,
        error: `Stock ไม่เพียงพอ (คงเหลือ ${currentQty})`
      });
    }

    const newQty = currentQty - issueQty;

    // Compare-and-swap: ป้องกันการเบิกชนกันจากหลายเครื่อง
    const { data: updatedRows, error: updateError } = await supabase
      .from("chemical_lots")
      .update({ remaining_qty: newQty })
      .eq("id", lot_id)
      .eq("remaining_qty", currentQty)
      .select("id,remaining_qty");

    if (updateError) throw updateError;
    if (!updatedRows || updatedRows.length !== 1) {
      return json(409, {
        ok: false,
        error: "Stock มีการเปลี่ยนแปลงจากอีกเครื่อง กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง"
      });
    }

    const { error: movementError } = await supabase
      .from("stock_movements")
      .insert({
        movement_type: "OUT",
        material_id: lot.material_id,
        lot_id,
        qty: issueQty,
        note: String(note || "FIFO"),
        performed_by: null
      });

    if (movementError) {
      // Best-effort rollback: ถ้าบันทึก History ไม่สำเร็จ อย่าปล่อยให้ Stock ถูกหักค้าง
      const { error: rollbackError } = await supabase
        .from("chemical_lots")
        .update({ remaining_qty: currentQty })
        .eq("id", lot_id)
        .eq("remaining_qty", newQty);

      if (rollbackError) {
        console.error("CRITICAL: issue rollback failed", rollbackError);
        throw new Error(`บันทึกประวัติไม่สำเร็จ และ Rollback ไม่สำเร็จ: ${movementError.message}`);
      }
      throw movementError;
    }

    return json(200, {
      ok: true,
      issued_qty: issueQty,
      remaining_qty: newQty
    });
  } catch (error) {
    console.error("issue-stock error:", error);
    const unauthorized = error && error.code === "UNAUTHORIZED";
    return json(unauthorized ? 401 : 500, {
      ok: false,
      error: unauthorized ? "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" : error.message
    });
  }
};

function verifyAdminToken(header) {
  const token = String(header || "").replace(/^Bearer\s+/i, "");
  if (!token || !process.env.SUPABASE_JWT_SECRET) {
    const error = new Error("Unauthorized");
    error.code = "UNAUTHORIZED";
    throw error;
  }
  try {
    jwt.verify(token, process.env.SUPABASE_JWT_SECRET, { algorithms: ["HS256"] });
  } catch (_error) {
    const error = new Error("Unauthorized");
    error.code = "UNAUTHORIZED";
    throw error;
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
