import assert from "node:assert/strict";

// Real Next route -> real local JWT/anonymous RPC -> local PostgreSQL.
export async function verifyLodgingApp(request, base) {
  const category="20000000-0000-4000-8000-000000000001";
  const date=new Date(); date.setUTCDate(date.getUTCDate()+45);
  const checkIn=date.toISOString().slice(0,10); date.setUTCDate(date.getUTCDate()+2);
  const checkOut=date.toISOString().slice(0,10);
  const stay={checkIn,checkOut,adults:1,children:1,category:"test_local"};
  const mutate=async(action,input,id)=>{
    const response=await request("/api/admin/lodging",true,{method:"POST",headers:{origin:base,"content-type":"application/json"},body:JSON.stringify({action,input,...(id?{id}:{})})});
    if(response.status===403) {
      const result=await response.clone().json();
      throw new Error(`T2 ${action}: ${result.error==='Origen no permitido.'?'same-origin rejection':'permission rejection'}`);
    }
    return response;
  };
  assert.equal((await request("/api/admin/lodging",false)).status,401);
  const snapshot=await (await request("/api/admin/lodging")).json();
  assert.equal(snapshot.schemaReady,true); assert.equal(snapshot.rates.length,0);
  assert.equal((await mutate("categorySales",{categoryId:category,enabled:true})).status,200);
  const rate={categoryId:category,name:"Synthetic API rate",kind:"day",dayKind:"normal",weekdays:[1,2,3,4,5,6,7],validFrom:checkIn,validUntil:checkOut,amount:123.45,minimumStay:1,conditions:"",active:true,salesEnabled:true};
  assert.equal((await mutate("rate",{...rate,amount:-1})).status,422);
  const saved=await mutate("rate",rate); assert.equal(saved.status,200); const {result:id}=await saved.json();
  assert.equal((await mutate("rate",{...rate,amount:150},id)).status,200);
  assert.equal((await mutate("specialDate",{date:checkIn,kind:"NORMAL_OVERRIDE",name:"Synthetic normal API",active:true})).status,200);
  assert.equal((await mutate("settings",{webMinutes:15,adminMinutes:90})).status,200);
  const params=new URLSearchParams({...stay,adults:"1",children:"1"});
  const admin=await request(`/api/admin/lodging?${params}`); assert.equal(admin.status,200);
  const inventory=await admin.json(); assert.equal(inventory.categories[0].quote.total,300); assert.equal(inventory.categories[0].available,true);
  const html=await (await request(`/disponibilidad?checkin=${checkIn}&checkout=${checkOut}&adults=1&children=1`,false)).text();
  assert.ok(html.includes("Opciones para tu estadía") && html.includes("Disponible al consultar"));
  assert.ok(!html.includes("TEST-DOCUMENT") && !html.includes("visitor_hash"));
  const publicPost=(origin)=>request("/api/lodging/holds",false,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(stay)});
  assert.equal((await publicPost("https://foreign.invalid")).status,403);
  const held=await publicPost(base); assert.equal(held.status,201);
  const hold=await held.json(); assert.equal(hold.status,"ACTIVE"); assert.equal(hold.quote.total,300);
  assert.equal("room_id" in hold,false); assert.equal("visitor_hash" in hold,false);
  const setCookie=held.headers.get("set-cookie")??"";
  assert.match(setCookie,/HttpOnly/i); assert.match(setCookie,/SameSite=strict/i);
  const cookie=setCookie.split(";")[0]; // Memory only; never log cookie values.
  const cancel=(authorized)=>request("/api/lodging/holds",false,{method:"DELETE",headers:{origin:base,"content-type":"application/json",...(authorized?{cookie}:{})},body:JSON.stringify({id:hold.id})});
  assert.equal((await cancel(false)).status,403);
  assert.equal((await cancel(true)).status,200);
  const staffHold=await mutate("hold",{request:stay,source:"whatsapp"}); assert.equal(staffHold.status,200);
  const staffResult=(await staffHold.json()).result;
  assert.equal((await mutate("cancelHold",{},staffResult.id)).status,200);
  // Leave no active occupancy for the independent concurrency regression tests.
  assert.equal((await mutate("rate",{...rate,active:false,salesEnabled:false},id)).status,200);
  assert.equal((await mutate("specialDate",{date:checkIn,kind:"NORMAL_OVERRIDE",name:"Synthetic normal API",active:false})).status,200);
  console.log("PASS: T2 built app owner rates CRUD, special date/TTL/category sales, real public quote, no-PII projection, public HttpOnly hold, foreign cancellation denied, staff hold/cancel, strict origin");
}
