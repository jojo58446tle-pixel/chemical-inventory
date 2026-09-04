const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405,{ok:false,error:"Method not allowed"});
  try {
    const token=(event.headers.authorization||"").replace(/^Bearer\s+/i,"");
    if(!token)return reply(401,{ok:false,error:"Unauthorized"});
    try{jwt.verify(token,process.env.SUPABASE_JWT_SECRET,{algorithms:["HS256"]});}
    catch(_e){return reply(401,{ok:false,error:"Unauthorized"});}

    const webhook=process.env.DINGTALK_CHEMICAL_WEBHOOK_URL||process.env.DINGTALK_WEBHOOK_URL;
    if(!webhook)throw new Error("ยังไม่ได้ตั้งค่า DINGTALK_CHEMICAL_WEBHOOK_URL หรือ DINGTALK_WEBHOOK_URL");

    const now=new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"medium"}).format(new Date());
    const content=[
      "✅ Chemical DingTalk Connection Test",
      "Material Shelf-Life & Storage Control System",
      `Time: ${now}`,
      "Result: Netlify → DingTalk connection is working"
    ].join("\n");

    // Existing Chemical integration is a DingTalk Workflow webhook, not a Custom Robot webhook.
    const r=await fetch(webhook,{method:"POST",headers:{"Content-Type":"text/plain; charset=utf-8"},body:content});
    const text=await r.text();
    if(!r.ok)throw new Error(`DingTalk HTTP ${r.status}: ${text.slice(0,500)}`);
    try{const j=JSON.parse(text);if(j&&"errcode" in j&&Number(j.errcode)!==0)throw new Error(`DingTalk error ${j.errcode}: ${j.errmsg||"Unknown error"}`);}catch(e){if(String(e.message||"").startsWith("DingTalk error"))throw e;}
    return reply(200,{ok:true,sent:true,sent_at:new Date().toISOString(),response:text.slice(0,300)});
  } catch(e){console.error("Chemical DingTalk test error:",e);return reply(500,{ok:false,error:e.message||"DingTalk test failed"});}
};
function reply(statusCode,body){return{statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(body)}}
