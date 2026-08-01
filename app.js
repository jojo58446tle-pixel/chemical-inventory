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
  app.innerHTML=`<div class="shell"><header class="topbar"><button id="menu" class="icon">☰</button><div class="grow"><b id="title">Dashboard</b><div class="tiny">Admin Warehouse</div></div><button id="logout" class="icon">⎋</button></header><main id="page" class="page"></main>
  <nav class="bottom"><button data-page="dashboard">⌂<span>หน้าหลัก</span></button><button data-page="receive">⇩<span>รับเข้า</span></button><button data-page="issue">⇧<span>เบิกจ่าย</span></button><button data-page="stock">▣<span>คงคลัง</span></button><button data-page="more">☰<span>เมนู</span></button></nav></div>`;
  $("#logout").onclick=()=>{sessionStorage.removeItem(TOKEN_KEY);adminToken="";sb=null;login();};$("#menu").onclick=()=>render("more");$$(".bottom button").forEach(b=>b.onclick=()=>render(b.dataset.page));render("dashboard");
}
async function render(name){
  const titles={dashboard:"Dashboard",receive:"รับเข้าสารเคมี",issue:"เบิกจ่ายสารเคมี",stock:"คงคลัง",alerts:"แจ้งเตือน",history:"ประวัติ",report:"รายงาน",more:"เมนู"};
  $("#title").textContent=titles[name]||name;$$(".bottom button").forEach(b=>b.classList.toggle("active",b.dataset.page===name));$("#page").innerHTML='<div class="loading">กำลังโหลด...</div>';
  try{await ({dashboard,receive,issue,stock,alerts,history,report,more}[name]||dashboard)();}catch(e){console.error(e);$("#page").innerHTML=`<div class="card error">${esc(e.message)}</div>`;}
}
async function getLots(){const {data,error}=await sb.from("chemical_lots").select("*,materials(*)").eq("is_active",true).order("received_date");if(error)throw error;return data||[];}
function lotCard(l){const d=daysLeft(l.expiry_date),c=d<0||d<=30?"red":d<=180?"orange":"green";return `<div class="item"><div class="row"><div><b>${esc(l.materials?.material_code)} — ${esc(l.materials?.material_name)}</b><div class="muted">Lot ${esc(l.lot_no)}</div></div><span class="badge ${c}">${d<0?`หมดอายุ ${Math.abs(d)} วัน`:`เหลือ ${d} วัน`}</span></div><div class="row"><span>คงเหลือ ${fmt(l.remaining_qty)} ${esc(l.unit||l.materials?.unit)}</span><span>Exp ${esc(l.expiry_date)}</span></div></div>`;}
async function dashboard(){
  const lots=await getLots(),a=lots.filter(x=>+x.remaining_qty>0),near=[...a].sort((x,y)=>x.expiry_date.localeCompare(y.expiry_date)).slice(0,5);
  $("#page").innerHTML=`<div class="grid"><div class="card kpi green">Material<b>${new Set(a.map(x=>x.material_id)).size}</b></div><div class="card kpi blue">Lot<b>${a.length}</b></div><div class="card kpi orange">ใกล้หมดอายุ<b>${a.filter(x=>daysLeft(x.expiry_date)<=180&&daysLeft(x.expiry_date)>=0).length}</b></div><div class="card kpi red">หมดอายุ<b>${a.filter(x=>daysLeft(x.expiry_date)<0).length}</b></div></div><div class="section"><h2>ใกล้หมดอายุ</h2><button data-go="alerts" class="secondary">ดูทั้งหมด</button></div><div class="list">${near.length?near.map(lotCard).join(""):'<div class="card muted">ยังไม่มีข้อมูล</div>'}</div><div class="section"><h2>เมนูลัด</h2></div><div class="grid"><button data-go="receive" class="card">📥<br><b>รับเข้า</b></button><button data-go="issue" class="card">📤<br><b>เบิกจ่าย</b></button><button data-go="stock" class="card">📦<br><b>คงคลัง</b></button><button data-go="report" class="card">📗<br><b>Export Excel</b></button></div>`;bindGo();
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
  $("#save").onclick=async()=>{try{const code=$("#code").value.trim(),supplier=$("#supplier").value.trim(),lot=$("#lot").value.trim(),qty=+$("#qty").value,unit=$("#unit").value.trim(),product=$("#productName").value.trim(),brand=$("#brand").value.trim(),pack=$("#packageSize").value.trim(),rd=$("#rdate").value,q=$("#mfgQr").value,l=$("#mfgLabel").value,mfg=chosenMfg(),ex=$("#exp").value,location=$("#location").value.trim();if(!code||!supplier||!lot||!(qty>0)||!unit||!product||!brand||!pack||!rd||!q||!mfg||!ex||!location)return alert("กรอกข้อมูลให้ครบ (Product Name และ Brand ใส่ NA ได้)");if(q&&l&&q!==l&&!$("input[name=mfgSource]:checked"))return alert("วันที่ผลิตไม่ตรงกัน กรุณาเลือกวันที่ที่จะใช้");await saveMaster(false);const {data:lotId,error}=await sb.rpc("receive_stock_v1",{p_material_id:mat.id,p_supplier_code:supplier,p_lot_no:lot,p_qty:qty,p_unit:unit,p_product_name:product,p_brand:brand,p_package_size:pack,p_received_date:rd,p_mfg_qr_date:q,p_mfg_label_date:l||null,p_mfg_used_date:mfg,p_mfg_source:q&&l&&q!==l?$("input[name=mfgSource]:checked").value:"QR",p_expiry_date:ex,p_location:location});if(error)throw error;const alertResult=await triggerExpiryAlertNow(lotId);alert(alertResult.sent?`บันทึกรับเข้าแล้ว และแจ้ง DingTalk ระดับ ${alertResult.level} เดือนแล้ว`:"บันทึกรับเข้าสารเคมีแล้ว");render("dashboard");}catch(e){console.error(e);alert(`บันทึกไม่สำเร็จ: ${e.message}`);}};
}
async function issue(){
  $("#page").innerHTML=`<div class="form"><div class="scanner"><b>สแกนบาร์โค้ด</b><button id="scan" class="secondary">เปิดกล้องสแกน</button><div id="reader"></div></div><label>Material Code<input id="code"></label><div id="fifo" class="card muted">ระบบจะแนะนำ Lot ตาม FIFO</div><label>เลือก Lot<select id="lot"><option value="">—</option></select></label><label>จำนวนเบิก<input id="qty" type="number" min="0.001" step="0.001"></label><label>เหตุผลกรณีเปลี่ยน Lot<input id="note"></label><button id="save" class="success">บันทึกเบิกจ่าย</button></div>`;
  let lots=[];const lookup=async()=>{const {data,error}=await sb.from("chemical_lots").select("*,materials!inner(*)").eq("materials.material_code",$("#code").value.trim()).eq("is_active",true).gt("remaining_qty",0).order("received_date");if(error)throw error;lots=data||[];$("#lot").innerHTML='<option value="">— เลือก Lot —</option>'+lots.map((l,i)=>`<option value="${l.id}">${i===0?"⭐ FIFO • ":""}${esc(l.lot_no)} • เหลือ ${fmt(l.remaining_qty)} ${esc(l.unit||l.materials.unit)} • รับ ${esc(l.received_date)}</option>`).join("");if(lots[0])$("#lot").value=lots[0].id;$("#fifo").innerHTML=lots.length?`<div class="fifo card"><b>แนะนำ Lot ตาม FIFO: ${esc(lots[0].lot_no)}</b><div>รับเข้าก่อนสุด ${esc(lots[0].received_date)}</div></div>`:"ไม่พบ Stock";};
  $("#code").onchange=lookup;$("#scan").onclick=()=>scan("reader",v=>{$("#code").value=v;lookup();});
  $("#save").onclick=async()=>{const chosen=lots.find(x=>x.id===$("#lot").value),qty=+$("#qty").value,note=$("#note").value.trim();if(!chosen||!(qty>0))return alert("กรอกข้อมูลให้ครบ");if(qty>+chosen.remaining_qty)return alert("จำนวนมากกว่าคงเหลือ");const fifo=chosen.id===lots[0].id;if(!fifo&&!note)return alert("กรุณาระบุเหตุผลเมื่อไม่เลือก Lot FIFO");if(!fifo&&!confirm("Lot นี้ไม่ใช่ Lot แนะนำตาม FIFO ยืนยันต่อหรือไม่?"))return;const {error}=await sb.rpc("issue_stock",{p_lot_id:chosen.id,p_qty:qty,p_note:fifo?"FIFO":`ไม่ตาม FIFO: ${note}`});if(error)throw error;alert("บันทึกเบิกจ่ายแล้ว");render("stock");};
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
  $("#eSave").onclick=async()=>{try{const code=$("#eCode").value.trim(),reason=$("#eReason").value.trim(),materialName=$("#eMaterialName").value.trim(),months=shelfMonths($("#eShelf").value),storage=$("#eStorage").value.trim();if(!reason)return alert("กรุณาระบุเหตุผลที่แก้ไข");if(!materialName||!(months>0)||!storage)return alert("กรอก Material Name, Shelf Life และ Storage Condition ให้ครบ");const {data:mat,error:matError}=await sb.from("materials").select("id").eq("material_code",code).maybeSingle();if(matError)throw matError;if(!mat)return alert("ไม่พบ Material Code นี้ใน Material Master");const {error:masterError}=await sb.from("materials").update({material_name:materialName,shelf_life_months:months,storage_condition:storage,supplier:$("#eSupplier").value.trim()||null}).eq("id",mat.id);if(masterError)throw masterError;const q=$("#eMfgQr").value,label=$("#eMfgLabel").value,used=label||q,source=label&&q&&label!==q?"LABEL":"QR";recalculateEditExpiry();const {error}=await sb.rpc("update_chemical_lot_v1",{p_lot_id:l.id,p_material_id:mat.id,p_supplier_code:$("#eSupplier").value.trim(),p_lot_no:$("#eLot").value.trim(),p_received_qty:+$("#eQty").value,p_unit:$("#eUnit").value.trim(),p_product_name:$("#eProduct").value.trim()||"NA",p_brand:$("#eBrand").value.trim()||"NA",p_package_size:$("#ePack").value.trim(),p_received_date:$("#eReceive").value,p_mfg_qr_date:q||null,p_mfg_label_date:label||null,p_mfg_used_date:used||null,p_mfg_source:source,p_expiry_date:$("#eExpiry").value,p_location:$("#eLocation").value.trim(),p_reason:reason});if(error)throw error;const alertResult=await triggerExpiryAlertNow(l.id);alert(alertResult.sent?`แก้ไขแล้ว และแจ้ง DingTalk ระดับ ${alertResult.level} เดือนแล้ว`:"แก้ไขรายการแล้ว");render("stock");}catch(e){console.error(e);alert("แก้ไขไม่สำเร็จ: "+e.message);}};
}

