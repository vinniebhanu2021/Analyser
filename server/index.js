import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
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
  }
}));

function createServer() {
  const server = new Server(
    { name: "program-analyzer", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpTools
  }));

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
        content: [{
          type: "text",
          text: typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2)
        }]
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
    if (!response.headersSent) {
      response.status(500).json({ error: "MCP request failed" });
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
