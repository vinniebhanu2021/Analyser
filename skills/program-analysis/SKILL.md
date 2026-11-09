---
name: program-analysis
description: Analyze academic course catalogs, prerequisite dependencies, cycles, course impact and reports using the Program Analyzer tools.
---

# Program Analyzer

Use Program Analyzer MCP tools for calculations. Never invent course relationships or metrics.

## Canonical data
Use JSON shaped as `{ "COURSES": [], "EDGES": [], "DWF": [] }`. Course rows require `code`. Edge rows require `from` and `to`; prerequisite edges use `type: "prereq"`.

An edge points from prerequisite course (`from`) to dependent course (`to`).

## Workflow
1. Call `upload_program_data` for supplied JSON or CSV.
2. Pass its normalized data to `analyze_program`.
3. Use `get_course_dependencies` for direct and transitive paths.
4. Use `detect_dependency_cycles` for circular prerequisites.
5. Use `analyze_course_impact` for structural downstream impact.
6. Use `generate_program_report` when a report is requested.
7. Disclose unknown references and limitations. Do not treat structural impact as academic advice.