async function triggerExpiryAlertNow(lotId=null){
  const response=await fetch("/.netlify/functions/check-expiry-now",{method:"POST",headers:{Authorization:`Bearer ${adminToken}`,"Content-Type":"application/json"},body:JSON.stringify({lot_id:lotId})});
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
async function more(){$("#page").innerHTML=`<div class="menu"><button data-go="history">🕘 ประวัติการเคลื่อนไหว</button><button data-go="alerts">🔔 แจ้งเตือนวันหมดอายุ</button><button data-go="report">📊 รายงาน / Export Excel</button><button id="import">📥 Import BOM จาก Excel</button><input id="file" class="hidden" type="file" accept=".xlsx,.xls,.csv"></div>`;bindGo();$("#import").onclick=()=>$("#file").click();$("#file").onchange=importBom;}
async function importBom(e){const file=e.target.files[0];if(!file)return;const wb=XLSX.read(await file.arrayBuffer()),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});const pick=(r,names)=>{for(const n of names){const k=Object.keys(r).find(x=>x.trim().toLowerCase()===n.toLowerCase());if(k)return r[k]}return""};const list=rows.map(r=>({material_code:String(pick(r,["Material Code","Material","Code","รหัสวัสดุ"])).trim(),material_name:String(pick(r,["Material Name","Name","Description","ชื่อวัสดุ"])).trim(),unit:String(pick(r,["Unit","UOM","หน่วย"])).trim(),supplier:String(pick(r,["Supplier","ผู้ขาย"])).trim(),barcode:String(pick(r,["Barcode","บาร์โค้ด"])).trim()||null})).filter(x=>x.material_code&&x.material_name);const {error}=await sb.from("materials").upsert(list,{onConflict:"material_code"});if(error)throw error;alert(`Import BOM สำเร็จ ${list.length} รายการ`);}
function bindGo(){$$("[data-go]").forEach(b=>b.onclick=()=>render(b.dataset.go));}
async function scan(id,cb){const q=new Html5Qrcode(id);try{await q.start({facingMode:"environment"},{fps:10,qrbox:{width:240,height:120}},async t=>{cb(t.trim());await q.stop();$("#"+id).innerHTML="";});}catch(e){alert("เปิดกล้องไม่ได้: "+e.message);}}
init();
})();
