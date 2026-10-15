import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "./app.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { Store, type Database } from "./store.js";
import { prepareStudentPasswords, applyStudentPasswords } from "./student-passwords.js";
import { PGlite } from "@electric-sql/pglite";
import handler from "../api/index.js";
import { scryptSync } from "node:crypto";

test("all 41 temporary credentials preserve classroom data, require personal setup, rotate sessions and reject stale setup", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-first-login-"));
  const store = new Store(directory);
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await store.open();
    const passwordHash = await hashPassword("OriginalFixture2026!");
    await store.mutate(data => {
      data.users = [{ id: "teacher", name: "Fixture teacher", email: "teacher@example.test", role: "teacher", passwordHash },
        ...Array.from({length:41}, (_, index) => ({ id:`s${index+1}`, name:`Student ${index+1}`, email:`s${index+1}@example.test`, role:"student" as const, rollNumber:String(index+1), passwordHash }))];
      data.labs = [{ id:"lab", title:"Saved lab", description:"", dueDate:"", published:true, totalMarks:10, tasks:[{id:"task",title:"Task",description:"",maxMarks:10,requirements:[]}] }];
      data.submissions = [{id:"work",studentId:"s1",labId:"lab",taskId:"task",revision:1,files:[{path:"index.html",content:"<h1>Retained work</h1>"}],link:null,submittedAt:new Date().toISOString(),status:"graded",late:false,grade:{marks:0,feedback:"Draft",published:false,gradedAt:new Date().toISOString()}}];
      data.sessions = [{id:"a".repeat(64),userId:"teacher",expiresAt:Date.now()+60000},{id:"b".repeat(64),userId:"s1",expiresAt:Date.now()+60000}];
    });
    const original = structuredClone(store.data);
    const plan = await prepareStudentPasswords(store.data.users);
    assert.equal(plan.length,41);
    assert.equal(new Set(plan.map(item=>item.password)).size,41);
    assert.ok(plan.every(item=>/^\d{8}$/.test(item.password)));
    assert.ok(plan.every(item=>item.passwordHash.startsWith("setup$")));
    const [legacySalt, encoded] = plan[0].passwordHash.split(":");
    assert.notEqual(scryptSync(plan[0].password,legacySalt,64).toString("hex"),encoded);
    assert.equal(await applyStudentPasswords(store,plan),true);
    assert.equal(await applyStudentPasswords(store,plan),false);
    assert.deepEqual(store.data.labs,original.labs);
    assert.deepEqual(store.data.submissions,original.submissions);
    assert.deepEqual(store.data.users[0],original.users[0]);
    assert.deepEqual(store.data.users.map(user=>user.id),original.users.map(user=>user.id));
    assert.equal(store.data.sessions.some(session=>session.userId==="s1"),false);
    assert.equal(store.data.sessions.some(session=>session.userId==="teacher"),true);
    await store.close();
    app = await createApp({dataDir:directory,demo:false,production:false,mongoUri:"",supabaseUrl:"",supabaseKey:""});
    const student = request.agent(app), other = request.agent(app);
    await student.post("/api/auth/login").send({email:"1",password:"OriginalFixture2026!"}).expect(401);
    const login = await student.post("/api/auth/login").send({email:"1",password:plan[0].password}).expect(200);
    assert.equal(login.body.mustChangePassword,true);
    assert.ok(!("passwordHash" in login.body) && !("authVersion" in login.body));
    const oldCookie = login.headers["set-cookie"][0].split(";")[0];
    assert.match(oldCookie,/^labtrack_session=setup_[a-f0-9]{64}$/);
    assert.match(login.headers["set-cookie"][0],/Max-Age=900;/);
    await other.post("/api/auth/login").send({email:"1",password:plan[0].password}).expect(200);
    const pending = await student.get("/api/state").expect(200);
    for (const name of ["students","labs","submissions","activity"]) assert.deepEqual(pending.body[name],[]);
    await student.get("/api/submissions/work/source?revision=1").expect(403);
    await student.get("/api/submissions/work/files/index.html").expect(403);
    await student.post("/api/submissions").field("labId","lab").field("taskId","task").field("link","https://example.test").expect(403);
    await student.post("/api/auth/password").set("Origin","https://foreign.example.test").send({newPassword:"PersonalFixture2026!"}).expect(403);
    await student.post("/api/auth/password").send({newPassword:""}).expect(400);
    await student.post("/api/auth/password").send({newPassword:"   "}).expect(400);
    await student.post("/api/auth/password").send({newPassword:"x".repeat(257)}).expect(400);
    await request(app).post("/api/auth/password").send({newPassword:"PersonalFixture2026!"}).expect(401);
    const saved = await student.post("/api/auth/password").send({newPassword:"7"}).expect(200);
    assert.equal(saved.body.mustChangePassword,false);
    assert.notEqual(saved.headers["set-cookie"][0].split(";")[0],oldCookie);
    assert.match(saved.headers["set-cookie"][0],/Max-Age=604800;/);
    const state = await student.get("/api/state").expect(200);
    assert.equal(state.body.labs.length,1);
    assert.equal(state.body.submissions[0].grade,undefined);
    assert.equal((await request(app).get("/api/state").set("Cookie",oldCookie).expect(200)).body.user,null);
    assert.equal((await other.get("/api/state").expect(200)).body.user,null);
    await other.post("/api/auth/password").send({newPassword:"DifferentFixture2026!"}).expect(401);
    await student.post("/api/auth/password").send({newPassword:"DifferentFixture2026!"}).expect(400);
    await student.post("/api/auth/logout").expect(200);
    await student.post("/api/auth/login").send({email:"1",password:plan[0].password}).expect(401);
    await student.post("/api/auth/login").send({email:"1",password:"7"}).expect(200);
    const current = app.locals.store.data as Database;
    assert.ok(await verifyPassword("7",current.users.find(user=>user.id==="s1")!.passwordHash));
    assert.deepEqual(current.submissions,original.submissions);
    await assert.rejects(applyStudentPasswords(app.locals.store,plan),/Refusing to overwrite/);
  } finally {
    await app?.locals.store.close();
    await store.close();
    await rm(directory,{recursive:true,force:true});
  }
});

