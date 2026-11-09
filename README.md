# Program Analyzer

Independent, open-source MCP service for academic course catalog and prerequisite dependency analysis.

## Project status

This repository contains an independent implementation and synthetic sample data. It deliberately excludes the professor-provided HTML application, original BSU Mathematics dataset, and professor-owned branding. Do not redistribute those materials without written permission.

The source package is available at [program-analyzer-production-candidate.zip](./program-analyzer-production-candidate.zip). Extract the archive to obtain the Node.js project.

## Features

- JSON and CSV course/prerequisite data parsing and validation
- Prerequisite and dependent relationships
- Topological levels for acyclic graphs
- Circular prerequisite detection
- Direct and transitive dependency inspection
- Downstream course impact estimates
- Markdown report generation
- Stateless MCP service; uploaded data is not persisted by the service

## Requirements

- Node.js 20+
- npm

## Run locally

After extracting the source archive:

```bash
npm install
npm test
npm run check
npm start
```

Health endpoint: `/healthz`  
Streamable HTTP MCP endpoint: `/mcp`

## Important limitations

This is a production candidate, not a fully deployed or directory-approved ChatGPT app. Remote hosting, endpoint interoperability tests, privacy/support/legal pages, security review, and OpenAI app-directory submission and approval are still required. Directory inclusion is not guaranteed.

The service analyzes only data supplied by the user; it does not connect to university SIS/catalog systems. Structural impact is an estimate, not academic advising.

## License

MIT applies only to independently authored code in the source archive. Third-party dependencies retain their own licenses. No professor-owned source, dataset, or university branding is included.
