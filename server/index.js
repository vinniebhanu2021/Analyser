import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import {
  analyzeProgram,
  getCourseDependencies,
  detectDependencyCycles,
  analyzeCourseImpact,
  generateProgramReport,
  parseProgramUpload
} from "../src/analyzer.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDefinitions = [
  {
    name: "upload_program_data",
    description: "Parse JSON or CSV course data.",
    properties: {
      jsonText: { type: "string" },
      coursesCsv: { type: "string" },
      edgesCsv: { type: "string" }
    }
  },
  {
    name: "analyze_program",
    description: "Analyze prerequisite levels, cycles and downstream impact.",
    properties: { data: { type: "object" } }
  },
  {
    name: "get_course_dependencies",
    description: "Inspect direct and transitive prerequisites and dependents.",
    properties: {
      data: { type: "object" },
      courseCode: { type: "string" }
    }
  },
  {
    name: "detect_dependency_cycles",
    description: "Find circular prerequisite paths.",
    properties: { data: { type: "object" } }
  },
  {
    name: "analyze_course_impact",
    description: "Estimate downstream structural impact.",
    properties: {
      data: { type: "object" },
      courseCode: { type: "string" }
    }
  },
  {
    name: "generate_program_report",
    description: "Generate a Markdown analysis report.",
    properties: {
      data: { type: "object" },
      title: { type: "string" }
    }
  }
];

const UI_RESOURCE_URI = "ui://program-analyzer/overview-v1.html";
const widgetHtml = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><style>\nbody{font:14px system-ui,sans-serif;margin:0;padding:16px;color:var(--color);background:var(--background)}h2{margin:0 0 12px;font-size:19px}.muted{opacity:.7}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.metric{border:1px solid var(--border);border-radius:10px;padding:12px}.metric strong{display:block;font-size:23px}.metric span{font-size:11px;opacity:.7}table{border-collapse:collapse;width:100%;margin-top:14px}td,th{text-align:left;padding:9px;border-bottom:1px solid var(--border)}th{font-size:11px;opacity:.7}#empty{padding:16px;border:1px dashed var(--border);border-radius:10px}@media(max-width:480px){.grid{grid-template-columns:repeat(2,1fr)}}\n</style></head><body><h2>Program Analyzer</h2><div id=\"empty\" class=\"muted\">Run analyze_program to display dependency analysis here.</div><div id=\"view\" hidden><div class=\"grid\" id=\"metrics\"></div><h3>Course dependency overview</h3><table><thead><tr><th>Course</th><th>Level</th><th>Prerequisites</th><th>Dependents</th><th>Downstream</th></tr></thead><tbody id=\"rows\"></tbody></table><p id=\"cycles\" class=\"muted\"></p></div><script>\nconst empty=document.getElementById(\"empty\"),view=document.getElementById(\"view\");\nfunction esc(v){return String(v??\"\").replace(/[&<>\"']/g,c=>({\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",'\"':\"&quot;\",\"'\":\"&#39;\"}[c]))}\nfunction render(d){d=d?.structuredContent??d?.toolOutput??d;if(d?.analysis)d=d.analysis;if(d?.result)d=d.result;if(!d?.summary||!Array.isArray(d.courses))return;empty.hidden=true;view.hidden=false;const s=d.summary;document.getElementById(\"metrics\").innerHTML=[[\"Courses\",s.courses],[\"Prerequisite edges\",s.prerequisiteEdges],[\"Levels\",s.topologicalLevels??\"N/A\"],[\"Cycles\",d.cycles?.length??0]].map(([k,v])=>'<div class=\"metric\"><strong>'+esc(v)+'</strong><span>'+k+'</span></div>').join(\"\");document.getElementById(\"rows\").innerHTML=d.courses.map(c=>'<tr><td><b>'+esc(c.code)+'</b><br><span class=\"muted\">'+esc(c.title)+'</span></td><td>'+esc(c.level??\"N/A\")+'</td><td>'+c.directPrerequisites.length+'</td><td>'+c.directDependents.length+'</td><td>'+c.downstreamCount+'</td></tr>').join(\"\");document.getElementById(\"cycles\").textContent=d.cycles?.length?d.cycles.length+\" circular dependency path(s) detected.\":\"No circular prerequisites detected.\"}\nwindow.addEventListener(\"message\",e=>{const m=e.data;if(m?.method===\"ui/notifications/tool-result\")render(m.params?.content??m.params?.structuredContent??m.params);});\nif(window.openai?.toolOutput)render(window.openai.toolOutput);\n</script></body></html>";
const mcpTools = toolDefinitions.map((definition) => ({
  name: definition.name,
  description: definition.description,
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false
  },
  inputSchema: {
    type: "object",
    properties: definition.properties,
    additionalProperties: false
  },
  ...(definition.name === "analyze_program" ? { _meta: { ui: { resourceUri: UI_RESOURCE_URI }, "openai/outputTemplate": UI_RESOURCE_URI } } : {})
}));

