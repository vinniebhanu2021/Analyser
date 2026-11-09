export function normalizeProgram(input) {
  const courses = input?.COURSES ?? input?.courses ?? [];
  const edges = input?.EDGES ?? input?.edges ?? [];
  if (!Array.isArray(courses) || !Array.isArray(edges)) throw new Error("COURSES and EDGES must be arrays.");
  if (courses.length > 5000 || edges.length > 20000) throw new Error("Dataset exceeds supported size.");
  const byCode = new Map();
  for (const c of courses) {
    const code = String(c?.code ?? "").trim();
    if (!code) throw new Error("Every course needs a code.");
    if (byCode.has(code)) throw new Error("Duplicate course code: " + code);
    byCode.set(code, { ...c, code });
  }
  const unknown = [], valid = [];
  for (const e of edges) {
    const from = String(e?.from ?? "").trim(), to = String(e?.to ?? "").trim();
    if (!from || !to) throw new Error("Every edge needs from and to.");
    if (!byCode.has(from) || !byCode.has(to)) unknown.push({ from, to });
    else valid.push({ from, to, type: String(e.type ?? "prereq").toLowerCase() });
  }
  return { COURSES: [...byCode.values()], EDGES: valid, DWF: input?.DWF ?? [], validation: { courseCount: courses.length, edgeCount: edges.length, unknownEdgeReferences: unknown } };
}
function graph(input) {
  const p = normalizeProgram(input), codes = p.COURSES.map(c => c.code), adj = new Map(codes.map(c => [c, []])), rev = new Map(codes.map(c => [c, []]));
  for (const e of p.EDGES.filter(e => e.type === "prereq")) { adj.get(e.from).push(e.to); rev.get(e.to).push(e.from); }
  return { p, adj, rev };
}
function reach(start, map) {
  const seen = new Set(), stack = [...(map.get(start) ?? [])];
  while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); stack.push(...(map.get(x) ?? [])); }
  return [...seen];
}
export function detectDependencyCycles(input) {
  const { p, adj } = graph(input), state = new Map(), cycles = [];
  for (const c of p.COURSES.map(x => x.code)) {
    if (state.has(c)) continue;
    const path = [], active = new Map(), stack = [{ c, i: 0 }];
    state.set(c, 1); active.set(c, 0); path.push(c);
    while (stack.length) {
      const f = stack[stack.length - 1], nexts = adj.get(f.c);
      if (f.i >= nexts.length) { stack.pop(); active.delete(f.c); path.pop(); state.set(f.c, 2); continue; }
      const n = nexts[f.i++];
      if (active.has(n)) cycles.push([...path.slice(active.get(n)), n]);
      else if (!state.has(n)) { state.set(n, 1); active.set(n, path.length); path.push(n); stack.push({ c: n, i: 0 }); }
    }
  }
  return { cycles, cycleCount: cycles.length };
}
export function analyzeProgram(input) {
  const { p, adj, rev } = graph(input), indeg = new Map([...rev].map(([k,v]) => [k,v.length]));
  const q = [...indeg].filter(([,n]) => n === 0).map(([k]) => k), level = new Map(q.map(c => [c,0]));
  for (let i=0; i<q.length; i++) for (const n of adj.get(q[i])) { level.set(n, Math.max(level.get(n) ?? 0, (level.get(q[i]) ?? 0)+1)); indeg.set(n, indeg.get(n)-1); if (!indeg.get(n)) q.push(n); }
  const cycles = detectDependencyCycles(input), hasCycle = q.length !== p.COURSES.length;
  const courses = p.COURSES.map(c => ({ code:c.code, title:c.title ?? "", level:hasCycle?null:level.get(c.code), directPrerequisites:rev.get(c.code), directDependents:adj.get(c.code), upstreamCount:reach(c.code,rev).length, downstreamCount:reach(c.code,adj).length })).sort((a,b)=>b.downstreamCount-a.downstreamCount);
  return { summary:{ courses:p.COURSES.length, prerequisiteEdges:p.EDGES.filter(e=>e.type==="prereq").length, topologicalLevels:hasCycle||!q.length?null:Math.max(...level.values())+1, cycleDetected:hasCycle }, validation:p.validation, cycles:cycles.cycles, highestDownstreamImpact:courses.slice(0,10), courses };
}
export function getCourseDependencies(input, code) {
  const { p, adj, rev } = graph(input); if (!p.COURSES.some(c=>c.code===code)) throw new Error("Unknown course code: "+code);
  return { courseCode:code, directPrerequisites:rev.get(code), allPrerequisites:reach(code,rev), directDependents:adj.get(code), allDownstreamDependents:reach(code,adj) };
}
export function analyzeCourseImpact(input, code) { const d=getCourseDependencies(input,code); return { courseCode:code, directDependents:d.directDependents, affectedDownstreamCourses:d.allDownstreamDependents, affectedCourseCount:d.allDownstreamDependents.length, warning:"Structural estimate only; substitutions and academic policy are not modeled." }; }
export function generateProgramReport(input,title="Program Dependency Analysis") {
  const a=analyzeProgram(input);
  return [ "# "+title, "", "## Summary", "- Courses: "+a.summary.courses, "- Prerequisite edges: "+a.summary.prerequisiteEdges, "- Topological levels: "+(a.summary.topologicalLevels ?? "Unavailable"), "- Cycles: "+a.cycles.length, "", "## Highest downstream impact", ...a.highestDownstreamImpact.map(c=>"- "+c.code+": "+c.downstreamCount+" downstream"), "", "## Circular prerequisites", ...(a.cycles.length?a.cycles.map(c=>"- "+c.join(" -> ")):["None detected."]) ].join("\n");
}
export function parseCSV(text) {
  const lines=String(text??"").trim().split(/\r?\n/); if (!lines[0]) return [];
  const split=s=>s.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.filter(Boolean).map(x=>x.replace(/,$/,"").replace(/^"|"$/g,"").replace(/""/g,'"'))??[];
  const headers=split(lines.shift()).map(x=>x.trim());
  return lines.map(line=>Object.fromEntries(split(line).map((v,i)=>[headers[i],v])));
}
export function parseProgramUpload({jsonText,coursesCsv,edgesCsv}) {
  if (jsonText) return normalizeProgram(JSON.parse(jsonText));
  return normalizeProgram({ COURSES:parseCSV(coursesCsv), EDGES:parseCSV(edgesCsv).map(e=>({...e,type:e.type||"prereq"})), DWF:[] });
}