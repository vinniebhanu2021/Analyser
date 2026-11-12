import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProgram, detectDependencyCycles, getCourseDependencies, analyzeCourseImpact, generateProgramReport, normalizeProgram, parseCSV, parseProgramUpload } from "../src/analyzer.js";

const data={COURSES:[{code:"A"},{code:"B"},{code:"C"},{code:"D"}],EDGES:[{from:"A",to:"B"},{from:"B",to:"C"}]};
test("levels and downstream impact",()=>{const a=analyzeProgram(data);assert.equal(a.summary.topologicalLevels,3);assert.equal(a.highestDownstreamImpact[0].code,"A");});
test("direct and transitive relationships",()=>{assert.deepEqual(getCourseDependencies(data,"A").allDownstreamDependents.sort(),["B","C"]);assert.deepEqual(getCourseDependencies(data,"C").allPrerequisites.sort(),["A","B"]);});
test("cycles and self-loops are detected",()=>{const x={COURSES:[{code:"A"},{code:"B"}],EDGES:[{from:"A",to:"B"},{from:"B",to:"A"}]};assert.equal(detectDependencyCycles(x).cycleCount,1);assert.deepEqual(detectDependencyCycles({COURSES:[{code:"A"}],EDGES:[{from:"A",to:"A"}]}).cycles,[["A","A"]]);});
test("cycles prevent topological levels",()=>{const x={COURSES:[{code:"A"},{code:"B"}],EDGES:[{from:"A",to:"B"},{from:"B",to:"A"}]};assert.equal(analyzeProgram(x).summary.topologicalLevels,null);});
test("normalization validates input",()=>{assert.throws(()=>normalizeProgram(null),/JSON object/);assert.throws(()=>normalizeProgram({COURSES:[{code:"A"},{code:"A"}]}),/Duplicate course code/);assert.throws(()=>normalizeProgram({COURSES:"A",EDGES:[]}),/must be arrays/);});
test("normalization reports unknown refs and removes duplicate edges",()=>{const p=normalizeProgram({COURSES:[{code:"A"},{code:"B"}],EDGES:[{from:"A",to:"B"},{from:"A",to:"B"},{from:"X",to:"B"},{from:"A",to:"B",type:"corequisite"}]});assert.equal(p.EDGES.length,1);assert.equal(p.validation.unknownEdgeReferences.length,1);assert.equal(p.validation.ignoredEdgeTypes.length,1);assert.equal(p.validation.duplicateEdgesRemoved,1);});
test("CSV supports quoted commas, quotes, and embedded newlines",()=>{const r=parseCSV('code,title\r\nA,"Algebra, I"\r\nB,"A ""quoted"" title"\r\nC,"Line one\nLine two"');assert.equal(r[0].title,"Algebra, I");assert.equal(r[1].title,'A "quoted" title');assert.equal(r[2].title,"Line one\nLine two");});
test("CSV rejects malformed quoting and inconsistent rows",()=>{assert.throws(()=>parseCSV('code,title\nA,"bad'),/unterminated/);assert.throws(()=>parseCSV("code,title\nA"),/expected 2/);});
test("upload errors are actionable",()=>{assert.throws(()=>parseProgramUpload({jsonText:"{"}),/Invalid program JSON/);assert.throws(()=>parseProgramUpload({}),/Provide jsonText/);});
test("impact is clearly structural",()=>{const i=analyzeCourseImpact(data,"A");assert.equal(i.affectedCourseCount,2);assert.match(i.warning,/Structural estimate only/);});
test("report includes validation details",()=>{assert.match(generateProgramReport(data),/Highest downstream impact/);assert.match(generateProgramReport(data),/Data validation/);});
