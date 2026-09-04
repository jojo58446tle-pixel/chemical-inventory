(() => {
"use strict";
const cfg = window.APP_CONFIG || {};
const app = document.querySelector("#app");
const TOKEN_KEY = "chemical_admin_token";
let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
let sb = null;
const $=(s,e=document)=>e.querySelector(s), $$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const fmt=n=>Number(n||0).toLocaleString("th-TH",{maximumFractionDigits:3});
const today=()=>new Date().toISOString().slice(0,10);
const daysLeft=d=>Math.ceil((new Date(d+"T23:59:59")-new Date())/86400000);
const addMonths=(dateText,months)=>{if(!dateText||!(months>=0))return"";const d=new Date(`${dateText}T12:00:00`),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+Number(months));const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return d.toISOString().slice(0,10);};
const shelfMonths=value=>{const m=String(value||"").match(/\d+/);return m?Number(m[0]):0;};
const addMonthsSafe=(dateText,months)=>addMonths(dateText,months);
const dateDiffDays=(from,to)=>Math.floor((new Date(to+"T12:00:00")-new Date(from+"T12:00:00"))/86400000);
const percentRemaining=(mfg,exp)=>{if(!mfg||!exp)return null;const total=dateDiffDays(mfg,exp),left=dateDiffDays(today(),exp);if(!(total>0))return null;return Math.max(0,Math.min(100,Math.round(left/total*100)));};
const expiryStatus=(exp)=>{if(!exp)return null;const d=daysLeft(exp);return d<0?{key:"EXPIRED",className:"red",label:"EXPIRED"}:d<=180?{key:"EXPIRING_SOON",className:"orange",label:"EXPIRING SOON"}:{key:"VALID",className:"green",label:"VALID"};};
function parseChemicalQr(raw){
  const text=String(raw||"").trim();if(!text)return null;
  try{const j=JSON.parse(text);return {supplier:j.supplier_code||j.supplier||j.SupplierCode||j.Supplier,code:j.material_code||j.material||j.MaterialCode||j.Material,lot:j.lot||j.lot_no||j.Lot,mfg:j.mfg_date||j.mfg||j.MFGDate||j.MFG};}catch(_error){}
  const result={};
  text.split(/[\n;]+/).forEach(part=>{const p=part.split(/[:=]/);if(p.length<2)return;const k=p.shift().trim().toLowerCase().replace(/[\s_-]/g,""),v=p.join(":").trim();if(/supplier|vendor/.test(k))result.supplier=v;else if(/material|matcode|item/.test(k))result.code=v;else if(/lot|batch/.test(k))result.lot=v;else if(/mfg|manufactur|productiondate/.test(k))result.mfg=v;});
  if(!result.supplier||!result.code||!result.lot||!result.mfg){const p=text.split(/[_|,\t]/).map(x=>x.trim()).filter(Boolean);if(p.length>=4)return {supplier:p[0],code:p[1],lot:p[2],mfg:p[3]};}
  return result.supplier&&result.code&&result.lot&&result.mfg?result:null;
}
function normalizeQrDate(value){const v=String(value||"").trim();if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;let m=v.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);if(m)return `${m[3]}-${m[2]}-${m[1]}`;m=v.match(/^(\d{4})(\d{2})(\d{2})$/);if(m)return `${m[1]}-${m[2]}-${m[3]}`;m=v.match(/^(\d{2})(\d{2})(\d{2})$/);return m?`20${m[1]}-${m[2]}-${m[3]}`:"";}

function tokenIsValid(token){
  try{
    const payload=JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
    return Number(payload.exp||0)*1000>Date.now()+30000;
  }catch(_error){
    return false;
  }
}