test("41 independent first-password saves coexist in real SQL without changing other accounts", async t => {
  const environment = { SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY };
  Object.assign(process.env,{SUPABASE_URL:"https://first-login-sql.supabase.co",SUPABASE_SECRET_KEY:"sb_secret_first_login_fixture"});
  t.after(()=>{for(const [key,value] of Object.entries(environment)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const sql = new PGlite();
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  try {
    await sql.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
    const directory = new URL("../supabase/migrations/",import.meta.url);
    for (const file of (await readdir(directory)).filter(file=>file.endsWith(".sql")).sort()) await sql.exec(await readFile(new URL(file,directory),"utf8"));
    const passwordHash = await hashPassword("FirstLoginFixture2026!");
    for (let index=0;index<=41;index++) {
      const user = index ? {id:`s${index}`,name:`Student ${index}`,email:`s${index}@example.test`,role:"student",rollNumber:String(index),passwordHash,mustChangePassword:true,authVersion:`v${index}`} :
        {id:"teacher",name:"Teacher",email:"teacher@example.test",role:"teacher",passwordHash};
      await sql.query("insert into public.labtrack_records values('users',$1,$2,$3)",[user.id,JSON.stringify(user),index]);
      if(index)await sql.query("insert into public.labtrack_records values('sessions',$1,$2,$3)",[String(index).padStart(64,"0"),JSON.stringify({id:String(index).padStart(64,"0"),userId:user.id,expiresAt:Date.now()+600000,authVersion:`v${index}`}),index]);
    }
    let writes=0, conflicts=0;
    t.mock.method(globalThis,"fetch",async(url:string,options:RequestInit)=>{
      const name=url.split("/").at(-1)!;
      assert.match(name,/^labtrack_[a-z_]+$/);
      const body=JSON.parse(String(options.body));
      const keys=Object.keys(body);keys.forEach(key=>assert.match(key,/^[a-z_]+$/));
      try {
        const result=await sql.query<{value:unknown}>(`select public.${name}(${keys.map((key,index)=>`${key}=>$${index+1}`).join(",")}) as value`,keys.map(key=>typeof body[key]==="object"?JSON.stringify(body[key]):body[key]));
        if(name==="labtrack_write_scoped")writes++;
        return Response.json(result.rows[0].value);
      }catch(error){if((error as {code:string}).code==="PT409")conflicts++;return Response.json({code:(error as {code:string}).code},{status:409});}
    });
    const login = await request(handler).post("/api/auth/login").send({email:"1",password:"FirstLoginFixture2026!"}).expect(200);
    const pendingCookie = login.headers["set-cookie"][0].split(";")[0];
    assert.match(pendingCookie,/=setup_[a-f0-9]{64}$/);
    const pending = await request(handler).get("/api/state").set("Cookie",pendingCookie).expect(200);
    assert.equal(pending.body.user.mustChangePassword,true);
    assert.deepEqual(pending.body.labs,[]);
    await request(handler).get("/api/reports.csv").set("Cookie",pendingCookie).expect(403);
    const priorWrites = writes;
    apps.push(...await Promise.all(Array.from({length:41},()=>createApp({production:false,demo:false,mongoUri:"",serverless:true,supabaseUrl:"https://first-login-sql.supabase.co",supabaseKey:"sb_secret_first_login_fixture"}))));
    await Promise.all(apps.map((app,index)=>request(app).post("/api/auth/password").set("Cookie",`labtrack_session=${String(index+1).padStart(64,"0")}`).send({newPassword:String(index+1)}).expect(200)));
    const result=await sql.query<{pending:number}>("select count(*)::integer as pending from public.labtrack_records where collection='users' and document->>'mustChangePassword'='true'");
    assert.equal(result.rows[0].pending,0);assert.equal(writes-priorWrites,41);assert.equal(conflicts,0);
    const teacher=await sql.query<{document:{passwordHash:string}}>("select document from public.labtrack_records where collection='users' and id='teacher'");
    assert.equal(teacher.rows[0].document.passwordHash,passwordHash);
  } finally {await Promise.all(apps.map(app=>app.locals.store.close()));await sql.close();}
});
