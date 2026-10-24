import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import { Store } from "./store.js";
import { initialLabs } from "./seed.js";
import { labThreeDraft, addLabThree, upgradeLabThreeChecks } from "./lab-three.js";
import { createApp } from "./app.js";
import { analyzeSubmission } from "./analysis.js";
import type { Submission } from "../shared/types.js";

test("Lab 3 appends once, preserves every existing record and stays hidden from students", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-lab3-"));
  const store = new Store(directory);
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await store.open();
    await store.mutate(data => {
      data.labs = initialLabs().slice(0, 2);
      data.users = [
        {id:"teacher",name:"Teacher",email:"teacher@example.test",role:"teacher",passwordHash:"fixture"},
        {id:"student",name:"Student",email:"student@example.test",role:"student",rollNumber:"1",passwordHash:"fixture"},
      ];
      data.sessions = [
        {id:"a".repeat(64),userId:"teacher",expiresAt:Date.now()+600000},
        {id:"b".repeat(64),userId:"student",expiresAt:Date.now()+600000},
      ];
      data.submissions = [{id:"saved-work",studentId:"student",labId:"lab1",taskId:"lab1-task1",revision:4,
        files:[{path:"original.html",content:"<h1>Existing work</h1>"}],binaryAssets:[{path:"image.png",mimeType:"image/png",base64:"aGVsbG8="}],
        link:null,submittedAt:"2026-10-16T12:00:00Z",status:"graded",late:false,
        grade:{marks:0,feedback:"Keep this draft grade",published:false,gradedAt:"2026-10-16T13:00:00Z"}}];
      data.activity = [{id:"existing-activity",type:"lab",text:"Existing activity",time:"2026-10-16T12:00:00Z"}];
    });
    const before = structuredClone(store.data);
    assert.equal(await addLabThree(store), true);
    assert.deepEqual(store.data.labs.slice(0, 2), before.labs);
    for (const key of ["users","sessions","submissions","activity"] as const) assert.deepEqual(store.data[key], before[key]);
    const after = structuredClone(store.data);
    assert.equal(await addLabThree(store), false);
    assert.deepEqual(store.data, after);
    await store.close();
    app = await createApp({dataDir:directory,demo:false,production:false,mongoUri:"",supabaseUrl:"",supabaseKey:""});
    const teacher = await request(app).get("/api/state").set("Cookie", "labtrack_session=" + "a".repeat(64)).expect(200);
    assert.equal(teacher.body.labs.length, 3);
    const draft = teacher.body.labs.find((lab: {id:string}) => lab.id === "lab3");
    assert.equal(draft.published, false);
    assert.equal(draft.totalMarks, 30);
    assert.equal(draft.dueDate, "");
    assert.equal(draft.tasks.length, 3);
    const student = await request(app).get("/api/state").set("Cookie", "labtrack_session=" + "b".repeat(64)).expect(200);
    assert.deepEqual(student.body.labs.map((lab: {id:string}) => lab.id), ["lab1","lab2"]);
    assert.equal(student.body.submissions[0].grade, undefined);
    // Exercise the normal lab validator with this complete attachment and checklist.
    await request(app).post("/api/labs").set("Cookie", "labtrack_session=" + "a".repeat(64)).send(await labThreeDraft()).expect(201);
    const invalid=await labThreeDraft();
    invalid.tasks[0].requirements[2].value="untrusted-check";
    await request(app).post("/api/labs").set("Cookie","labtrack_session="+"a".repeat(64)).send(invalid).expect(400);
  } finally {
    await app?.locals.store.close();
    await store.close();
    await rm(directory, {recursive:true,force:true});
  }
});

