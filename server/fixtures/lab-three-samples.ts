import type { Submission } from "../../shared/types.js";

export const labThreeHtml = [
  '<!doctype html><html><head><title>CSS exercise</title><style>body{background-color:lightgray}a:link{color:navy}a:hover{color:red}a:visited{color:purple}</style><link rel="stylesheet" href="style.css"></head><body><h1 style="color:navy">Styling exercise</h1><a target="_blank" href="https://example.com">Visit</a><a href="#section2">Jump</a><section id="section2"><a href="#section2"><img src="photo.png" style="float:left" alt="Photo"></a><p>Text wrapping around the photograph.</p></section></body></html>',
  '<!doctype html><html><head><title>Marquee exercise</title></head><body><marquee behavior="scroll" direction="left">Continuous</marquee><marquee behavior="alternate">Bounce</marquee><marquee behavior="slide">Slide</marquee><marquee direction="up" style="height:200px;width:300px;border:2px solid black">Up</marquee><marquee><img src="photo.png" alt="Photo"></marquee></body></html>',
  '<!doctype html><html><head><title>Tables and lists</title></head><body><table style="margin:auto;border:1px solid black"><tr><th>Student ID</th><th>Name</th><th>Department</th><th>GPA</th></tr><tr><td>1</td><td>A</td><td rowspan="3">CS</td><td>3.5</td></tr><tr><td>2</td><td>B</td><td>3.6</td></tr><tr><td>3</td><td>C</td><td>3.7</td></tr></table><ol type="I"><li>OOP</li><li>Web Engineering</li><li>Database Systems</li></ol><ul style="list-style-type:square"><li>HTML5<ol type="a"><li>Headings</li><li>Tables</li></ol></li><li>CSS3</li></ul><dl><dt>HTML</dt><dd>HyperText Markup Language</dd><dt>CSS</dt><dd>Cascading Style Sheets</dd></dl></body></html>',
] as const;

export function labThreeSample(task: number, content: string = labThreeHtml[task]): Submission {
  return { id:"synthetic-"+task,studentId:"student-"+task,labId:"lab3",taskId:"lab3-task"+(task+1),revision:1,
    files:[{path:"solution.htm",content},...(task===0?[{path:"style.css",content:"img{float:left}"}]:[])],
    assets:task<2?[{path:"photo.png",mimeType:"image/png"}]:[],link:null,submittedAt:"2026-10-17T00:00:00Z",
    status:"submitted",late:false };
}