function createDatabaseClient(token){
  if(!cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY){
    throw new Error("ยังไม่ได้ตั้งค่า Supabase ใน config.js");
  }
  return window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_PUBLISHABLE_KEY,
    {
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${token}`}}
    }
  );
}

async function init(){
  if(adminToken && tokenIsValid(adminToken)){
    sb=createDatabaseClient(adminToken);
    mount();
  }else{
    sessionStorage.removeItem(TOKEN_KEY);
    adminToken="";
    login();
  }
}
function login(){
  app.innerHTML=`<main class="login"><section class="login-card"><div class="brand">⚗️</div><h1>ระบบคลังสารเคมี</h1><div class="muted">Chemical Inventory System</div>
  <form id="login" class="stack">
    <label>ชื่อผู้ใช้<input id="username" autocomplete="username" required></label>
    <label>รหัสผ่าน<input id="password" type="password" autocomplete="current-password" required></label>
    <button class="primary">เข้าสู่ระบบ</button>
    <div id="err" class="error"></div>
  </form></section></main>`;
  $("#login").onsubmit=async e=>{
    e.preventDefault();
    const button=$("#login button");
    const err=$("#err");
    button.disabled=true;
    button.textContent="กำลังเข้าสู่ระบบ...";
    err.textContent="";
    try{
      const response=await fetch("/.netlify/functions/login",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          username:$("#username").value.trim(),
          password:$("#password").value
        })
      });
      const result=await response.json();
      if(!response.ok||!result.ok) throw new Error(result.error||"Login failed");
      adminToken=result.access_token;
      sessionStorage.setItem(TOKEN_KEY,adminToken);
      sb=createDatabaseClient(adminToken);
      mount();
    }catch(error){
      err.textContent="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";
    }finally{
      button.disabled=false;
      button.textContent="เข้าสู่ระบบ";
    }
  };
}
function mount(){
  app.innerHTML=`<div class="shell"><header class="topbar"><button id="menu" class="icon">☰</button><div class="grow"><b id="title">Dashboard</b><div class="tiny">Material Shelf-Life & Storage Control</div></div><button id="logout" class="icon">⎋</button></header><main id="page" class="page"></main>
  <nav class="bottom"><button data-page="dashboard">⌂<span>หน้าหลัก</span></button><button data-page="materialCheck">⌕<span>ตรวจวัสดุ</span></button><button data-page="receive">⇩<span>Chemical</span></button><button data-page="stock">▣<span>คงคลัง</span></button><button data-page="more">☰<span>เมนู</span></button></nav></div>`;
  $("#logout").onclick=()=>{sessionStorage.removeItem(TOKEN_KEY);adminToken="";sb=null;login();};$("#menu").onclick=()=>render("more");$$(".bottom button").forEach(b=>b.onclick=()=>render(b.dataset.page));render("dashboard");
}
async function render(name){
  const titles={dashboard:"Dashboard",materialCheck:"ตรวจอายุและการจัดเก็บวัสดุ",masterData:"Material Master Data",receive:"รับเข้าสารเคมี",issue:"เบิกจ่ายสารเคมี",stock:"คงคลังสารเคมี",alerts:"แจ้งเตือน",history:"ประวัติ",report:"รายงาน",more:"เมนู"};
  $("#title").textContent=titles[name]||name;$$(".bottom button").forEach(b=>b.classList.toggle("active",b.dataset.page===name));$("#page").innerHTML='<div class="loading">กำลังโหลด...</div>';
  try{await ({dashboard,materialCheck,masterData,receive,issue,stock,alerts,history,report,more}[name]||dashboard)();}catch(e){console.error(e);$("#page").innerHTML=`<div class="card error">${esc(e.message)}</div>`;}
}
async function getLots(){const {data,error}=await sb.from("chemical_lots").select("*,materials(*)").eq("is_active",true).order("received_date");if(error)throw error;return data||[];}
function lotCard(l){const d=daysLeft(l.expiry_date),c=d<0||d<=30?"red":d<=180?"orange":"green";return `<div class="item"><div class="row"><div><b>${esc(l.materials?.material_code)} — ${esc(l.materials?.material_name)}</b><div class="muted">Lot ${esc(l.lot_no)}</div></div><span class="badge ${c}">${d<0?`หมดอายุ ${Math.abs(d)} วัน`:`เหลือ ${d} วัน`}</span></div><div class="row"><span>คงเหลือ ${fmt(l.remaining_qty)} ${esc(l.unit||l.materials?.unit)}</span><span>Exp ${esc(l.expiry_date)}</span></div></div>`;}
async function dashboard(){
  const lots=await getLots(),a=lots.filter(x=>+x.remaining_qty>0),near=[...a].sort((x,y)=>x.expiry_date.localeCompare(y.expiry_date)).slice(0,5);
  $("#page").innerHTML=`<div class="grid"><div class="card kpi green">Material<b>${new Set(a.map(x=>x.material_id)).size}</b></div><div class="card kpi blue">Lot<b>${a.length}</b></div><div class="card kpi orange">ใกล้หมดอายุ<b>${a.filter(x=>daysLeft(x.expiry_date)<=180&&daysLeft(x.expiry_date)>=0).length}</b></div><div class="card kpi red">หมดอายุ<b>${a.filter(x=>daysLeft(x.expiry_date)<0).length}</b></div></div><div class="section"><h2>ใกล้หมดอายุ</h2><button data-go="alerts" class="secondary">ดูทั้งหมด</button></div><div class="list">${near.length?near.map(lotCard).join(""):'<div class="card muted">ยังไม่มีข้อมูล</div>'}</div><div class="section"><h2>เมนูลัด</h2></div><div class="grid"><button data-go="materialCheck" class="card">🔎<br><b>ตรวจวัสดุ</b></button><button data-go="receive" class="card">🧪<br><b>รับ Chemical</b></button><button data-go="issue" class="card">📤<br><b>เบิก Chemical</b></button><button data-go="stock" class="card">📦<br><b>คงคลัง Chemical</b></button></div>`;bindGo();
}
async function receive(){
  $("#page").innerHTML=`<div class="form">
    <div class="scanner"><b>สแกน QR Label — 4 ส่วน</b><div class="muted tiny">Supplier Code • Material Code • Lot • MFG Date</div><button id="scan" class="secondary">เปิดกล้องสแกน</button><div id="reader"></div><div id="scanResult" class="tiny muted"></div></div>
    <div class="inline"><label>Supplier Code<input id="supplier"></label><label>Material Code<input id="code"></label></div>
    <label>Lot<input id="lot"></label>
    <div id="master" class="card muted">สแกนหรือกรอก Material Code</div>
    <label>Material Name<input id="materialName" placeholder="กรอกชื่อ Material"></label>
    <div class="inline"><label>Product Name (ใส่ NA ได้)<input id="productName" placeholder="เช่น Cleaner X100 หรือ NA"></label><label>Brand<input id="brand" placeholder="เช่น 3M, TOA หรือ NA"></label></div>
    <div class="inline"><label>Shelf Life<input id="shelfLife" inputmode="numeric" placeholder="เช่น 24 เดือน"></label><label>Storage Condition<input id="storage" placeholder="เช่น เก็บในที่แห้ง"></label></div>
    <button id="saveMaster" class="secondary hidden">บันทึก Material Master</button>
    <div class="inline"><label>Qty (จำนวนรับเข้า)<input id="qty" type="number" min="0.001" step="0.001"></label><label>Unit (หน่วย)<input id="unit" placeholder="กรอกเอง เช่น Bottle"></label></div>
    <label>Package Size<input id="packageSize" placeholder="เช่น 20 L / Can"></label>
    <div class="inline"><label>Receive Date (วันที่รับเข้า)<input id="rdate" type="date" value="${today()}"></label><label>MFG Date from QR (วันที่ผลิตจาก QR ส่วนที่ 4)<input id="mfgQr" type="date"></label></div>
    <label>MFG Date from Product Label (วันที่ผลิตจากฉลากสินค้า)<input id="mfgLabel" type="date"></label>
    <div id="mfgWarning" class="card warning hidden"><b>วันที่ผลิตไม่ตรงกัน</b><div>กรุณาเลือกวันที่ที่จะใช้คำนวณและระบบจะบันทึก Log</div><label><input type="radio" name="mfgSource" value="QR"> ใช้วันที่จาก QR</label><label><input type="radio" name="mfgSource" value="LABEL"> ใช้วันที่จากฉลากสินค้า</label></div>
    <label>Expiry Date (วันหมดอายุ) = MFG Date + Shelf Life<input id="exp" type="date" readonly></label>
    <label>Location<input id="location" placeholder="เช่น Chemical Room / Rack A-01"></label>
    <button id="save" class="primary">บันทึกรับเข้าสารเคมี</button>
  </div>`;
  let mat=null;
  const lookup=async()=>{const code=$("#code").value.trim();if(!code)return;const {data,error}=await sb.from("materials").select("*").eq("material_code",code).maybeSingle();if(error)throw error;mat=data;if(mat){$("#master").className="card";$("#master").innerHTML="<b>พบ Material Master — แก้ไขข้อมูลได้</b>";$("#materialName").value=mat.material_name||"";$("#shelfLife").value=mat.shelf_life_months?`${mat.shelf_life_months} เดือน`:"";$("#storage").value=mat.storage_condition||"";$("#saveMaster").classList.add("hidden");}else{$("#master").className="card warning";$("#master").innerHTML="Material Code ใหม่ — กรุณากรอกข้อมูลและบันทึก Material Master";$("#materialName").value="";$("#shelfLife").value="";$("#storage").value="";$("#saveMaster").classList.remove("hidden");}calculate();};
  const masterPayload=()=>({material_code:$("#code").value.trim(),material_name:$("#materialName").value.trim(),shelf_life_months:shelfMonths($("#shelfLife").value),storage_condition:$("#storage").value.trim(),supplier:$("#supplier").value.trim()||null});
  const saveMaster=async(showMessage=true)=>{const p=masterPayload();if(!p.material_code||!p.material_name||!(p.shelf_life_months>0)||!p.storage_condition)throw new Error("กรอก Material Name, Shelf Life และ Storage Condition ให้ครบ");const {data,error}=await sb.from("materials").upsert(p,{onConflict:"material_code"}).select().single();if(error)throw error;mat=data;$("#saveMaster").classList.add("hidden");$("#master").className="card";$("#master").innerHTML="<b>บันทึก Material Master แล้ว — ยังแก้ไขได้</b>";if(showMessage)alert("บันทึก Material Master แล้ว");return data;};
  const chosenMfg=()=>{const q=$("#mfgQr").value,l=$("#mfgLabel").value;if(q&&l&&q!==l){const s=$("input[name=mfgSource]:checked")?.value;return s==="QR"?q:s==="LABEL"?l:"";}return l||q;};
  const calculate=()=>{$("#exp").value=addMonths(chosenMfg(),shelfMonths($("#shelfLife").value));};
  const checkMfg=()=>{const q=$("#mfgQr").value,l=$("#mfgLabel").value,mismatch=q&&l&&q!==l;$("#mfgWarning").classList.toggle("hidden",!mismatch);if(!mismatch)$$('input[name="mfgSource"]').forEach(x=>x.checked=false);calculate();};
  $("#code").onchange=lookup;$("#shelfLife").oninput=calculate;$("#mfgQr").onchange=checkMfg;$("#mfgLabel").onchange=checkMfg;$$('input[name="mfgSource"]').forEach(x=>x.onchange=calculate);$("#saveMaster").onclick=async()=>{try{await saveMaster();}catch(e){alert(e.message);}};
  $("#scan").onclick=()=>scan("reader",async raw=>{const q=parseChemicalQr(raw);if(!q)return alert("อ่าน QR ไม่สำเร็จ: QR ต้องมี Supplier Code, Material Code, Lot และ MFG Date");$("#supplier").value=q.supplier;$("#code").value=q.code;$("#lot").value=q.lot;$("#mfgQr").value=normalizeQrDate(q.mfg);$("#scanResult").textContent=`สแกนสำเร็จ: ${q.supplier} • ${q.code} • ${q.lot} • ${q.mfg}`;await lookup();checkMfg();});
  $("#save").onclick=async()=>{try{const code=$("#code").value.trim(),supplier=$("#supplier").value.trim(),lot=$("#lot").value.trim(),qty=+$("#qty").value,unit=$("#unit").value.trim(),product=$("#productName").value.trim(),brand=$("#brand").value.trim(),pack=$("#packageSize").value.trim(),rd=$("#rdate").value,q=$("#mfgQr").value,l=$("#mfgLabel").value,mfg=chosenMfg(),ex=$("#exp").value,location=$("#location").value.trim();if(!code||!supplier||!lot||!(qty>0)||!unit||!product||!brand||!pack||!rd||!q||!mfg||!ex||!location)return alert("กรอกข้อมูลให้ครบ (Product Name และ Brand ใส่ NA ได้)");if(q&&l&&q!==l&&!$("input[name=mfgSource]:checked"))return alert("วันที่ผลิตไม่ตรงกัน กรุณาเลือกวันที่ที่จะใช้");await saveMaster(false);const {data:lotId,error}=await sb.rpc("receive_stock_v1",{p_material_id:mat.id,p_supplier_code:supplier,p_lot_no:lot,p_qty:qty,p_unit:unit,p_product_name:product,p_brand:brand,p_package_size:pack,p_received_date:rd,p_mfg_qr_date:q,p_mfg_label_date:l||null,p_mfg_used_date:mfg,p_mfg_source:q&&l&&q!==l?$("input[name=mfgSource]:checked").value:"QR",p_expiry_date:ex,p_location:location});if(error)throw error;let message="บันทึกรับเข้าสารเคมีแล้ว";try{const alertResult=await triggerExpiryAlertNow(lotId);if(alertResult.sent)message=`บันทึกรับเข้าแล้ว และแจ้ง DingTalk ระดับ ${alertResult.level} เดือนแล้ว`;}catch(alertError){console.error("DingTalk alert failed",alertError);message=`บันทึกรับเข้าแล้ว แต่ส่ง DingTalk ไม่สำเร็จ: ${alertError.message}`;}alert(message);render("dashboard");}catch(e){console.error(e);alert(`บันทึกไม่สำเร็จ: ${e.message}`);}};
}
async function issue(){
  $("#page").innerHTML=`<div class="form"><div class="scanner"><b>สแกนบาร์โค้ด</b><button id="scan" class="secondary">เปิดกล้องสแกน</button><div id="reader"></div></div><label>Material Code<input id="code"></label><div id="fifo" class="card muted">ระบบจะแนะนำ Lot ตาม FIFO</div><label>เลือก Lot<select id="lot"><option value="">—</option></select></label><label>จำนวนเบิก<input id="qty" type="number" min="0.001" step="0.001"></label><label>เหตุผลกรณีเปลี่ยน Lot<input id="note"></label><button id="save" class="success">บันทึกเบิกจ่าย</button></div>`;
  let lots=[];const lookup=async()=>{const {data,error}=await sb.from("chemical_lots").select("*,materials!inner(*)").eq("materials.material_code",$("#code").value.trim()).eq("is_active",true).gt("remaining_qty",0).order("received_date");if(error)throw error;lots=data||[];$("#lot").innerHTML='<option value="">— เลือก Lot —</option>'+lots.map((l,i)=>`<option value="${l.id}">${i===0?"⭐ FIFO • ":""}${esc(l.lot_no)} • เหลือ ${fmt(l.remaining_qty)} ${esc(l.unit||l.materials.unit)} • รับ ${esc(l.received_date)}</option>`).join("");if(lots[0])$("#lot").value=lots[0].id;$("#fifo").innerHTML=lots.length?`<div class="fifo card"><b>แนะนำ Lot ตาม FIFO: ${esc(lots[0].lot_no)}</b><div>รับเข้าก่อนสุด ${esc(lots[0].received_date)}</div></div>`:"ไม่พบ Stock";};
  $("#code").onchange=lookup;$("#scan").onclick=()=>scan("reader",v=>{$("#code").value=v;lookup();});
  $("#save").onclick=async()=>{
    const chosen=lots.find(x=>x.id===$("#lot").value),qty=+$("#qty").value,note=$("#note").value.trim();
    if(!chosen||!(qty>0))return alert("กรอกข้อมูลให้ครบ");
    if(qty>+chosen.remaining_qty)return alert("จำนวนมากกว่าคงเหลือ");
    const fifo=chosen.id===lots[0].id;
    if(!fifo&&!note)return alert("กรุณาระบุเหตุผลเมื่อไม่เลือก Lot FIFO");
    if(!fifo&&!confirm("Lot นี้ไม่ใช่ Lot แนะนำตาม FIFO ยืนยันต่อหรือไม่?"))return;
    const button=$("#save"),originalText=button.textContent,moveNote=fifo?"FIFO":`ไม่ตาม FIFO: ${note}`;
    button.disabled=true;button.textContent="กำลังบันทึก...";
    try{
      // ใช้ RPC เดิมก่อน เพื่อรักษา flow ของโปรเจกต์ Work ไว้เหมือนเดิม
      const rpcResult=await sb.rpc("issue_stock",{p_lot_id:chosen.id,p_qty:qty,p_note:moveNote});
      if(rpcResult.error){
        console.warn("issue_stock RPC failed; using safe authenticated fallback",rpcResult.error);
        // Fallback ใช้ Supabase client เดิม + JWT เดิมจากหน้าเว็บ ไม่ต้องเพิ่ม ENV/Function/SQL
        const {data:fresh,error:freshError}=await sb.from("chemical_lots").select("id,material_id,remaining_qty").eq("id",chosen.id).single();
        if(freshError)throw freshError;
        const before=Number(fresh.remaining_qty||0);
        if(qty>before)throw new Error("จำนวนมากกว่าคงเหลือปัจจุบัน");
        const after=Number((before-qty).toFixed(3));
        const {data:updated,error:updateError}=await sb.from("chemical_lots").update({remaining_qty:after}).eq("id",chosen.id).eq("remaining_qty",before).select("id,remaining_qty");
        if(updateError)throw updateError;
        if(!updated||updated.length!==1)throw new Error("Stock มีการเปลี่ยนแปลงจากอุปกรณ์อื่น กรุณาลองใหม่");
        const {error:moveError}=await sb.from("stock_movements").insert({movement_type:"OUT",material_id:fresh.material_id,lot_id:chosen.id,qty:qty,note:moveNote,performed_by:null});
        if(moveError){
          const {error:rollbackError}=await sb.from("chemical_lots").update({remaining_qty:before}).eq("id",chosen.id).eq("remaining_qty",after);
          if(rollbackError)console.error("Stock rollback failed",rollbackError);
          throw moveError;
        }
      }
      alert("บันทึกเบิกจ่ายแล้ว");
      render("stock");
    }catch(error){
      console.error("Issue stock failed",error);
      alert(`บันทึกเบิกจ่ายไม่สำเร็จ: ${error?.message||"เกิดข้อผิดพลาด"}`);
    }finally{
      button.disabled=false;button.textContent=originalText;
    }
  };
}
async function stock(){const lots=(await getLots()).filter(x=>+x.remaining_qty>0);$("#page").innerHTML=`<label>ค้นหา<input id="search" placeholder="Material / Lot"></label><div class="list" style="margin-top:12px">${lots.length?lots.map(l=>`<div class="item s" data-search="${esc(l.materials.material_code)} ${esc(l.materials.material_name)} ${esc(l.lot_no)}"><div class="row"><b>${esc(l.materials.material_code)} — ${esc(l.materials.material_name)}</b><strong>${fmt(l.remaining_qty)} ${esc(l.unit||l.materials.unit)}</strong></div><div class="muted">Lot ${esc(l.lot_no)} • รับ ${esc(l.received_date)} • Exp ${esc(l.expiry_date)}</div><div class="lot-actions"><button class="secondary edit-lot" data-id="${l.id}">แก้ไข</button><button class="danger cancel-lot" data-id="${l.id}">ลบรายการ</button></div></div>`).join(""):'<div class="card muted">ยังไม่มี Stock</div>'}</div>`;$("#search").oninput=e=>$$(".s").forEach(x=>x.classList.toggle("hidden",!x.dataset.search.toLowerCase().includes(e.target.value.toLowerCase())));$$('.edit-lot').forEach(b=>b.onclick=()=>editStockLot(lots.find(x=>x.id===b.dataset.id)));$$('.cancel-lot').forEach(b=>b.onclick=()=>cancelStockLot(lots.find(x=>x.id===b.dataset.id)));}

async function editStockLot(l){
  $("#title").textContent="แก้ไขรายการคงคลัง";
  $("#page").innerHTML=`<div class="form">
    <div class="card warning"><b>การแก้ไขจะถูกบันทึกประวัติ</b><div>จำนวนคงเหลือจะคำนวณใหม่โดยหักจำนวนที่เคยเบิกแล้ว</div></div>
    <div class="inline"><label>Supplier Code<input id="eSupplier" value="${esc(l.supplier_code||l.materials?.supplier||"")}"></label><label>Material Code<input id="eCode" value="${esc(l.materials?.material_code||"")}"></label></div>
    <label>Material Name<input id="eMaterialName" value="${esc(l.materials?.material_name||"")}"></label>
    <div class="inline"><label>Shelf Life<input id="eShelf" inputmode="numeric" value="${l.materials?.shelf_life_months?esc(l.materials.shelf_life_months)+" เดือน":""}" placeholder="เช่น 24 เดือน"></label><label>Storage Condition<input id="eStorage" value="${esc(l.materials?.storage_condition||"")}" placeholder="เช่น เก็บในที่แห้ง"></label></div>
    <div class="inline"><label>Lot<input id="eLot" value="${esc(l.lot_no)}"></label><label>Qty รับเข้าทั้งหมด<input id="eQty" type="number" min="0.001" step="0.001" value="${esc(l.received_qty)}"></label></div>
    <div class="inline"><label>Product Name<input id="eProduct" value="${esc(l.product_name||"NA")}"></label><label>Brand<input id="eBrand" value="${esc(l.brand||"NA")}"></label></div>
    <div class="inline"><label>Unit<input id="eUnit" value="${esc(l.unit||l.materials?.unit||"")}"></label><label>Package Size<input id="ePack" value="${esc(l.package_size||"")}"></label></div>
    <div class="inline"><label>Receive Date (วันที่รับเข้า)<input id="eReceive" type="date" value="${esc(l.received_date||"")}"></label><label>MFG Date from QR<input id="eMfgQr" type="date" value="${esc(l.mfg_qr_date||l.mfg_used_date||"")}"></label></div>
    <label>MFG Date from Product Label<input id="eMfgLabel" type="date" value="${esc(l.mfg_label_date||"")}"></label>
    <label>Expiry Date (วันหมดอายุ) = MFG Date + Shelf Life<input id="eExpiry" type="date" value="${esc(l.expiry_date||"")}" readonly></label>
    <label>Location<input id="eLocation" value="${esc(l.storage_location||"")}"></label>
    <label>เหตุผลที่แก้ไข<input id="eReason" placeholder="เช่น กรอก Lot หรือจำนวนผิด"></label>
    <div class="actions"><button id="eBack" class="secondary">ยกเลิก</button><button id="eSave" class="primary">บันทึกการแก้ไข</button></div>
  </div>`;
  const recalculateEditExpiry=()=>{const q=$("#eMfgQr").value,label=$("#eMfgLabel").value,mfg=label||q,months=shelfMonths($("#eShelf").value);$("#eExpiry").value=addMonths(mfg,months);};
  $("#eShelf").oninput=recalculateEditExpiry;$("#eMfgQr").onchange=recalculateEditExpiry;$("#eMfgLabel").onchange=recalculateEditExpiry;
  $("#eBack").onclick=()=>render("stock");
  $("#eSave").onclick=async()=>{try{const code=$("#eCode").value.trim(),reason=$("#eReason").value.trim(),materialName=$("#eMaterialName").value.trim(),months=shelfMonths($("#eShelf").value),storage=$("#eStorage").value.trim();if(!reason)return alert("กรุณาระบุเหตุผลที่แก้ไข");if(!materialName||!(months>0)||!storage)return alert("กรอก Material Name, Shelf Life และ Storage Condition ให้ครบ");const {data:mat,error:matError}=await sb.from("materials").select("id").eq("material_code",code).maybeSingle();if(matError)throw matError;if(!mat)return alert("ไม่พบ Material Code นี้ใน Material Master");const {error:masterError}=await sb.from("materials").update({material_name:materialName,shelf_life_months:months,storage_condition:storage,supplier:$("#eSupplier").value.trim()||null}).eq("id",mat.id);if(masterError)throw masterError;const q=$("#eMfgQr").value,label=$("#eMfgLabel").value,used=label||q,source=label&&q&&label!==q?"LABEL":"QR";recalculateEditExpiry();const {error}=await sb.rpc("update_chemical_lot_v1",{p_lot_id:l.id,p_material_id:mat.id,p_supplier_code:$("#eSupplier").value.trim(),p_lot_no:$("#eLot").value.trim(),p_received_qty:+$("#eQty").value,p_unit:$("#eUnit").value.trim(),p_product_name:$("#eProduct").value.trim()||"NA",p_brand:$("#eBrand").value.trim()||"NA",p_package_size:$("#ePack").value.trim(),p_received_date:$("#eReceive").value,p_mfg_qr_date:q||null,p_mfg_label_date:label||null,p_mfg_used_date:used||null,p_mfg_source:source,p_expiry_date:$("#eExpiry").value,p_location:$("#eLocation").value.trim(),p_reason:reason});if(error)throw error;let message="แก้ไขรายการแล้ว";try{const alertResult=await triggerExpiryAlertNow(l.id);if(alertResult.sent)message=`แก้ไขแล้ว และแจ้ง DingTalk ระดับ ${alertResult.level} เดือนแล้ว`;}catch(alertError){console.error("DingTalk alert failed",alertError);message=`แก้ไขรายการแล้ว แต่ส่ง DingTalk ไม่สำเร็จ: ${alertError.message}`;}alert(message);render("stock");}catch(e){console.error(e);alert("แก้ไขไม่สำเร็จ: "+e.message);}};
}

async function materialCheck(){
  $("#page").innerHTML=`<div class="lookup-hero"><div class="tiny muted">GENERAL MATERIAL • LOOKUP / VERIFICATION</div><h2>ค้นหาด้วย Material Code หรือ Material Group</h2><div class="search-row"><input id="lookupQuery" autocomplete="off" autocapitalize="characters" placeholder="เช่น SD000197 หรือ S003D0"><button id="lookupBtn" class="primary">ค้นหา</button></div><div class="tiny muted">General Material เป็น Lookup เท่านั้น — ไม่สร้าง Stock ซ้ำกับ WMS</div></div><div id="lookupResult" class="lookup-result"><div class="card muted">กรอก Material Code หรือ Material Group เพื่อเริ่มค้นหา</div></div>`;
  const run=async()=>{const q=$("#lookupQuery").value.trim();if(!q)return;const box=$("#lookupResult");box.innerHTML='<div class="loading">กำลังค้นหา Master...</div>';try{const r=await fetch(`/.netlify/functions/material-master?q=${encodeURIComponent(q)}`,{headers:{Authorization:`Bearer ${adminToken}`}});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||"ค้นหาไม่สำเร็จ");if(!j.found){box.innerHTML=`<div class="card warning"><b>ไม่พบข้อกำหนดใน Master</b><div class="muted">${esc(j.input)}</div><div class="tiny">ระบบจะไม่เดา Material Group หรือ Shelf Life ให้เอง</div></div>`;return;}renderMaterialResult(j);}catch(e){box.innerHTML=`<div class="card error">${esc(e.message)}</div>`;}};
  $("#lookupBtn").onclick=run;$("#lookupQuery").onkeydown=e=>{if(e.key==="Enter")run();};
}
function renderMaterialResult(j){
  const records=(j.records&&j.records.length?j.records:[j.record]).filter(Boolean),r=records[0]||{},codes=j.material_codes||[];
  const monthSet=[...new Set(records.map(x=>Number(x.shelf_life_months||0)).filter(Boolean))];
  const months=monthSet.length===1?monthSet[0]:0;
  const variants=records.map((v,i)=>`<div class="variant-card"><div class="row"><b>${records.length>1?`Storage Variant ${i+1}`:'Storage Requirement'}</b><span class="badge blue">${esc(v.shelf_life||'—')}</span></div><div class="variant-grid"><div><span>Temperature</span><b>${esc(v.temperature||'—')}</b></div><div><span>Humidity</span><b>${esc(v.humidity||'—')}</b></div><div><span>Packaging</span><b>${esc(v.packaging||'—')}</b></div><div><span>Remark / Condition</span><b>${esc(v.remark||'—')}</b></div></div></div>`).join('');
  $("#lookupResult").innerHTML=`<div class="material-head"><div><div class="tiny muted">${j.search_type==="material_code"?"MATERIAL CODE":"MATERIAL GROUP"}</div><h2>${esc(j.material_code||j.material_group)}</h2><div class="muted">Group: <b>${esc(j.material_group)}</b>${j.mapped_group&&j.mapped_group!==j.material_group?` <span class="tiny">(Mapped: ${esc(j.mapped_group)})</span>`:''}</div></div><span class="badge blue">${esc(r.main_category_en||r.main_category_th||"Material")}</span></div>
  <div class="info-grid"><div class="info-card"><span>Material Type</span><b>${esc(r.material_type_en||r.material_type_th||"—")}</b><small>${esc(r.material_type_th||"")}</small></div><div class="info-card emphasis"><span>Shelf Life</span><b>${records.length>1&&monthSet.length>1?'Multiple Conditions':esc(r.shelf_life||"—")}</b></div><div class="info-card"><span>Sub Category</span><b>${esc(r.sub_category_en||r.sub_category_th||"—")}</b></div><div class="info-card"><span>Moisture Sensitive</span><b>${esc(r.moisture_sensitive||"—")}</b></div></div>
  ${records.length>1?`<div class="card warning"><b>Master มี ${records.length} เงื่อนไขสำหรับ Group เดียวกัน</b><div class="tiny">ระบบแสดงทุกเงื่อนไขเพื่อไม่เดาว่าวัสดุเป็นชนิด/ผิวแบบใด ให้เทียบกับ Material จริงและ Remark</div></div>`:''}
  <div class="variant-list">${variants}</div>
  <div class="card expiry-box"><div class="section-title">Expiry Check <span class="tiny muted">กรอก Date Code / Manufacturing Date เมื่อต้องการตรวจอายุ</span></div>${months>0?`<div class="inline"><label>Manufacturing Date / Date Code<input id="generalMfg" type="date"></label><label>Expiry Date<input id="generalExp" type="date" readonly></label></div><div id="generalExpiryStatus" class="expiry-status muted">Shelf Life ${months} เดือน</div>`:`<div class="warning-text">Shelf Life ของ Group นี้มีหลายเงื่อนไขหรือไม่สามารถแปลงเป็นจำนวนเดือนได้อัตโนมัติ — ให้เลือก/ยืนยันเงื่อนไขจาก Master ก่อนคำนวณ</div>`}</div>
  <div class="card warehouse-box"><div class="section-title">Warehouse Management Guidance</div><div class="warehouse-grid"><div>↪️ <b>Rotation</b><span>FIFO ตามกระบวนการคลัง</span></div><div>▦ <b>Placement</b><span>ไม่วางพื้นโดยตรง ใช้ Pallet / Rack</span></div><div>≡ <b>Identification</b><span>Material / Lot / สถานะต้องเห็นชัด</span></div><div>⚠️ <b>Abnormal</b><span>Expired / ผิดเงื่อนไข → Hold / Segregate → Quality Review</span></div></div><div class="tiny muted">ระบบแสดง Guidance เท่านั้น ไม่ตัดสิน Pass/Fail แทน Quality และไม่ทำ Stock Transaction แทน WMS</div></div>
  <details class="card"><summary><b>Material Code ใน Group นี้ (${codes.length})</b></summary><div class="code-chips">${codes.length?codes.map(x=>`<span>${esc(x)}</span>`).join(""):"<span class='muted'>ไม่พบ Material Code Mapping</span>"}</div></details>`;
  if(months>0){const calc=()=>{const mfg=$("#generalMfg").value;if(!mfg){$("#generalExp").value="";$("#generalExpiryStatus").className="expiry-status muted";$("#generalExpiryStatus").textContent=`Shelf Life ${months} เดือน`;return;}const exp=addMonthsSafe(mfg,months),d=daysLeft(exp),pct=percentRemaining(mfg,exp),st=expiryStatus(exp);$("#generalExp").value=exp;$("#generalExpiryStatus").className=`expiry-status ${st.className}`;$("#generalExpiryStatus").innerHTML=`<b>${st.label}</b> • ${d<0?`เกินอายุ ${Math.abs(d)} วัน`:`เหลือ ${d} วัน`} • Remaining ${pct==null?"—":pct+"%"}${st.key==="EXPIRED"?'<br><span class="tiny">Action: Hold / Segregate และส่ง Quality Review ตามกระบวนการเดิม</span>':""}`;};$("#generalMfg").onchange=calc;}
}

async function masterData(){
  let stats={mapping_count:0,group_count:0,updated_at:null};try{const r=await fetch('/.netlify/functions/material-master?action=stats',{headers:{Authorization:`Bearer ${adminToken}`}});stats=await r.json();}catch(_e){}
  $("#page").innerHTML=`<div class="card master-summary"><h2>Material Master Data</h2><div class="grid"><div class="kpi blue">Material Mapping<b>${Number(stats.mapping_count||0).toLocaleString()}</b></div><div class="kpi green">Shelf-Life Groups<b>${Number(stats.group_count||0).toLocaleString()}</b></div></div><div class="tiny muted">ฐาน General Material เก็บใน Netlify Blobs แยกจาก Chemical Supabase</div></div>
  <div class="card form"><h3>1) Import Material Code → Material Group</h3><div class="muted tiny">รองรับไฟล์ GridDataExport; ระบบตัดรหัสลงท้าย -P อัตโนมัติ</div><input id="mapFile" type="file" accept=".xlsx,.xls,.csv"><button id="importMap" class="secondary">Import Mapping ไป Netlify Blobs</button><div id="mapMsg" class="tiny"></div></div>
  <div class="card form"><h3>2) Import Shelf-Life / Storage Master</h3><div class="muted tiny">รองรับไฟล์อายุการใช้งานของวัสดุ.xlsx และค้น Header “กลุ่มวัสดุ” อัตโนมัติ</div><input id="shelfFile" type="file" accept=".xlsx,.xls,.csv"><button id="importShelf" class="secondary">Import Shelf-Life Master ไป Netlify Blobs</button><div id="shelfMsg" class="tiny"></div></div>
  <div class="card form"><h3>Backup</h3><button id="exportMaster" class="secondary">Export Master จาก Netlify Blobs (.json)</button></div>`;
  $("#importMap").onclick=()=>importGeneralMapping($("#mapFile").files[0]);$("#importShelf").onclick=()=>importShelfMaster($("#shelfFile").files[0]);$("#exportMaster").onclick=exportGeneralMaster;
}
async function postMaterialMaster(payload){const r=await fetch('/.netlify/functions/material-master',{method:'POST',headers:{Authorization:`Bearer ${adminToken}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'บันทึก Master ไม่สำเร็จ');return j;}
function sheetRows(file){return file.arrayBuffer().then(buf=>{const wb=XLSX.read(buf);return {wb,sheet:wb.Sheets[wb.SheetNames[0]]};});}
function pickHeader(obj,names){for(const name of names){const key=Object.keys(obj).find(k=>String(k).trim().toLowerCase()===String(name).trim().toLowerCase());if(key)return obj[key];}return"";}
async function importGeneralMapping(file){if(!file)return alert('เลือกไฟล์ Mapping ก่อน');const msg=$("#mapMsg");msg.textContent='กำลังอ่านไฟล์...';try{const {sheet}=await sheetRows(file);const rows=XLSX.utils.sheet_to_json(sheet,{defval:""});const out=rows.map(r=>({material_code:String(pickHeader(r,['รหัสวัสดุ','Material Code','Material','Code'])).trim().toUpperCase(),material_group:String(pickHeader(r,['กลุ่มวัสดุ','Material Group','Group'])).trim().toUpperCase()})).filter(x=>x.material_code&&x.material_group&&!x.material_code.endsWith('-P'));const j=await postMaterialMaster({action:'replace_mapping',rows:out});msg.className='tiny success-text';msg.textContent=`Import สำเร็จ ${j.count} Material Code`;await masterData();}catch(e){msg.className='tiny error';msg.textContent=e.message;}}
async function importShelfMaster(file){if(!file)return alert('เลือกไฟล์ Shelf-Life Master ก่อน');const msg=$("#shelfMsg");msg.textContent='กำลังอ่านไฟล์...';try{const {sheet}=await sheetRows(file);const raw=XLSX.utils.sheet_to_json(sheet,{header:1,defval:""});const headerIndex=raw.findIndex(row=>row.some(v=>String(v).trim()==='กลุ่มวัสดุ'));if(headerIndex<0)throw new Error('ไม่พบ Header “กลุ่มวัสดุ” ในไฟล์');const headers=raw[headerIndex].map(x=>String(x).trim());const objects=raw.slice(headerIndex+1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]])));const out=objects.map(r=>({main_category_th:r['ชื่อหมวดหมู่หลัก (ภาษาจีน)']||'',main_category_en:r['ชื่อหมวดหมู่หลัก (ภาษาอังกฤษ)']||'',sub_category_th:r['ชื่อหมวดย่อย']||'',sub_category_en:r['ชื่อหมวดย่อย(อังกฤษ)']||'',material_type_th:r['ชื่อหมวดย่อยเล็ก']||'',material_type_en:r['ชื่อหมวดย่อยเล็ก (อังกฤษ)']||'',material_group:String(r['กลุ่มวัสดุ']||'').trim().toUpperCase(),packaging:r['รูปแบบการบรรจุ']||'',shelf_life:r['อายุการใช้งาน']||'',temperature:r['อุณหภูมิในการจัดเก็บ']||'',humidity:r['ความชื้นในการจัดเก็บ']||'',moisture_sensitive:r['วัสดุไวต่อความชื้น (ใช่/ไม่ใช่)']||'',remark:r['หมายเหตุ']||'',source:'Material Shelf-Life Master'})).filter(x=>x.material_group&&x.shelf_life);const j=await postMaterialMaster({action:'replace_shelf_master',rows:out});msg.className='tiny success-text';msg.textContent=`Import สำเร็จ ${j.count} Material Group`;await masterData();}catch(e){msg.className='tiny error';msg.textContent=e.message;}}
async function exportGeneralMaster(){try{const j=await postMaterialMaster({action:'export'});const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),mapping:j.mapping,master:j.master},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Material_Control_Master_${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){alert(e.message);}}

