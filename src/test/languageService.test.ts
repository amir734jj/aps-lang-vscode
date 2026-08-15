import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { analyze, completionCandidates, lex, memberCompletionCandidates, tokenAt } from '../languageService';
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

const siblingPolymorphicScopes = parse('[T] begin type Local := T; end; [T] begin type Local := T; end;');
assert.deepStrictEqual(siblingPolymorphicScopes.diagnostics, []);
assert.deepStrictEqual(semanticDiagnostics(siblingPolymorphicScopes.tree, { reportUnresolved: true }), [],
	'sibling polymorphic declarations may reuse type formal and local type names');

const completions = completionCandidates([result]);
assert.ok(completions.some(candidate => candidate.kind === 'keyword' && candidate.name === 'module'));
assert.ok(completions.some(candidate => candidate.kind === 'function' && candidate.name === 'lookup'));
assert.ok(completions.some(candidate => candidate.kind === 'phylum' && candidate.name === 'Contour'));
assert.strictEqual(completions.filter(candidate => candidate.kind === 'type' && candidate.name === 'Scope').length, 1);

const memberFixture = `
phylum Node;
constructor node() : Node;
constructor pair(left,right : Node) : Node;
attribute Node.inherited_value : Integer;
attribute Node.output : Integer;
collection attribute Node.items : Integer;
pragma inherited(inherited_value);
pragma synthesized(output);
match ?lhs:Node=node() begin
    local : Node := lhs;
    lhs.;
    local.;
end;
match ?rhs=node() begin
    rhs.;
end;
match ?root:Node=pair(?left,?child) begin
	child.;
end;
`;
const memberAnalysis = analyze(memberFixture);
const memberNamesAt = (marker: string) => memberCompletionCandidates(
	memberFixture,
	memberFixture.indexOf(marker) + marker.length,
	memberAnalysis,
	[memberAnalysis]
)?.map(candidate => candidate.name);
assert.deepStrictEqual(memberNamesAt('lhs.'), ['inherited_value', 'items', 'output']);
assert.deepStrictEqual(memberNamesAt('local.'), ['inherited_value', 'items', 'output']);
assert.deepStrictEqual(memberNamesAt('rhs.'), ['inherited_value', 'items', 'output'],
	'untyped pattern bindings should infer their type from the matched constructor');
assert.deepStrictEqual(memberNamesAt('child.'), ['inherited_value', 'items', 'output'],
	'nested pattern bindings should infer grouped constructor parameter types');

const outerReceiverFixture = memberFixture.replace(
	'match ?lhs:Node=node() begin',
	'LHS : Node;\nmatch node() begin\n    LHS.;\nend;\nmatch ?lhs:Node=node() begin'
);
const outerReceiverAnalysis = analyze(outerReceiverFixture);
assert.deepStrictEqual(memberCompletionCandidates(
	outerReceiverFixture,
	outerReceiverFixture.indexOf('LHS.') + 'LHS.'.length,
	outerReceiverAnalysis,
	[outerReceiverAnalysis]
)?.map(candidate => candidate.name), ['inherited_value', 'items', 'output'],
	'top-level typed receivers should offer attributes inside a match');

const topLevelReceiverFixture = 'LHS : Node;\nLHS.;';
const topLevelReceiverAnalysis = analyze(topLevelReceiverFixture);
assert.deepStrictEqual(memberCompletionCandidates(
	topLevelReceiverFixture,
	topLevelReceiverFixture.lastIndexOf('LHS.') + 'LHS.'.length,
	topLevelReceiverAnalysis,
	[memberAnalysis, topLevelReceiverAnalysis]
)?.map(candidate => candidate.name), ['inherited_value', 'items', 'output'],
	'typed receivers should offer attributes outside a match');

const unresolvedReceiverFixture = 'unknown.';
const unresolvedReceiverAnalysis = analyze(unresolvedReceiverFixture);
assert.deepStrictEqual(memberCompletionCandidates(
	unresolvedReceiverFixture,
	unresolvedReceiverFixture.length,
	unresolvedReceiverAnalysis,
	[memberAnalysis, unresolvedReceiverAnalysis]
)?.map(candidate => candidate.name), ['inherited_value', 'items', 'output'],
	'unresolved receivers should fall back to known attributes after a dot');

const collectionFixture = memberFixture.replace('lhs.;', 'lhs. :> value;');
const collectionAnalysis = analyze(collectionFixture);
assert.deepStrictEqual(memberCompletionCandidates(
	collectionFixture,
	collectionFixture.indexOf('lhs.') + 'lhs.'.length,
	collectionAnalysis,
	[collectionAnalysis]
)?.map(candidate => candidate.name), ['items']);

const directedFixture = memberFixture.replace('lhs.;', 'lhs. := value;');
const directedAnalysis = analyze(directedFixture);
assert.deepStrictEqual(memberCompletionCandidates(
	directedFixture,
	directedFixture.indexOf('lhs.') + 'lhs.'.length,
	directedAnalysis,
	[directedAnalysis]
)?.map(candidate => candidate.name), ['items', 'output'],
	'writes to a match root should omit attributes declared inherited');

const readFixture = memberFixture.replace('child.;', 'value := child.;');
const readAnalysis = analyze(readFixture);
assert.deepStrictEqual(memberCompletionCandidates(
	readFixture,
	readFixture.indexOf('child.') + 'child.'.length,
	readAnalysis,
	[readAnalysis]
)?.map(candidate => candidate.name), ['items', 'output'],
	'reads from a match child should omit attributes declared inherited');

console.log(`APS language service: ${result.tokens.length} tokens, ${result.symbols.length} symbols, all tests passed.`);