import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "./app.js";
import { labMetadata } from "./lab-instructions.js";
import type { Lab } from "../shared/types.js";

const fixtureLab: Lab = { id:"handout",revision:1,title:"Handout fixture",description:"",dueDate:"",totalMarks:10,published:true,
  tasks:[{id:"handout-task",title:"Task",description:"",maxMarks:10,requirements:[]}],
  instructionFile:{name:"brief.pdf",contentType:"application/pdf",content:Buffer.alloc(3*1024*1024,0xab).toString("base64")} };

test("handout metadata reuses stored checksums and hashes legacy or malformed identities", () => {
  const sha256=createHash("sha256").update(Buffer.from(fixtureLab.instructionFile!.content!,"base64")).digest("hex");
  const original=Buffer.from;
  let decodes=0;
  const decoder=mock.method(Buffer,"from",(...args: unknown[]) => {
    if(args[1]==="base64")decodes++;
    return Reflect.apply(original,Buffer,args);
  });
  try {
    const cached={...fixtureLab,instructionFile:{...fixtureLab.instructionFile!,sha256}};
    assert.deepEqual(labMetadata(cached).instructionFile,{name:"brief.pdf",contentType:"application/pdf",sha256});
    assert.equal(decodes,0,"stored hashes must avoid decoding unchanged attachment bytes");
    for(const identity of [undefined,"", "invalid", "a".repeat(63),"G".repeat(64)]) {
      assert.equal(labMetadata({...fixtureLab,instructionFile:{...fixtureLab.instructionFile!,sha256:identity}}).instructionFile?.sha256,sha256);
    }
    assert.equal(decodes,5);
    assert.deepEqual(labMetadata(labMetadata(cached)),labMetadata(cached));
    assert.equal(decodes,5,"metadata-only files do not decode bytes");
    assert.equal(cached.instructionFile.content,fixtureLab.instructionFile!.content,"projection preserves private source records");
  } finally {decoder.mock.restore();}
});

test("handouts stay out of state, preserve bytes on metadata edits and require current authorized downloads", async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),"labtrack-instructions-"));
  const app=await createApp({dataDir:directory,production:false,demo:true,supabaseUrl:"",supabaseKey:"",mongoUri:""});
  const teacher=request.agent(app), student=request.agent(app);
  try {
    await teacher.post("/api/auth/demo").set("Host","localhost").send({role:"teacher"}).expect(200);
    await student.post("/api/auth/demo").set("Host","localhost").send({role:"student"}).expect(200);
    const key="12345678-1234-1234-1234-123456789abc";
    const created=(await teacher.post("/api/labs").set("Idempotency-Key",key).send({...fixtureLab,instructionFile:{...fixtureLab.instructionFile,sha256:"0".repeat(64)}}).expect(201)).body as Lab;
    assert.equal(created.instructionFile?.content,undefined);
    assert.equal(created.instructionFile?.sha256,createHash("sha256").update(Buffer.from(fixtureLab.instructionFile!.content!,"base64")).digest("hex"),"new bytes never trust a browser-supplied checksum");
    assert.equal((await teacher.post("/api/labs").set("Idempotency-Key",key).send(fixtureLab).expect(201)).body.id,created.id);
    await teacher.post("/api/labs").set("Idempotency-Key",key).send({...fixtureLab,instructionFile:{...fixtureLab.instructionFile,content:"YQ=="}}).expect(409);
    await teacher.post("/api/labs").send({...fixtureLab,title:"Another handout"}).expect(201);
    const state=await student.get("/api/state").expect(200);
    assert.ok(Buffer.byteLength(state.text)<200000,"two 3 MiB handouts must not inflate classroom state");
    assert.ok(state.body.labs.every((lab:Lab)=>lab.instructionFile?.content===undefined));
    const url=`/api/labs/${created.id}/instructions?revision=1`;
    await request(app).get(url).expect(401);
    await student.get(url.replace("revision=1","revision=0")).expect(409);
    const downloaded=await student.get(url).expect(200);
    assert.equal(downloaded.headers["cache-control"],"no-store");
    assert.deepEqual(downloaded.body,Buffer.from(fixtureLab.instructionFile!.content!,"base64"));
    const updated=(await teacher.patch(`/api/labs/${created.id}`).send({...created,title:"Edited metadata"}).expect(200)).body as Lab;
    assert.equal(app.locals.store.data.labs.find((lab:Lab)=>lab.id===created.id).instructionFile.content,fixtureLab.instructionFile!.content);
    await student.get(url).expect(409);
    await teacher.patch(`/api/labs/${created.id}`).send({...updated,published:false}).expect(200);
    await student.get(`/api/labs/${created.id}/instructions?revision=3`).expect(404);
    await teacher.get(`/api/labs/${created.id}/instructions?revision=3`).expect(200);
    await teacher.patch(`/api/labs/${created.id}`).send({instructionFile:null}).expect(200);
    await teacher.get(`/api/labs/${created.id}/instructions?revision=4`).expect(404);
  } finally {
    await app.locals.close();
    if(path.dirname(directory)===path.resolve(os.tmpdir())&&path.basename(directory).startsWith("labtrack-instructions-"))await rm(directory,{recursive:true,force:true});
  }
});