async function triggerExpiryAlertNow(lotId=null){
  const response=await fetch("/.netlify/functions/check-expiry-now",{method:"POST",headers:{Authorization:`Bearer ${adminToken}`,"Content-Type":"application/json","X-Supabase-Key":cfg.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({lot_id:lotId})});
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.error||"ส่งแจ้งเตือนไม่สำเร็จ");
  return result;
}

async function cancelStockLot(l){
  if(!l||!confirm(`ยืนยันลบรายการ ${l.materials?.material_code} • Lot ${l.lot_no} ออกจากคงคลัง?`))return;
  const reason=prompt("ระบุเหตุผลที่ลบรายการ เช่น บันทึกผิด");
  if(!reason||!reason.trim())return alert("ต้องระบุเหตุผลก่อนลบ");
  try{const {error}=await sb.rpc("cancel_chemical_lot_v1",{p_lot_id:l.id,p_reason:reason.trim()});if(error)throw error;alert("ลบรายการออกจากคงคลังแล้ว และเก็บประวัติไว้");render("stock");}catch(e){console.error(e);alert("ลบไม่สำเร็จ: "+e.message);}
}
async function alerts(){const lots=(await getLots()).filter(x=>+x.remaining_qty>0&&daysLeft(x.expiry_date)<=184).sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date));$("#page").innerHTML=`<div class="actions"><button id="send" class="primary">ตรวจและส่ง DingTalk ตอนนี้</button></div><div class="list" style="margin-top:12px">${lots.length?lots.map(lotCard).join(""):'<div class="card muted">ไม่มีรายการเข้าเงื่อนไข</div>'}</div>`;$("#send").onclick=async()=>{try{const j=await triggerExpiryAlertNow();alert(j.sent?`ส่ง DingTalk แล้ว ${j.count} รายการ`:"ตรวจแล้ว ไม่มีรายการใหม่ที่ต้องแจ้ง");}catch(e){alert(`ส่งไม่สำเร็จ: ${e.message}`);}};}
async function history(){const {data,error}=await sb.from("stock_movements").select("*,materials(*),chemical_lots(*)").order("created_at",{ascending:false}).limit(500);if(error)throw error;$("#page").innerHTML=`<div class="list">${(data||[]).map(m=>`<div class="item"><div class="row"><b>${m.movement_type==="IN"?"รับเข้า":"เบิกจ่าย"} ${esc(m.materials?.material_code)}</b><span>${new Date(m.created_at).toLocaleString("th-TH")}</span></div><div>Lot ${esc(m.chemical_lots?.lot_no)} • ${fmt(m.qty)} ${esc(m.materials?.unit)}</div><div class="muted">${esc(m.note||"")}</div></div>`).join("")||'<div class="card muted">ยังไม่มีประวัติ</div>'}</div>`;}
async function report(){$("#page").innerHTML=`<div class="card form"><h2>Export Excel</h2><div class="muted">Stock, Receiving, Issue และ Expiry Alert</div><button id="export" class="success">📗 Export Excel</button></div>`;$("#export").onclick=exportExcel;}
async function exportExcel(){const lots=await getLots();const {data:mov,error}=await sb.from("stock_movements").select("*,materials(*),chemical_lots(*)").order("created_at");if(error)throw error;const wb=XLSX.utils.book_new();const stock=lots.map(l=>({Material:l.materials.material_code,Name:l.materials.material_name,ProductName:l.product_name,Brand:l.brand,Lot:l.lot_no,MFGDate:l.mfg_used_date,ReceivedDate:l.received_date,ExpiryDate:l.expiry_date,PackageSize:l.package_size,Location:l.storage_location,ReceivedQty:l.received_qty,RemainingQty:l.remaining_qty,Unit:l.unit||l.materials.unit,Supplier:l.supplier_code||l.materials.supplier}));const rec=(mov||[]).filter(x=>x.movement_type==="IN").map(mapMov),iss=(mov||[]).filter(x=>x.movement_type==="OUT").map(mapMov),al=lots.filter(x=>+x.remaining_qty>0&&daysLeft(x.expiry_date)<=180).map(l=>({...stock.find(s=>s.Material===l.materials.material_code&&s.Lot===l.lot_no),DaysLeft:daysLeft(l.expiry_date)}));[["Stock",stock],["Receiving",rec],["Issue",iss],["Expiry_Alert",al]].forEach(([n,r])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(r),n));XLSX.writeFile(wb,`Chemical_Inventory_${today()}.xlsx`);}
function mapMov(m){return {Date:m.created_at,Type:m.movement_type,Material:m.materials?.material_code,Name:m.materials?.material_name,Lot:m.chemical_lots?.lot_no,Qty:m.qty,Unit:m.chemical_lots?.unit||m.materials?.unit,Note:m.note};}
async function more(){$("#page").innerHTML=`<div class="menu"><button data-go="materialCheck">🔎 ตรวจ Shelf Life / Storage</button><button data-go="masterData">🗂️ Material Master Data</button><button data-go="history">🕘 ประวัติการเคลื่อนไหว Chemical</button><button data-go="alerts">🔔 แจ้งเตือนวันหมดอายุ Chemical</button><button data-go="report">📊 รายงาน / Export Excel Chemical</button><button data-go="issue">📤 เบิกจ่าย Chemical</button><button id="import">📥 Import BOM Chemical จาก Excel</button><input id="file" class="hidden" type="file" accept=".xlsx,.xls,.csv"></div>`;bindGo();$("#import").onclick=()=>$("#file").click();$("#file").onchange=importBom;}
async function importBom(e){const file=e.target.files[0];if(!file)return;const wb=XLSX.read(await file.arrayBuffer()),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});const pick=(r,names)=>{for(const n of names){const k=Object.keys(r).find(x=>x.trim().toLowerCase()===n.toLowerCase());if(k)return r[k]}return""};const list=rows.map(r=>({material_code:String(pick(r,["Material Code","Material","Code","รหัสวัสดุ"])).trim(),material_name:String(pick(r,["Material Name","Name","Description","ชื่อวัสดุ"])).trim(),unit:String(pick(r,["Unit","UOM","หน่วย"])).trim(),supplier:String(pick(r,["Supplier","ผู้ขาย"])).trim(),barcode:String(pick(r,["Barcode","บาร์โค้ด"])).trim()||null})).filter(x=>x.material_code&&x.material_name);const {error}=await sb.from("materials").upsert(list,{onConflict:"material_code"});if(error)throw error;alert(`Import BOM สำเร็จ ${list.length} รายการ`);}
function bindGo(){$$("[data-go]").forEach(b=>b.onclick=()=>render(b.dataset.go));}
async function scan(id,cb){const q=new Html5Qrcode(id);try{await q.start({facingMode:"environment"},{fps:10,qrbox:{width:240,height:120}},async t=>{cb(t.trim());await q.stop();$("#"+id).innerHTML="";});}catch(e){alert("เปิดกล้องไม่ได้: "+e.message);}}
init();
})();
