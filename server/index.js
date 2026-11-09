import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { analyzeProgram, getCourseDependencies, detectDependencyCycles, analyzeCourseImpact, generateProgramReport, parseProgramUpload } from "../src/analyzer.js";
const tools = [
 ["upload_program_data","Parse JSON or CSV course data.",{jsonText:{type:"string"},coursesCsv:{type:"string"},edgesCsv:{type:"string"}}],
 ["analyze_program","Analyze prerequisite levels, cycles and downstream impact.",{data:{type:"object"}}],
 ["get_course_dependencies","Inspect direct and transitive prerequisites and dependents.",{data:{type:"object"},courseCode:{type:"string"}}],
 ["detect_dependency_cycles","Find circular prerequisite paths.",{data:{type:"object}}],
 ["analyze_course_impact","Estimate downstream structural impact.",{data:{type:"object"},courseCode:{type:"string"}}],
 ["generate_program_report","Generate a Markdown analysis report.",{data:{type:"object"},title:{type:"string"}}]
].map(([name,description,properties])=>({name,description,annotations:{readOnlyHint:true,openWorldHint:false,destructiveHint:false},inputSchema:{type:"object",properties,additionalProperties:false}}));
function createServer() {
 const s=new Server({name:"program-analyzer",version:"1.0.0"},{capabilities:{tools:{}}});
 s.setRequestHandler(ListToolsRequestSchema,async()=>({tools}));
 s.setRequestHandler(CallToolRequestSchema,async r=>{
  const a=r.params.arguments??{}; try {
   let out;
   if(r.params.name==="upload_program_data") out={normalizedData:parseProgramUpload(a)};
   else { const d=a.data; if(!d) throw new Error("Pass normalized data in data.");
    switch(r.params.name) { case "analyze_program":out=analyzeProgram(d);break; case "get_course_dependencies":out=getCourseDependencies(d,a.courseCode);break; case "detect_dependency_cycles":out=detectDependencyCycles(d);break; case "analyze_course_impact":out=analyzeCourseImpact(d,a.courseCode);break; case "generate_program_report":out=generateProgramReport(d,a.title);break; default:throw new Error("Unknown tool."); }
   }
   return {content:[{type:"text",text:typeof out==="string"?out:JSON.stringify(out,null,2)}]};
  } catch(e) { return {isError:true,content:[{type:"text",text:"Program Analyzer: "+e.message}]}; }
 });
 return s;
}
const app=express(); app.disable("x-powered-by"); app.use(helmet({contentSecurityPolicy:false,crossOriginResourcePolicy:false})); app.use(express.json({limit:process.env.MAX_BODY_SIZE??"5mb"}));
app.use("/mcp",rateLimit({windowMs:60000,limit:Number(process.env.MCP_RATE_LIMIT??120)}));
app.get("/healthz",(_q,r)=>r.json({status:"ok",service:"program-analyzer-mcp"}));
app.get("/",(_q,r)=>r.json({name:"Program Analyzer",mcpEndpoint:"/mcp",health:"/healthz"}));
app.post("/mcp",async(req,res)=>{ const s=createServer(),t=new StreamableHTTPServerTransport({sessionIdGenerator:undefined}); try { await s.connect(t); await t.handleRequest(req,res,req.body); } catch(e) { if(!res.headersSent) res.status(500).json({error:"MCP request failed"}); } finally { await t.close().catch(()=>{}); await s.close().catch(()=>{}); } });
app.all("/mcp",(_q,r)=>r.status(405).json({error:"Use POST."}));
app.listen(Number(process.env.PORT??3000),"0.0.0.0",()=>console.log("Program Analyzer MCP listening"));
