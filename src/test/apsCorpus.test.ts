import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { analyze, completionCandidates } from '../languageService';

function findApsFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return findApsFiles(fullPath);
        return entry.isFile() && path.extname(entry.name).toLowerCase() === '.aps' ? [fullPath] : [];
    });
}

const configuredExamples = process.env.APS_EXAMPLES;
assert.ok(configuredExamples, 'APS_EXAMPLES must point to the examples directory from a cloned APS repository');
const examplesDirectory = path.resolve(configuredExamples);
assert.ok(fs.existsSync(examplesDirectory), `APS examples directory not found: ${examplesDirectory}`);
const files = findApsFiles(examplesDirectory).sort();
assert.ok(files.length > 0, `No APS examples found in ${examplesDirectory}`);
const analyses = [];
const syntaxFailures: string[] = [];

for (const fullPath of files) {
    const analysis = analyze(fs.readFileSync(fullPath, 'utf8'));
    analyses.push(analysis);
    if (analysis.diagnostics.length > 0) {
        const first = analysis.diagnostics[0];
        syntaxFailures.push(`${path.basename(fullPath)}@${first.start}: ${first.message}`);
    }
}

assert.deepStrictEqual(syntaxFailures, [], 'Every upstream APS example must parse without syntax diagnostics');
const completions = completionCandidates(analyses);
const completionKeys = new Set(completions.map(candidate => `${candidate.kind}:${candidate.name}`));
const missingCompletions = [...new Set(analyses.flatMap(analysis => analysis.symbols)
    .filter(symbol => symbol.kind !== 'pragma' && !completionKeys.has(`${symbol.kind}:${symbol.name}`))
    .map(symbol => `${symbol.kind}:${symbol.name}`))];
assert.deepStrictEqual(missingCompletions, [], 'Every indexed APS declaration must be offered as a completion');

console.log(`Upstream APS corpus: ${files.length} files parsed in-process, ${completions.length} completion candidates, all checks passed.`);