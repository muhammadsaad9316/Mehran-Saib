import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "./store.js";
import { hashPassword } from "./auth.js";
import { createApp } from "./app.js";

const directory = await mkdtemp(path.join(os.tmpdir(), "labtrack-browser-"));
const store = new Store(directory);
await store.open();
const passwordHash = await hashPassword("FixtureTeacher2026!");
const temporaryPasswordHash = `setup$${await hashPassword("48276193")}`;
const source = `<html><head><title>Fixture page</title><style>body{font-family:sans-serif;background:#fff;color:#123}section{padding:12px;margin:8px;border:1px solid #abc}</style></head><body><h1>Fixture page</h1><img src="image.png" alt="Fixture image">${Array.from({length:20},(_,index)=>`<section class="fixture-section-${index}"><h2>Topic ${index}</h2><p>Review the project structure and keep the displayed source aligned with its submitted revision.</p><button data-action="item-${index}">Read section</button></section>`).join("")}</body></html>`;
const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCBkAAAAASUVORK5CYII=";
await store.mutate(data => {
  data.users = [{ id: "fixture-teacher", name: "Fixture teacher", email: "fixture@example.test", role: "teacher", passwordHash },
    ...Array.from({length:41},(_,index)=>({ id:`fixture-student-${index+1}`,name:`Fixture student ${index+1}`,email:`fixture${index+1}@example.test`,role:"student" as const,rollNumber:String(index+1),passwordHash: index>=39 ? temporaryPasswordHash : passwordHash,
      ...(index>=39 ? {mustChangePassword:true,authVersion:`fixture-temp-${index+1}`} : {}) }))];
  data.labs = [{ id: "fixture-lab", revision: 1, title: "Reliability fixture", description: "Isolated browser test classroom", dueDate: "", totalMarks:20,published:true,tasks:[1,2].map(index=>({id:`fixture-task-${index}`,title:`Task ${index}`,description:"Build a heading.",maxMarks:10,requirements:[{id:`heading-${index}`,label:"Heading",type:"tag" as const,value:"h1"}]})) }];
  data.submissions = [1,2].map(index=>({id:`fixture-submission-${index}`,studentId:`fixture-student-${index}`,labId:"fixture-lab",taskId:"fixture-task-1",revision:1,files:[{path:"index.html",content:source}],assets:Array.from({length:index===1?9:1},(_,asset)=>({path:asset?`image-${asset}.png`:"image.png",mimeType:"image/png"})),binaryAssets:Array.from({length:index===1?9:1},(_,asset)=>({path:asset?`image-${asset}.png`:"image.png",mimeType:"image/png",base64:image})),link:null,submittedAt:new Date().toISOString(),status:"submitted" as const,late:false}));
});
await store.close();
const app = await createApp({ dataDir:directory,production:false,demo:false,supabaseUrl:"",supabaseKey:"",mongoUri:"" });
const server = app.listen(3127,"127.0.0.1",()=>console.log("Isolated browser fixture ready on 3127"));
async function close() {
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await app.locals.store.close();
  if(path.dirname(directory)===path.resolve(os.tmpdir())&&path.basename(directory).startsWith("labtrack-browser-"))await rm(directory,{recursive:true,force:true});
  process.exit(0);
}
process.once("SIGTERM",close);process.once("SIGINT",close);
