import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { analyze, completionCandidates, lex, tokenAt } from '../languageService';
import { parse } from '../parserService';
import { semanticDiagnostics } from '../semanticService';

const example = fs.readFileSync(path.resolve(__dirname, '../../example/simple-binding.aps'), 'utf8');
const result = analyze(example);

assert.strictEqual(result.diagnostics.length, 0, 'the bundled APS example should have no local diagnostics');
assert.strictEqual(parse(example).diagnostics.length, 0, 'the bundled APS example should parse with ANTLR');
assert.ok(result.symbols.some(symbol => symbol.kind === 'module' && symbol.name === 'NAME_RESOLUTION'));
assert.ok(result.symbols.some(symbol => symbol.kind === 'phylum' && symbol.name === 'Contour'));
assert.ok(result.symbols.some(symbol => symbol.kind === 'attribute' && symbol.name === 'enclosing'));
assert.ok(result.symbols.some(symbol => symbol.kind === 'constructor' && symbol.name === 'entity'));
assert.ok(result.symbols.some(symbol => symbol.kind === 'function' && symbol.name === 'lookup'));

const lookupUse = example.lastIndexOf('lookup(id,e.expr_scope)');
assert.strictEqual(tokenAt(result, lookupUse)?.text, 'lookup');
assert.ok(result.tokens.some(token => token.kind === 'comment'));
assert.ok(result.tokens.some(token => token.kind === 'string' && token.text === '"integer"'));
assert.ok(result.tokens.some(token => token.kind === 'operator' && token.text === ':>'));

const invalid = lex('_invalid : String; "unterminated');
assert.strictEqual(invalid.diagnostics.length, 2);

const unclosedBlock = analyze('module Broken[] begin\nphylum Node;');
assert.ok(unclosedBlock.diagnostics.length > 0);
const unmatchedBlock = analyze('phylum Node;\nend;');
assert.ok(unmatchedBlock.diagnostics.length > 0);
assert.ok(parse('module Broken[] begin\nphylum Node;').diagnostics.length > 0);

const upstreamForms = parse(`
module FORMS[] begin
	private;
	type T;
	var;
	repeated = value...;
	typed = (value : T);
	public;
end;
type {.};
`);
assert.deepStrictEqual(upstreamForms.diagnostics, [], 'upstream declaration and expression forms should parse');
assert.ok(parse('pragma p("raw\nnewline");').diagnostics.some(diagnostic => diagnostic.message === 'Unterminated string constant'));
assert.ok(parse("pragma p('raw\nnewline);").diagnostics.some(diagnostic => diagnostic.message === 'Unterminated character constant'));
assert.ok(parse('value = 1.2_3;').diagnostics.length > 0, 'real fractional parts may not contain underscores');

const semanticFixture = fs.readFileSync(path.resolve(__dirname, '../../src/test/fixtures/semantic-error.aps'), 'utf8');
const semanticParse = parse(semanticFixture);
assert.deepStrictEqual(semanticParse.diagnostics, []);
assert.ok(analyze(semanticFixture, { reportUnresolved: true }).diagnostics
	.some(diagnostic => diagnostic.message === "Unknown type 'MissingType'"));

const duplicateParse = parse('module DUP[] begin type Item; phylum Item; end;');
assert.ok(semanticDiagnostics(duplicateParse.tree)
	.some(diagnostic => diagnostic.message === "Duplicate type declaration 'Item'"));

const completions = completionCandidates([result]);
assert.ok(completions.some(candidate => candidate.kind === 'keyword' && candidate.name === 'module'));
assert.ok(completions.some(candidate => candidate.kind === 'function' && candidate.name === 'lookup'));
assert.ok(completions.some(candidate => candidate.kind === 'phylum' && candidate.name === 'Contour'));
assert.strictEqual(completions.filter(candidate => candidate.kind === 'type' && candidate.name === 'Scope').length, 1);

console.log(`APS language service: ${result.tokens.length} tokens, ${result.symbols.length} symbols, all tests passed.`);