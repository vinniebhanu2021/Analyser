import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProgram, detectDependencyCycles, getCourseDependencies, generateProgramReport } from "../src/analyzer.js";
const data={COURSES:[{code:"A"},{code:"B"},{code:"C"},{code:"D"}],EDGES:[{from:"A",to:"B"},{from:"B",to:"C"}]};
test("levels and downstream impact",()=>{const a=analyzeProgram(data);assert.equal(a.summary.topologicalLevels,3);assert.equal(a.highestDownstreamImpact[0].code,"A");});
test("direct and transitive relationships",()=>{assert.deepEqual(getCourseDependencies(data,"A").allDownstreamDependents.sort(),["B","C"]);});
test("cycles are detected",()=>{const x={COURSES:[{code:"A"},{code:"B"}],EDGES:[{from:"A",to:"B"},{from:"B",to:"A"}]};assert.equal(detectDependencyCycles(x).cycleCount,1);});
test("report is markdown",()=>assert.match(generateProgramReport(data),/Highest downstream impact/));