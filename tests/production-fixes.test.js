const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadHooks(){
  const window={APP_CONFIG:{},__MSL_DISABLE_AUTO_INIT__:true};
  const document={querySelector:()=>({})};
  const context={window,document,sessionStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},setTimeout,clearTimeout,console,Date,Promise};
  vm.runInNewContext(fs.readFileSync("app.js","utf8"),context,{filename:"app.js"});
  return window.__MSL_TEST_HOOKS__;
}

const hooks=loadHooks();
const profile={expiry_calculation_mode:"FIXED_MONTHS",shelf_life_months:12};

test("dashboard loader retries temporary failures and resolves automatically",async()=>{
  let attempts=0;
  const value=await hooks.runWithRetry(async()=>{attempts+=1;if(attempts<3)throw new Error("Failed to fetch");return "DATA_DISPLAYED";},{delays:[0,0,0]});
  assert.equal(value,"DATA_DISPLAYED");
  assert.equal(attempts,3);
});

test("dashboard loader does not retry an invalid authentication session",async()=>{
  let attempts=0;
  await assert.rejects(()=>hooks.runWithRetry(async()=>{attempts+=1;throw Object.assign(new Error("JWT expired"),{status:401});},{delays:[0,0,0]}));
  assert.equal(attempts,1);
});

test("IQC passes material with more than 50 percent remaining shelf life",()=>{
  const calc=hooks.calcGeneralExpiry("2026-01-01",profile,"2026-05-01");
  const result=hooks.evaluateIqcShelfLife(calc);
  assert.equal(calc.expiry,"2027-01-01");
  assert.ok(result.remainingPercent>50);
  assert.equal(result.status,"ACCEPTABLE");
  assert.equal(result.result,"PASS");
});

test("IQC holds material below 50 percent that is not expired",()=>{
  const calc=hooks.calcGeneralExpiry("2026-01-01",profile,"2026-10-01");
  const result=hooks.evaluateIqcShelfLife(calc);
  assert.ok(calc.remainingDays>=0);
  assert.ok(result.remainingPercent<50);
  assert.equal(result.status,"BELOW_50_REQUIREMENT");
  assert.equal(result.result,"FAIL / REVIEW");
  assert.equal(result.action,"HOLD / REVIEW REQUIRED");
});

test("IQC fails expired material, clamps percent to zero, and keeps negative days",()=>{
  const calc=hooks.calcGeneralExpiry("2026-01-01",profile,"2027-02-01");
  const result=hooks.evaluateIqcShelfLife(calc);
  assert.equal(calc.remainingDays,-31);
  assert.equal(result.remainingPercent,0);
  assert.equal(result.status,"EXPIRED");
  assert.equal(result.result,"FAIL");
  assert.equal(result.action,"HOLD / DO NOT USE");
});

test("IQC accepts the exact 50 percent boundary",()=>{
  const synthetic={remainingDays:50,remainingPercent:50,remainingPercentExact:50,status:"VALID"};
  const result=hooks.evaluateIqcShelfLife(synthetic);
  assert.equal(result.status,"ACCEPTABLE");
  assert.equal(result.result,"PASS");
});

test("IQC result card includes every required production field",()=>{
  const calc=hooks.calcGeneralExpiry("2026-01-01",profile,"2026-10-01");
  const html=hooks.iqcShelfLifeResultHtml(calc);
  for(const text of ["BELOW 50% REQUIREMENT","Expiry Date","Remaining Days","Remaining Shelf Life","Requirement Result","IQC ACTION","HOLD / REVIEW REQUIRED","FAIL / REVIEW"]){
    assert.ok(html.includes(text),`missing ${text}`);
  }
});
