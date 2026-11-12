export function normalizeProgram(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Program data must be a JSON object.");
  }

  const courses = input.COURSES ?? input.courses ?? [];
  const edges = input.EDGES ?? input.edges ?? [];
  const dwf = input.DWF ?? input.dwf ?? [];

  if (!Array.isArray(courses) || !Array.isArray(edges) || !Array.isArray(dwf)) {
    throw new Error("COURSES, EDGES, and DWF must be arrays.");
  }
  if (courses.length > 5000 || edges.length > 20000) {
    throw new Error("Dataset exceeds supported size (5,000 courses / 20,000 edges).");
  }

  const byCode = new Map();
  for (const [index, course] of courses.entries()) {
    if (!course || typeof course !== "object" || Array.isArray(course)) {
      throw new Error(`Course at row ${index + 1} must be an object.`);
    }
    const code = String(course.code ?? "").trim();
    if (!code) throw new Error(`Course at row ${index + 1} needs a code.`);
    if (byCode.has(code)) throw new Error("Duplicate course code: " + code);
    byCode.set(code, { ...course, code });
  }

  const validEdges = [];
  const unknownEdgeReferences = [];
  const ignoredEdgeTypes = [];
  const seenEdges = new Set();

  for (const [index, edge] of edges.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      throw new Error(`Edge at row ${index + 1} must be an object.`);
    }
    const from = String(edge.from ?? "").trim();
    const to = String(edge.to ?? "").trim();
    if (!from || !to) throw new Error(`Edge at row ${index + 1} needs from and to.`);

    const type = String(edge.type ?? "prereq").trim().toLowerCase() || "prereq";
    if (!byCode.has(from) || !byCode.has(to)) {
      unknownEdgeReferences.push({ from, to, type, row: index + 1 });
      continue;
    }
    if (type !== "prereq") {
      ignoredEdgeTypes.push({ from, to, type, row: index + 1 });
      continue;
    }

    const key = JSON.stringify([from, to, type]);
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    validEdges.push({ from, to, type });
  }

  return {
    COURSES: [...byCode.values()],
    EDGES: validEdges,
    DWF: dwf,
    validation: {
      courseCount: courses.length,
      inputEdgeCount: edges.length,
      prerequisiteEdgeCount: validEdges.length,
      unknownEdgeReferences,
      ignoredEdgeTypes,
      duplicateEdgesRemoved: edges.length - unknownEdgeReferences.length - ignoredEdgeTypes.length - validEdges.length
    }
  };
}

function graph(input) {
  const program = normalizeProgram(input);
  const codes = program.COURSES.map(course => course.code);
  const adjacency = new Map(codes.map(code => [code, []]));
  const reverse = new Map(codes.map(code => [code, []]));

  for (const edge of program.EDGES) {
    adjacency.get(edge.from).push(edge.to);
    reverse.get(edge.to).push(edge.from);
  }
  return { program, adjacency, reverse };
}

function reachable(start, adjacency) {
  const visited = new Set();
  const stack = [...(adjacency.get(start) ?? [])];

  while (stack.length) {
    const code = stack.pop();
    if (visited.has(code)) continue;
    visited.add(code);
    stack.push(...(adjacency.get(code) ?? []));
  }
  return [...visited];
}

export function detectDependencyCycles(input) {
  const { program, adjacency } = graph(input);
  const state = new Map();
  const cycles = [];

  for (const course of program.COURSES.map(item => item.code)) {
    if (state.has(course)) continue;

    const path = [];
    const activeIndex = new Map();
    const stack = [{ code: course, nextIndex: 0 }];
    state.set(course, 1);
    activeIndex.set(course, 0);
    path.push(course);

    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbors = adjacency.get(frame.code);

      if (frame.nextIndex >= neighbors.length) {
        stack.pop();
        activeIndex.delete(frame.code);
        path.pop();
        state.set(frame.code, 2);
        continue;
      }

      const next = neighbors[frame.nextIndex++];
      if (activeIndex.has(next)) {
        cycles.push([...path.slice(activeIndex.get(next)), next]);
      } else if (!state.has(next)) {
        state.set(next, 1);
        activeIndex.set(next, path.length);
        path.push(next);
        stack.push({ code: next, nextIndex: 0 });
      }
    }
  }

  return { cycles, cycleCount: cycles.length };
}

