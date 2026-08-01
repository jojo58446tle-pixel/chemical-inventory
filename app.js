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
async function getLots(){const {data,error}=await sb.from("chemical_lots").select("*,materials(*)").order("received_date");if(error)throw error;return data||[];}
function lotCard(l){const d=daysLeft(l.expiry_date),c=d<0||d<=30?"red":d<=180?"orange":"green";return `<div class="item"><div class="row"><div><b>${esc(l.materials?.material_code)} — ${esc(l.materials?.material_name)}</b><div class="muted">Lot ${esc(l.lot_no)}</div></div><span class="badge ${c}">${d<0?`หมดอายุ ${Math.abs(d)} วัน`:`เหลือ ${d} วัน`}</span></div><div class="row"><span>คงเหลือ ${fmt(l.remaining_qty)} ${esc(l.materials?.unit)}</span><span>Exp ${esc(l.expiry_date)}</span></div></div>`;}
async function dashboard(){
  const lots=await getLots(),a=lots.filter(x=>+x.remaining_qty>0),near=[...a].sort((x,y)=>x.expiry_date.localeCompare(y.expiry_date)).slice(0,5);
  $("#page").innerHTML=`<div class="grid"><div class="card kpi green">Material<b>${new Set(a.map(x=>x.material_id)).size}</b></div><div class="card kpi blue">Lot<b>${a.length}</b></div><div class="card kpi orange">ใกล้หมดอายุ<b>${a.filter(x=>daysLeft(x.expiry_date)<=180&&daysLeft(x.expiry_date)>=0).length}</b></div><div class="card kpi red">หมดอายุ<b>${a.filter(x=>daysLeft(x.expiry_date)<0).length}</b></div></div><div class="section"><h2>ใกล้หมดอายุ</h2><button data-go="alerts" class="secondary">ดูทั้งหมด</button></div><div class="list">${near.length?near.map(lotCard).join(""):'<div class="card muted">ยังไม่มีข้อมูล</div>'}</div><div class="section"><h2>เมนูลัด</h2></div><div class="grid"><button data-go="receive" class="card">📥<br><b>รับเข้า</b></button><button data-go="issue" class="card">📤<br><b>เบิกจ่าย</b></button><button data-go="stock" class="card">📦<br><b>คงคลัง</b></button><button data-go="report" class="card">📗<br><b>Export Excel</b></button></div>`;bindGo();
}
async function receive(){
  $("#page").innerHTML=`<div class="form"><div class="scanner"><b>สแกนบาร์โค้ด</b><button id="scan" class="secondary">เปิดกล้องสแกน</button><div id="reader"></div></div><label>Material Code<input id="code"></label><div id="master" class="card muted">สแกนหรือกรอกรหัส</div><label>Lot<input id="lot"></label><div class="inline"><label>จำนวนรับเข้า<input id="qty" type="number" min="0.001" step="0.001"></label><label>หน่วย<input id="unit" disabled></label></div><label>วันที่รับเข้า<input id="rdate" type="date" value="${today()}"></label><label>วันหมดอายุ<input id="exp" type="date"></label><button id="save" class="primary">บันทึกรับเข้า</button></div>`;
  let mat=null;const lookup=async()=>{const {data,error}=await sb.from("materials").select("*").eq("material_code",$("#code").value.trim()).maybeSingle();if(error)throw error;mat=data;$("#master").innerHTML=mat?`<b>${esc(mat.material_code)} — ${esc(mat.material_name)}</b><div>${esc(mat.supplier||"-")} • ${esc(mat.unit)}</div>`:"ไม่พบใน BOM";$("#unit").value=mat?.unit||"";};
  $("#code").onchange=lookup;$("#scan").onclick=()=>scan("reader",v=>{$("#code").value=v;lookup();});
  $("#save").onclick=async()=>{await lookup();const lot=$("#lot").value.trim(),qty=+$("#qty").value,rd=$("#rdate").value,ex=$("#exp").value;if(!mat||!lot||!(qty>0)||!rd||!ex)return alert("กรอกข้อมูลให้ครบ");const {error}=await sb.rpc("receive_stock",{p_material_id:mat.id,p_lot_no:lot,p_qty:qty,p_received_date:rd,p_expiry_date:ex});if(error)throw error;alert("บันทึกรับเข้าแล้ว");render("dashboard");};
}
async function issue(){
  $("#page").innerHTML=`<div class="form"><div class="scanner"><b>สแกนบาร์โค้ด</b><button id="scan" class="secondary">เปิดกล้องสแกน</button><div id="reader"></div></div><label>Material Code<input id="code"></label><div id="fifo" class="card muted">ระบบจะแนะนำ Lot ตาม FIFO</div><label>เลือก Lot<select id="lot"><option value="">—</option></select></label><label>จำนวนเบิก<input id="qty" type="number" min="0.001" step="0.001"></label><label>เหตุผลกรณีเปลี่ยน Lot<input id="note"></label><button id="save" class="success">บันทึกเบิกจ่าย</button></div>`;
  let lots=[];const lookup=async()=>{const {data,error}=await sb.from("chemical_lots").select("*,materials!inner(*)").eq("materials.material_code",$("#code").value.trim()).gt("remaining_qty",0).order("received_date");if(error)throw error;lots=data||[];$("#lot").innerHTML='<option value="">— เลือก Lot —</option>'+lots.map((l,i)=>`<option value="${l.id}">${i===0?"⭐ FIFO • ":""}${esc(l.lot_no)} • เหลือ ${fmt(l.remaining_qty)} ${esc(l.materials.unit)} • รับ ${esc(l.received_date)}</option>`).join("");if(lots[0])$("#lot").value=lots[0].id;$("#fifo").innerHTML=lots.length?`<div class="fifo card"><b>แนะนำ Lot ตาม FIFO: ${esc(lots[0].lot_no)}</b><div>รับเข้าก่อนสุด ${esc(lots[0].received_date)}</div></div>`:"ไม่พบ Stock";};
  $("#code").onchange=lookup;$("#scan").onclick=()=>scan("reader",v=>{$("#code").value=v;lookup();});
  $("#save").onclick=async()=>{const chosen=lots.find(x=>x.id===$("#lot").value),qty=+$("#qty").value,note=$("#note").value.trim();if(!chosen||!(qty>0))return alert("กรอกข้อมูลให้ครบ");if(qty>+chosen.remaining_qty)return alert("จำนวนมากกว่าคงเหลือ");const fifo=chosen.id===lots[0].id;if(!fifo&&!note)return alert("กรุณาระบุเหตุผลเมื่อไม่เลือก Lot FIFO");if(!fifo&&!confirm("Lot นี้ไม่ใช่ Lot แนะนำตาม FIFO ยืนยันต่อหรือไม่?"))return;const {error}=await sb.rpc("issue_stock",{p_lot_id:chosen.id,p_qty:qty,p_note:fifo?"FIFO":`ไม่ตาม FIFO: ${note}`});if(error)throw error;alert("บันทึกเบิกจ่ายแล้ว");render("stock");};
}
async function stock(){const lots=(await getLots()).filter(x=>+x.remaining_qty>0);$("#page").innerHTML=`<label>ค้นหา<input id="search" placeholder="Material / Lot"></label><div class="list" style="margin-top:12px">${lots.length?lots.map(l=>`<div class="item s" data-search="${esc(l.materials.material_code)} ${esc(l.materials.material_name)} ${esc(l.lot_no)}"><div class="row"><b>${esc(l.materials.material_code)} — ${esc(l.materials.material_name)}</b><strong>${fmt(l.remaining_qty)} ${esc(l.materials.unit)}</strong></div><div class="muted">Lot ${esc(l.lot_no)} • รับ ${esc(l.received_date)} • Exp ${esc(l.expiry_date)}</div></div>`).join(""):'<div class="card muted">ยังไม่มี Stock</div>'}</div>`;$("#search").oninput=e=>$$(".s").forEach(x=>x.classList.toggle("hidden",!x.dataset.search.toLowerCase().includes(e.target.value.toLowerCase())));}
async function alerts(){const lots=(await getLots()).filter(x=>+x.remaining_qty>0&&daysLeft(x.expiry_date)<=180).sort((a,b)=>a.expiry_date.localeCompare(b.expiry_date));$("#page").innerHTML=`<div class="actions"><button id="send" class="primary">ส่งเข้า DingTalk ตอนนี้</button></div><div class="list" style="margin-top:12px">${lots.length?lots.map(lotCard).join(""):'<div class="card muted">ไม่มีรายการเข้าเงื่อนไข</div>'}</div>`;$("#send").onclick=async()=>{const r=await fetch("/.netlify/functions/send-alert-now",{method:"POST",headers:{Authorization:`Bearer ${adminToken}`}});const j=await r.json();alert(j.ok?"ส่ง DingTalk แล้ว":`ส่งไม่สำเร็จ: ${j.error||""}`);};}
async function history(){const {data,error}=await sb.from("stock_movements").select("*,materials(*),chemical_lots(*)").order("created_at",{ascending:false}).limit(500);if(error)throw error;$("#page").innerHTML=`<div class="list">${(data||[]).map(m=>`<div class="item"><div class="row"><b>${m.movement_type==="IN"?"รับเข้า":"เบิกจ่าย"} ${esc(m.materials?.material_code)}</b><span>${new Date(m.created_at).toLocaleString("th-TH")}</span></div><div>Lot ${esc(m.chemical_lots?.lot_no)} • ${fmt(m.qty)} ${esc(m.materials?.unit)}</div><div class="muted">${esc(m.note||"")}</div></div>`).join("")||'<div class="card muted">ยังไม่มีประวัติ</div>'}</div>`;}
async function report(){$("#page").innerHTML=`<div class="card form"><h2>Export Excel</h2><div class="muted">Stock, Receiving, Issue และ Expiry Alert</div><button id="export" class="success">📗 Export Excel</button></div>`;$("#export").onclick=exportExcel;}
async function exportExcel(){const lots=await getLots();const {data:mov,error}=await sb.from("stock_movements").select("*,materials(*),chemical_lots(*)").order("created_at");if(error)throw error;const wb=XLSX.utils.book_new();const stock=lots.map(l=>({Material:l.materials.material_code,Name:l.materials.material_name,Lot:l.lot_no,ReceivedDate:l.received_date,ExpiryDate:l.expiry_date,ReceivedQty:l.received_qty,RemainingQty:l.remaining_qty,Unit:l.materials.unit,Supplier:l.materials.supplier}));const rec=(mov||[]).filter(x=>x.movement_type==="IN").map(mapMov),iss=(mov||[]).filter(x=>x.movement_type==="OUT").map(mapMov),al=lots.filter(x=>+x.remaining_qty>0&&daysLeft(x.expiry_date)<=180).map(l=>({...stock.find(s=>s.Material===l.materials.material_code&&s.Lot===l.lot_no),DaysLeft:daysLeft(l.expiry_date)}));[["Stock",stock],["Receiving",rec],["Issue",iss],["Expiry_Alert",al]].forEach(([n,r])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(r),n));XLSX.writeFile(wb,`Chemical_Inventory_${today()}.xlsx`);}
function mapMov(m){return {Date:m.created_at,Type:m.movement_type,Material:m.materials?.material_code,Name:m.materials?.material_name,Lot:m.chemical_lots?.lot_no,Qty:m.qty,Unit:m.materials?.unit,Note:m.note};}
async function more(){$("#page").innerHTML=`<div class="menu"><button data-go="history">🕘 ประวัติการเคลื่อนไหว</button><button data-go="alerts">🔔 แจ้งเตือนวันหมดอายุ</button><button data-go="report">📊 รายงาน / Export Excel</button><button id="import">📥 Import BOM จาก Excel</button><input id="file" class="hidden" type="file" accept=".xlsx,.xls,.csv"></div>`;bindGo();$("#import").onclick=()=>$("#file").click();$("#file").onchange=importBom;}
async function importBom(e){const file=e.target.files[0];if(!file)return;const wb=XLSX.read(await file.arrayBuffer()),rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:""});const pick=(r,names)=>{for(const n of names){const k=Object.keys(r).find(x=>x.trim().toLowerCase()===n.toLowerCase());if(k)return r[k]}return""};const list=rows.map(r=>({material_code:String(pick(r,["Material Code","Material","Code","รหัสวัสดุ"])).trim(),material_name:String(pick(r,["Material Name","Name","Description","ชื่อวัสดุ"])).trim(),unit:String(pick(r,["Unit","UOM","หน่วย"])).trim(),supplier:String(pick(r,["Supplier","ผู้ขาย"])).trim(),barcode:String(pick(r,["Barcode","บาร์โค้ด"])).trim()||null})).filter(x=>x.material_code&&x.material_name);const {error}=await sb.from("materials").upsert(list,{onConflict:"material_code"});if(error)throw error;alert(`Import BOM สำเร็จ ${list.length} รายการ`);}
function bindGo(){$$("[data-go]").forEach(b=>b.onclick=()=>render(b.dataset.go));}
async function scan(id,cb){const q=new Html5Qrcode(id);try{await q.start({facingMode:"environment"},{fps:10,qrbox:{width:240,height:120}},async t=>{cb(t.trim());await q.stop();$("#"+id).innerHTML="";});}catch(e){alert("เปิดกล้องไม่ได้: "+e.message);}}
init();
})();