function createServer() {
  const server = new Server(
    { name: "program-analyzer", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpTools }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: UI_RESOURCE_URI, name: "Program Analyzer dashboard", mimeType: "text/html;profile=mcp-app" }] }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri !== UI_RESOURCE_URI) throw new Error("Unknown resource.");
    return { contents: [{ uri: UI_RESOURCE_URI, mimeType: "text/html;profile=mcp-app", text: widgetHtml, _meta: { ui: { prefersBorder: true } } }] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments ?? {};
    try {
      let result;
      if (request.params.name === "upload_program_data") {
        result = { normalizedData: parseProgramUpload(args) };
      } else {
        const data = args.data;
        if (!data) throw new Error("Pass normalized data in data.");

        switch (request.params.name) {
          case "analyze_program":
            result = analyzeProgram(data);
            break;
          case "get_course_dependencies":
            result = getCourseDependencies(data, args.courseCode);
            break;
          case "detect_dependency_cycles":
            result = detectDependencyCycles(data);
            break;
          case "analyze_course_impact":
            result = analyzeCourseImpact(data, args.courseCode);
            break;
          case "generate_program_report":
            result = generateProgramReport(data, args.title);
            break;
          default:
            throw new Error("Unknown tool.");
        }
      }

      return {
        ...(request.params.name === "analyze_program" ? { structuredContent: result } : {}),
        content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: "Program Analyzer: " + error.message
        }]
      };
    }
  });

  return server;
}

const app = express();
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));
app.use(express.json({
  limit: process.env.MAX_BODY_SIZE ?? "5mb"
}));
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../public")));
app.use("/mcp", rateLimit({
  windowMs: 60000,
  limit: Number(process.env.MCP_RATE_LIMIT ?? 120)
}));

app.get("/healthz", (_request, response) => {
  response.json({
    status: "ok",
    service: "program-analyzer-mcp"
  });
});

app.get("/api/info", (_request, response) => {
  response.json({ name: "Program Analyzer", mcpEndpoint: "/mcp", health: "/healthz" });
});

app.post("/api/analyze", (request, response) => {
  try {
    const data = parseProgramUpload({ jsonText: JSON.stringify(request.body.data ?? {}) });
    response.json({ analysis: analyzeProgram(data), report: generateProgramReport(data, request.body.title ?? "Program Dependency Analysis") });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post("/api/impact", (request, response) => {
  try {
    const data = parseProgramUpload({ jsonText: JSON.stringify(request.body.data ?? {}) });
    response.json({ impact: analyzeCourseImpact(data, String(request.body.courseCode ?? "")) });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post("/mcp", async (request, response) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error("[MCP] Request failed:", error?.stack ?? error);
    if (!response.headersSent) {
      response.status(500).json({ error: "MCP request failed", detail: error?.message ?? String(error) });
    }
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
});

app.all("/mcp", (_request, response) => {
  response.status(405).json({ error: "Use POST." });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "0.0.0.0", () => {
  console.log("Program Analyzer MCP listening on port " + port);
});