test("upgrading existing Lab 3 changes only its checks and revision and is safe to repeat",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"labtrack-lab3-upgrade-"));
  const store=new Store(directory);
  try{
    await store.open();
    const live=await labThreeDraft();
    live.revision=7;live.published=true;live.dueDate="2026-10-30T12:00:00Z";
    live.tasks[0].description="Teacher's retained instructions";live.tasks[0].maxMarks=15;live.totalMarks=35;
    live.tasks.forEach(task=>{task.requirements=[{id:task.id+"-old",label:"Legacy structural check",type:"tag",value:"body"}];});
    await store.mutate(data=>{
      data.labs=[...initialLabs().slice(0,2),live];
      data.submissions=[{id:"graded",labId:"lab3",taskId:"lab3-task1",studentId:"student",revision:9,
        files:[{path:"own.html",content:"Existing work"}],submittedAt:"2026-10-17T00:00:00Z",link:null,late:false,status:"graded",
        grade:{marks:0,feedback:"Keep",published:false,gradedAt:"2026-10-17T01:00:00Z"}}];
    });
    const before=structuredClone(store.data);
    assert.equal(await upgradeLabThreeChecks(store),true);
    assert.equal(store.data.labs[2].revision,8);
    const withoutChecks=(lab:typeof live)=>({...lab,revision:undefined,tasks:lab.tasks.map(({requirements:_,...task})=>task)});
    assert.deepEqual(withoutChecks(store.data.labs[2]),withoutChecks(before.labs[2]));
    assert.deepEqual(store.data.labs.slice(0,2),before.labs.slice(0,2));
    for(const key of ["submissions","users","sessions","activity"] as const)assert.deepEqual(store.data[key],before[key]);
    assert.equal(await upgradeLabThreeChecks(store),false);
    await store.mutate(data=>{data.labs[2].instructionFile=undefined;});
    await assert.rejects(upgradeLabThreeChecks(store),/does not match/);
  }finally{await store.close();await rm(directory,{recursive:true,force:true});}
});

test("Lab 3 refuses an existing placeholder, teacher edits, or a duplicate with another ID", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-lab3-conflict-"));
  const store = new Store(directory);
  try {
    await store.open();
    for (const existing of [initialLabs()[2], {...await labThreeDraft(),published:true}, {...await labThreeDraft(),id:"other-lab3"}]) {
      await store.mutate(data => { data.labs = [existing]; });
      const before = structuredClone(store.data);
      await assert.rejects(addLabThree(store), /already exists/);
      assert.deepEqual(store.data, before);
    }
  } finally {
    await store.close();
    await rm(directory, {recursive:true,force:true});
  }
});

test("Lab 3 preserves the supplied document and its advisory checks accept representative task solutions", async () => {
  const lab = await labThreeDraft();
  assert.equal(createHash("sha256").update(Buffer.from(lab.instructionFile!.content!,"base64")).digest("hex"),
    "ba775c54eb1787a134eefa9bb9180c926a3bab7dc9d364f86b3485f290824ed1");
  const solutions = [
    '<html><head><style>body{background-color:lightgray}a:link{color:navy}a:hover{color:red}a:visited{color:purple}</style><link rel="stylesheet" href="style.css"></head><body><h1 style="color:navy">Hello</h1><a target="_blank" href="https://example.com">Visit</a><a href="#section2">Jump</a><section id="section2"><a href="#section2"><img src="photo.png" style="float:left" alt="Photo"></a><p>Wrapping text</p></section></body></html>',
    '<html><body><marquee behavior="scroll" direction="left">Continuous</marquee><marquee behavior="alternate">Bounce</marquee><marquee behavior="slide">Slide</marquee><marquee direction="up" style="height:200px;width:300px;border:2px solid black">Up</marquee><marquee><img src="photo.png" alt="Photo"></marquee></body></html>',
    '<html><body><table style="margin:auto;border:1px solid"><tr><th>Student ID</th><th>Name</th><th>Department</th><th>GPA</th></tr><tr><td>1</td><td>A</td><td rowspan="3">CS</td><td>3.5</td></tr><tr><td>2</td><td>B</td><td>3.6</td></tr><tr><td>3</td><td>C</td><td>3.7</td></tr></table><ol type="I"><li>OOP</li><li>Web Engineering</li><li>Database Systems</li></ol><ul style="list-style-type:square"><li>HTML5<ol type="a"><li>Headings</li><li>Tables</li></ol></li><li>CSS3</li></ul><dl><dt>HTML</dt><dd>HyperText Markup Language</dd><dt>CSS</dt><dd>Cascading Style Sheets</dd></dl></body></html>',
  ];
  for (const [index,task] of lab.tasks.entries()) {
    const submission: Submission = {id:"sample",studentId:"student",labId:lab.id,taskId:task.id,revision:1,
      files:[{path:"any-name.htm",content:solutions[index]},...(index===0?[{path:"style.css",content:"img{float:left}"}]:[])],
      assets:index<2?[{path:"photo.png",mimeType:"image/png"}]:[],
      link:null,submittedAt:"2026-10-17T12:00:00Z",status:"submitted",late:false};
    const result = analyzeSubmission(submission, [], task);
    assert.ok(result.requirements.every(item => item.passed), JSON.stringify(result.requirements.filter(item => !item.passed)));
    const empty = analyzeSubmission({...submission,files:[{path:"anything.html",content:"<html><body></body></html>"}]}, [], task);
    assert.equal(empty.met, 1);
    assert.equal(submission.grade, undefined);
  }
});