export function analyzeProgram(input) {
  const { program, adjacency, reverse } = graph(input);
  const inDegree = new Map([...reverse].map(([code, prerequisites]) => [code, prerequisites.length]));
  const queue = [...inDegree].filter(([, count]) => count === 0).map(([code]) => code);
  const level = new Map(queue.map(code => [code, 0]));

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    for (const dependent of adjacency.get(current)) {
      level.set(dependent, Math.max(level.get(dependent) ?? 0, level.get(current) + 1));
      inDegree.set(dependent, inDegree.get(dependent) - 1);
      if (inDegree.get(dependent) === 0) queue.push(dependent);
    }
  }

  const cycleResult = detectDependencyCycles(input);
  const hasCycle = queue.length !== program.COURSES.length;
  const courses = program.COURSES.map(course => ({
    code: course.code,
    title: course.title ?? "",
    level: hasCycle ? null : (level.get(course.code) ?? 0),
    directPrerequisites: reverse.get(course.code),
    directDependents: adjacency.get(course.code),
    upstreamCount: reachable(course.code, reverse).length,
    downstreamCount: reachable(course.code, adjacency).length
  })).sort((a, b) => b.downstreamCount - a.downstreamCount || a.code.localeCompare(b.code));

  const topologicalLevels = hasCycle || level.size === 0
    ? null
    : Math.max(...level.values()) + 1;

  return {
    summary: {
      courses: program.COURSES.length,
      prerequisiteEdges: program.EDGES.length,
      topologicalLevels,
      cycleDetected: hasCycle
    },
    validation: program.validation,
    cycles: cycleResult.cycles,
    highestDownstreamImpact: courses.slice(0, 10),
    courses
  };
}

export function getCourseDependencies(input, courseCode) {
  const { program, adjacency, reverse } = graph(input);
  const code = String(courseCode ?? "").trim();
  if (!program.COURSES.some(course => course.code === code)) {
    throw new Error("Unknown course code: " + code);
  }

  return {
    courseCode: code,
    directPrerequisites: reverse.get(code),
    allPrerequisites: reachable(code, reverse),
    directDependents: adjacency.get(code),
    allDownstreamDependents: reachable(code, adjacency)
  };
}

export function analyzeCourseImpact(input, courseCode) {
  const dependencies = getCourseDependencies(input, courseCode);
  return {
    courseCode: dependencies.courseCode,
    directDependents: dependencies.directDependents,
    affectedDownstreamCourses: dependencies.allDownstreamDependents,
    affectedCourseCount: dependencies.allDownstreamDependents.length,
    warning: "Structural estimate only; substitutions, course availability, and academic policy are not modeled."
  };
}

export function generateProgramReport(input, title = "Program Dependency Analysis") {
  const analysis = analyzeProgram(input);
  const lines = [
    "# " + String(title || "Program Dependency Analysis").replace(/[\\r\\n]+/g, " ").trim(),
    "",
    "## Summary",
    "- Courses: " + analysis.summary.courses,
    "- Prerequisite edges: " + analysis.summary.prerequisiteEdges,
    "- Topological levels: " + (analysis.summary.topologicalLevels ?? "Unavailable (cycle detected or no courses)"),
    "- Circular prerequisite paths: " + analysis.cycles.length,
    "",
    "## Data validation",
    "- Unknown course references: " + analysis.validation.unknownEdgeReferences.length,
    "- Non-prerequisite edge types ignored: " + analysis.validation.ignoredEdgeTypes.length,
    "- Duplicate prerequisite edges removed: " + analysis.validation.duplicateEdgesRemoved,
    "",
    "## Highest downstream impact",
    ...analysis.highestDownstreamImpact.map(course => "- " + course.code + ": " + course.downstreamCount + " downstream course(s)"),
    "",
    "## Circular prerequisites",
    ...(analysis.cycles.length
      ? analysis.cycles.map(cycle => "- " + cycle.join(" -> "))
      : ["None detected."]),
    "",
    "> Structural analysis only; this report is not academic advising."
  ];
  return lines.join("\n");
}

// RFC 4180-style CSV reader: supports escaped quotes, commas, and line breaks
// inside quoted fields. Invalid quoting and inconsistent row widths are rejected.
export function parseCSV(text) {
  const source = String(text ?? "");
  if (!source.trim()) return [];

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];

    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(field);
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(field);
  if (row.some(value => value.length > 0)) rows.push(row);
  if (!rows.length) return [];

  const headers = rows.shift().map((header, index) => {
    const normalized = header.trim().replace(/^\\uFEFF/, "");
    if (!normalized) throw new Error("CSV column " + (index + 1) + " has an empty header.");
    return normalized;
  });
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate column headers.");

  return rows.map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
  });
}

export function parseProgramUpload({ jsonText, coursesCsv, edgesCsv } = {}) {
  if (jsonText !== undefined && jsonText !== null && String(jsonText).trim()) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error("Invalid program JSON: " + error.message);
    }
    return normalizeProgram(parsed);
  }

  if (!coursesCsv && !edgesCsv) {
    throw new Error("Provide jsonText or at least one CSV input.");
  }

  return normalizeProgram({
    COURSES: parseCSV(coursesCsv),
    EDGES: parseCSV(edgesCsv).map(edge => ({ ...edge, type: edge.type || "prereq" })),
    DWF: []
  });
}
