# Program Analyzer

An independently implemented, open-source MCP service for academic course catalog and prerequisite dependency analysis.

## Features
- Parse JSON or CSV course and prerequisite data
- Build prerequisite/dependent relationships
- Calculate topological levels for acyclic graphs
- Detect circular prerequisite paths
- Inspect direct and transitive dependencies
- Estimate downstream structural impact
- Generate Markdown reports

## Requirements
- Node.js 20+
- npm

## Local development
```bash
npm install
npm test
npm run check
npm start
```

Health endpoint: `/healthz`  
Streamable HTTP MCP endpoint: `/mcp`

## Data format
```json
{
  "COURSES": [{"code":"MATH 101","title":"Foundations of Mathematics"}],
  "EDGES": [{"from":"MATH 101","to":"MATH 102","type":"prereq"}],
  "DWF": []
}
```
An edge points from prerequisite (`from`) to dependent course (`to`).

## MCP tools
- `upload_program_data`
- `analyze_program`
- `get_course_dependencies`
- `detect_dependency_cycles`
- `analyze_course_impact`
- `generate_program_report`

The service is stateless: pass the returned normalized data into later analysis calls. It does not persist uploaded datasets.

## Ownership and scope
This is an independent implementation with synthetic example data. The professor-provided HTML application, original BSU Mathematics dataset, and professor-owned branding are intentionally excluded. Do not redistribute them without written permission. No professor or university endorsement is implied.

## Deployment and ChatGPT directory
See [DEPLOYMENT.md](DEPLOYMENT.md). Public GitHub publication does not automatically publish a ChatGPT app. A stable hosted HTTPS MCP endpoint, verified publisher identity, product/support/privacy/terms URLs, testing evidence, and OpenAI review and approval are still required. Directory inclusion is not guaranteed.

## Limitations
This tool analyzes only data supplied by the user; it does not connect to university SIS/catalog systems. Impact estimates are structural and are not academic advising.

## License
MIT. Third-party dependencies retain their own licenses. The license applies only to independently authored project code.
