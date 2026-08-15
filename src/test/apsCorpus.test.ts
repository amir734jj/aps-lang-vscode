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

const configuredCorpus = process.env.APS_CORPUS;
assert.ok(configuredCorpus, 'APS_CORPUS must point to a directory from a cloned APS repository');
const corpusDirectory = path.resolve(configuredCorpus);
assert.ok(fs.existsSync(corpusDirectory), `APS corpus directory not found: ${corpusDirectory}`);
const files = findApsFiles(corpusDirectory).sort();
assert.ok(files.length > 0, `No APS files found in ${corpusDirectory}`);
const analyses = [];
const diagnosticFailures: string[] = [];

for (const fullPath of files) {
    const analysis = analyze(fs.readFileSync(fullPath, 'utf8'));
    analyses.push(analysis);
    if (analysis.diagnostics.length > 0) {
        const first = analysis.diagnostics[0];
        diagnosticFailures.push(`${path.basename(fullPath)}@${first.start}: ${first.message}`);
    }
}

assert.deepStrictEqual(diagnosticFailures, [], 'Every upstream APS file must pass syntax and semantic diagnostics');
const completions = completionCandidates(analyses);
const completionKeys = new Set(completions.map(candidate => `${candidate.kind}:${candidate.name}`));
const missingCompletions = [...new Set(analyses.flatMap(analysis => analysis.symbols)
    .filter(symbol => symbol.kind !== 'pragma' && !completionKeys.has(`${symbol.kind}:${symbol.name}`))
    .map(symbol => `${symbol.kind}:${symbol.name}`))];
assert.deepStrictEqual(missingCompletions, [], 'Every indexed APS declaration must be offered as a completion');

console.log(`Upstream APS corpus: ${files.length} files analyzed in-process, ${completions.length} completion candidates, all checks passed.`);