test("private SQL projects handout metadata, preserves documents on stale independent writes and rejects altered handouts", async () => {
  const db=new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
    const directory=new URL("../supabase/migrations/",import.meta.url);
    for(const file of (await readdir(directory)).filter(f=>f.endsWith(".sql")).sort())await db.exec(await readFile(new URL(file,directory),"utf8"));
    const value=async<T>(sql:string,args:unknown[]=[]) => (await db.query<{value:T}>(sql,args)).rows[0].value;
    const sha256=labMetadata(fixtureLab).instructionFile!.sha256;
    const cached={...fixtureLab,instructionFile:{...fixtureLab.instructionFile!,sha256}};
    assert.deepEqual(await value("select public.labtrack_lab_metadata($1) as value",[JSON.stringify(cached)]),labMetadata(cached));
    assert.equal((await value<Lab>("select public.labtrack_lab_metadata($1) as value",[JSON.stringify({...cached,instructionFile:{...cached.instructionFile,content:"!"}})])).instructionFile?.sha256,sha256,"stored hashes bypass base64 decoding in SQL");
    for(const identity of [null,"invalid","a".repeat(63),"G".repeat(64)]) {
      assert.equal((await value<Lab>("select public.labtrack_lab_metadata($1) as value",[JSON.stringify({...fixtureLab,instructionFile:{...fixtureLab.instructionFile,sha256:identity}})])).instructionFile?.sha256,sha256);
    }
    for(const prefix of ["labtrack","labtrack_demo"]) {
      await db.query(`insert into public.${prefix}_records values('labs',$1,$2,0)`,[fixtureLab.id,JSON.stringify(fixtureLab)]);
      const read=()=>value<{revision:number;data:{labs:Lab[]}}>(`select public.${prefix}_read_workspace(-1) as value`);
      const snapshot=await read();
      assert.deepEqual(snapshot.data.labs[0],labMetadata(fixtureLab));
      assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<10000);
      const full=await value<{data:{labs:Lab[]}}>(`select public.${prefix}_read() as value`);
      assert.equal(full.data.labs[0].instructionFile?.content,fixtureLab.instructionFile!.content);
      assert.equal((await value<{instructionFile:Lab["instructionFile"]}>(`select public.${prefix}_instructions('handout',1) as value`)).instructionFile?.content,fixtureLab.instructionFile!.content);
      assert.equal(await value(`select public.${prefix}_instructions('handout',2) as value`),null);
      const write=(revision:number,doc:Lab,guard:Lab) => value<number>(`select public.${prefix}_write_scoped($1,$2,'[]',$3) as value`,[revision,
        JSON.stringify([{collection:"labs",id:doc.id,document:doc,position:0}]),JSON.stringify([{collection:"labs",id:guard.id,document:guard}])]);
      await db.exec(`update public.${prefix}_meta set revision=revision+1 where id=1`);
      const metadata={...snapshot.data.labs[0],revision:2,title:"Metadata edit"};
      const next=await write(snapshot.revision,metadata,snapshot.data.labs[0]);
      assert.equal((await value<{instructionFile:Lab["instructionFile"]}>(`select public.${prefix}_instructions('handout',2) as value`)).instructionFile?.content,fixtureLab.instructionFile!.content);
      const forged={...metadata,instructionFile:{...metadata.instructionFile!,sha256:"0".repeat(64)}};
      await assert.rejects(write(next,forged,metadata),(error:{code?:string})=>error.code==="PT409");
      const replaced={...fixtureLab,revision:3,instructionFile:{...fixtureLab.instructionFile!,content:"YQ=="}};
      await write(next,replaced,metadata);
      await assert.rejects(write(next,{...metadata,title:"Stale draft"},metadata),(error:{code?:string})=>error.code==="PT409");
      for(const role of ["anon","authenticated"])for(const fn of [`${prefix}_read_workspace(bigint)`,`${prefix}_instructions(text,bigint)`])
        assert.equal(await value<boolean>("select has_function_privilege($1,$2,'EXECUTE') as value",[role,`public.${fn}`]),false);
    }
    assert.equal(await value<boolean>("select bool_or(prosecdef) as value from pg_proc where proname like 'labtrack_%'"),false);
    for(const role of ["anon","authenticated"])assert.equal(await value("select has_function_privilege($1,'public.labtrack_lab_metadata(jsonb)','EXECUTE') as value",[role]),false);
    assert.equal(await value("select has_function_privilege('service_role','public.labtrack_lab_metadata(jsonb)','EXECUTE') as value"),true);
  } finally {await db.close();}
});
