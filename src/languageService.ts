import { parse } from './parserService';
import { semanticDiagnostics, SemanticOptions } from './semanticService';

export const keywords = [
    'and', 'attribute', 'begin', 'case', 'circular', 'class', 'collection',
    'constant', 'constructor', 'elscase', 'else', 'elsif', 'end', 'endif',
    'extends', 'for', 'function', 'if', 'in', 'infix', 'infixl', 'infixr',
    'inherit', 'input', 'match', 'module', 'not', 'on', 'or', 'pattern',
    'phylum', 'pragma', 'private', 'procedure', 'public', 'remote', 'signature',
    'then', 'type', 'var', 'with'
] as const;

const keywordSet = new Set<string>(keywords);
const declarationKeywords = new Set([
    'module', 'class', 'signature', 'type', 'phylum', 'constructor', 'pattern',
    'function', 'procedure'
]);

export type TokenKind = 'identifier' | 'keyword' | 'string' | 'number' |
    'operator' | 'punctuation' | 'comment';

export interface Token {
    kind: TokenKind;
    text: string;
    start: number;
    end: number;
}

export type ApsSymbolKind = 'module' | 'class' | 'signature' | 'type' | 'phylum' |
    'constructor' | 'pattern' | 'function' | 'procedure' | 'attribute' |
    'variable' | 'parameter' | 'pragma';

export interface ApsSymbol {
    name: string;
    kind: ApsSymbolKind;
    start: number;
    end: number;
    declarationStart: number;
    declarationEnd: number;
    detail: string;
}

export interface LocalDiagnostic {
    message: string;
    start: number;
    end: number;
    severity: 'error' | 'warning';
}

export interface Analysis {
    tokens: Token[];
    symbols: ApsSymbol[];
    attributes: AttributeInfo[];
    constructors: ConstructorInfo[];
    diagnostics: LocalDiagnostic[];
}

export interface AttributeInfo {
    name: string;
    receiverType: string;
    resultType: string;
    collection: boolean;
    direction?: 'inherited' | 'synthesized';
    detail: string;
}

export interface ConstructorInfo {
    name: string;
    parameterTypes: string[];
    resultType: string;
}

const punctuation = new Set('[](){}:;.,?!'.split(''));
const operatorCharacters = new Set('~@#$%^&*+=<>/\\|-'.split(''));

export function lex(text: string): { tokens: Token[]; diagnostics: LocalDiagnostic[] } {
    const tokens: Token[] = [];
    const diagnostics: LocalDiagnostic[] = [];
    let offset = 0;

    while (offset < text.length) {
        const start = offset;
        const current = text[offset];
        if (/\s/.test(current)) {
            offset++;
            continue;
        }
        if (current === '-' && text[offset + 1] === '-') {
            offset += 2;
            while (offset < text.length && text[offset] !== '\n') offset++;
            tokens.push({ kind: 'comment', text: text.slice(start, offset), start, end: offset });
            continue;
        }
        if (current === '"' || current === "'") {
            const quote = current;
            offset++;
            let terminated = false;
            while (offset < text.length) {
                if (text[offset] === '\\') {
                    offset += Math.min(2, text.length - offset);
                } else if (text[offset] === quote) {
                    offset++;
                    terminated = true;
                    break;
                } else {
                    offset++;
                }
            }
            tokens.push({ kind: 'string', text: text.slice(start, offset), start, end: offset });
            if (!terminated) {
                diagnostics.push({ message: `Unterminated ${quote === '"' ? 'string' : 'character'} constant`, start, end: offset, severity: 'error' });
            }
            continue;
        }
        if (current === '`') {
            offset++;
            while (offset < text.length && text[offset] !== '`') offset++;
            if (text[offset] === '`') offset++;
            tokens.push({ kind: 'operator', text: text.slice(start, offset), start, end: offset });
            continue;
        }
        if (/[A-Za-z_]/.test(current)) {
            offset++;
            while (offset < text.length && /[A-Za-z0-9_]/.test(text[offset])) offset++;
            const value = text.slice(start, offset);
            tokens.push({ kind: keywordSet.has(value) ? 'keyword' : 'identifier', text: value, start, end: offset });
            if (value.startsWith('_') && value !== '_') {
                diagnostics.push({ message: 'APS identifiers may not start with an underscore', start, end: offset, severity: 'warning' });
            }
            continue;
        }
        if (/[0-9]/.test(current)) {
            offset++;
            while (offset < text.length && /[A-Za-z0-9_]/.test(text[offset])) offset++;
            if (text[offset] === '.' && /[0-9]/.test(text[offset + 1] ?? '')) {
                offset++;
                while (offset < text.length && /[A-Za-z0-9_]/.test(text[offset])) offset++;
            }
            tokens.push({ kind: 'number', text: text.slice(start, offset), start, end: offset });
            continue;
        }
        const compound = [':::', '...', '::', ':=', ':>', ':?', '->', '..']
            .find(candidate => text.startsWith(candidate, offset));
        if (compound) {
            offset += compound.length;
            tokens.push({ kind: 'operator', text: compound, start, end: offset });
            continue;
        }
        if (operatorCharacters.has(current)) {
            offset++;
            while (offset < text.length && operatorCharacters.has(text[offset]) && !text.startsWith('--', offset)) offset++;
            tokens.push({ kind: 'operator', text: text.slice(start, offset), start, end: offset });
            continue;
        }
        offset++;
        tokens.push({ kind: punctuation.has(current) ? 'punctuation' : 'operator', text: current, start, end: offset });
    }

    return { tokens, diagnostics };
}

function lineEnd(text: string, offset: number): number {
    const newline = text.indexOf('\n', offset);
    return newline === -1 ? text.length : newline;
}

function declarationEnd(text: string, token: Token): number {
    const semicolon = text.indexOf(';', token.end);
    const begin = text.search(/\bbegin\b/g);
    const candidates = [semicolon, begin >= token.end ? begin : -1].filter(value => value >= 0);
    return candidates.length ? Math.min(...candidates) + 1 : lineEnd(text, token.end);
}

function nextIdentifier(tokens: Token[], from: number): { token: Token; index: number } | undefined {
    for (let index = from; index < tokens.length; index++) {
        if (tokens[index].kind === 'identifier') return { token: tokens[index], index };
        if (tokens[index].text === ';' || tokens[index].text === 'begin') return undefined;
    }
    return undefined;
}

function collectSymbols(text: string, tokens: Token[]): ApsSymbol[] {
    const symbols: ApsSymbol[] = [];
    const definitionOffsets = new Set<number>();
    const add = (token: Token, kind: ApsSymbolKind, declarationStart: number) => {
        if (definitionOffsets.has(token.start)) return;
        definitionOffsets.add(token.start);
        const end = declarationEnd(text, token);
        symbols.push({
            name: token.text,
            kind,
            start: token.start,
            end: token.end,
            declarationStart,
            declarationEnd: end,
            detail: text.slice(declarationStart, end).replace(/\s+/g, ' ').trim()
        });
    };

    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.kind === 'comment' || token.kind === 'string') continue;
        if (declarationKeywords.has(token.text)) {
            const name = nextIdentifier(tokens, index + 1);
            if (name) add(name.token, token.text as ApsSymbolKind, token.start);
            continue;
        }
        if (token.text === 'attribute') {
            const first = nextIdentifier(tokens, index + 1);
            if (!first) continue;
            const dot = tokens[first.index + 1];
            const second = tokens[first.index + 2];
            add(dot?.text === '.' && second?.kind === 'identifier' ? second : first.token, 'attribute', token.start);
            continue;
        }
        if (token.text === 'pragma') {
            const name = nextIdentifier(tokens, index + 1);
            if (name) add(name.token, 'pragma', token.start);
            continue;
        }
        if (token.text === '?') {
            const name = tokens[index + 1];
            if (name?.kind === 'identifier') add(name, 'parameter', token.start);
            continue;
        }
        if (token.kind === 'identifier' && tokens[index + 1]?.text === ':') {
            const previous = tokens[index - 1]?.text;
            if (previous === undefined || [';', 'begin', '(', ',', '?', 'var', 'collection'].includes(previous)) {
                add(token, previous === '(' || previous === ',' ? 'parameter' : 'variable', token.start);
            }
        }
    }
    return symbols;
}

function collectAttributeInfo(text: string, tokens: Token[]): AttributeInfo[] {
    const attributes: AttributeInfo[] = [];
    for (let index = 0; index < tokens.length; index++) {
        if (tokens[index].text !== 'attribute') continue;
        const receiver = tokens[index + 1];
        const dot = tokens[index + 2];
        const name = tokens[index + 3];
        const colon = tokens[index + 4];
        const resultType = tokens[index + 5];
        if (receiver?.kind !== 'identifier' || dot?.text !== '.' || name?.kind !== 'identifier' ||
            colon?.text !== ':' || resultType?.kind !== 'identifier') continue;
        const declarationStart = tokens[index - 1]?.text === 'collection' ? tokens[index - 1].start : tokens[index].start;
        const declarationStop = declarationEnd(text, name);
        attributes.push({
            name: name.text,
            receiverType: receiver.text,
            resultType: resultType.text,
            collection: tokens[index - 1]?.text === 'collection',
            detail: text.slice(declarationStart, declarationStop).replace(/\s+/g, ' ').trim()
        });
    }
    for (let index = 0; index < tokens.length; index++) {
        if (tokens[index].text !== 'pragma' || !['inherited', 'synthesized'].includes(tokens[index + 1]?.text) ||
            tokens[index + 2]?.text !== '(') continue;
        const direction = tokens[index + 1].text as 'inherited' | 'synthesized';
        for (let cursor = index + 3; cursor < tokens.length && tokens[cursor].text !== ')'; cursor++) {
            if (tokens[cursor].kind !== 'identifier') continue;
            for (const attribute of attributes.filter(candidate => candidate.name === tokens[cursor].text)) {
                attribute.direction = direction;
            }
        }
    }
    return attributes;
}

function collectConstructorInfo(tokens: Token[]): ConstructorInfo[] {
    const constructors: ConstructorInfo[] = [];
    for (let index = 0; index < tokens.length; index++) {
        if (tokens[index].text !== 'constructor' || tokens[index + 1]?.kind !== 'identifier') continue;
        const parameterTypes: string[] = [];
        let depth = 0;
        let parameterNames = 0;
        for (let cursor = index + 2; cursor < tokens.length && tokens[cursor].text !== ';'; cursor++) {
            if (tokens[cursor].text === '(') {
                depth++;
                continue;
            }
            if (tokens[cursor].text === ')') {
                depth--;
                continue;
            }
            if (depth === 1 && tokens[cursor].kind === 'identifier' && tokens[cursor - 1]?.text !== ':') {
                parameterNames++;
                continue;
            }
            if (depth === 1 && tokens[cursor].text === ':' && tokens[cursor + 1]?.kind === 'identifier') {
                parameterTypes.push(...Array<string>(parameterNames).fill(tokens[cursor + 1].text));
                parameterNames = 0;
                cursor++;
                continue;
            }
            if (tokens[cursor].text !== ':' || depth !== 0 || tokens[cursor + 1]?.kind !== 'identifier') continue;
            constructors.push({ name: tokens[index + 1].text, parameterTypes, resultType: tokens[cursor + 1].text });
            break;
        }
    }
    return constructors;
}

export function analyze(text: string, semanticOptions: SemanticOptions = {}): Analysis {
    const lexical = lex(text);
    const parsed = parse(text);
    return {
        tokens: lexical.tokens,
        symbols: collectSymbols(text, lexical.tokens),
        attributes: collectAttributeInfo(text, lexical.tokens),
        constructors: collectConstructorInfo(lexical.tokens),
        diagnostics: [
            ...lexical.diagnostics,
            ...parsed.diagnostics,
            ...semanticDiagnostics(parsed.tree, semanticOptions)
        ]
    };
}

export function tokenAt(analysis: Analysis, offset: number): Token | undefined {
    return analysis.tokens.find(token => token.start <= offset && offset <= token.end && token.kind !== 'comment');
}

export interface CompletionCandidate {
    name: string;
    kind: 'keyword' | ApsSymbolKind;
    detail?: string;
}

export function completionCandidates(analyses: Iterable<Analysis>): CompletionCandidate[] {
    const candidates: CompletionCandidate[] = keywords.map(name => ({ name, kind: 'keyword' }));
    const seen = new Set<string>();
    for (const analysis of analyses) {
        for (const symbol of analysis.symbols) {
            const identity = `${symbol.kind}:${symbol.name}`;
            if (seen.has(identity) || symbol.kind === 'pragma') continue;
            seen.add(identity);
            candidates.push({ name: symbol.name, kind: symbol.kind, detail: symbol.detail });
        }
    }
    return candidates;
}

interface MatchScope {
    matchToken: number;
    beginToken: number;
}

interface ReceiverInfo {
    type: string;
    role: 'root' | 'child' | 'local';
}

function enclosingMatch(tokens: Token[], offset: number): MatchScope | undefined {
    const blocks: Array<MatchScope | undefined> = [];
    let statementStart = 0;
    for (let index = 0; index < tokens.length && tokens[index].start < offset; index++) {
        const token = tokens[index];
        if (token.kind === 'comment' || token.kind === 'string') continue;
        if (token.text === 'begin') {
            let matchToken: number | undefined;
            for (let cursor = index - 1; cursor >= statementStart; cursor--) {
                if (tokens[cursor].text === 'match') {
                    matchToken = cursor;
                    break;
                }
            }
            blocks.push(matchToken === undefined ? undefined : { matchToken, beginToken: index });
            statementStart = index + 1;
        } else if (token.text === 'end') {
            blocks.pop();
            statementStart = index + 1;
        } else if (token.text === ';') {
            statementStart = index + 1;
        }
    }
    return [...blocks].reverse().find((scope): scope is MatchScope => scope !== undefined);
}

function constructorSignatures(analyses: Iterable<Analysis>): Map<string, ConstructorInfo> {
    const results = new Map<string, ConstructorInfo>();
    for (const analysis of analyses) {
        for (const constructor of analysis.constructors) results.set(constructor.name, constructor);
    }
    return results;
}

function matchingParen(tokens: Token[], open: number, limit: number): number | undefined {
    let depth = 0;
    for (let index = open; index < limit; index++) {
        if (tokens[index].text === '(') depth++;
        if (tokens[index].text === ')' && --depth === 0) return index;
    }
    return undefined;
}

function bindConstructorArguments(
    tokens: Token[],
    start: number,
    limit: number,
    constructors: Map<string, ConstructorInfo>,
    bindings: Map<string, ReceiverInfo>
): void {
    for (let index = start; index < limit; index++) {
        const signature = constructors.get(tokens[index].text);
        if (!signature || tokens[index + 1]?.text !== '(') continue;
        const close = matchingParen(tokens, index + 1, limit);
        if (close === undefined) continue;
        let argumentStart = index + 2;
        let argumentIndex = 0;
        let depth = 0;
        for (let cursor = argumentStart; cursor <= close; cursor++) {
            const separator = cursor === close || (depth === 0 && [',', ';'].includes(tokens[cursor].text));
            if (separator) {
                const expectedType = signature.parameterTypes[argumentIndex];
                if (expectedType && tokens[argumentStart]?.text === '?' && tokens[argumentStart + 1]?.kind === 'identifier') {
                    bindings.set(tokens[argumentStart + 1].text, { type: expectedType, role: 'child' });
                }
                bindConstructorArguments(tokens, argumentStart, cursor, constructors, bindings);
                argumentStart = cursor + 1;
                argumentIndex++;
            } else if (tokens[cursor].text === '(') {
                depth++;
            } else if (tokens[cursor].text === ')') {
                depth--;
            }
        }
        index = close;
    }
}

function matchBindings(analysis: Analysis, scope: MatchScope, analyses: Iterable<Analysis>): Map<string, ReceiverInfo> {
    const bindings = new Map<string, ReceiverInfo>();
    const constructors = constructorSignatures(analyses);
    const tokens = analysis.tokens;
    let firstBinding = true;
    for (let index = scope.matchToken + 1; index < scope.beginToken; index++) {
        if (tokens[index].text !== '?' || tokens[index + 1]?.kind !== 'identifier') continue;
        const name = tokens[index + 1].text;
        const role = firstBinding ? 'root' : 'child';
        firstBinding = false;
        if (tokens[index + 2]?.text === ':' && tokens[index + 3]?.kind === 'identifier') {
            bindings.set(name, { type: tokens[index + 3].text, role });
        } else if (tokens[index + 2]?.text === '=' && tokens[index + 3]?.kind === 'identifier') {
            const signature = constructors.get(tokens[index + 3].text);
            if (signature) bindings.set(name, { type: signature.resultType, role });
        }
    }
    bindConstructorArguments(tokens, scope.matchToken + 1, scope.beginToken, constructors, bindings);
    return bindings;
}

function receiverInfo(analysis: Analysis, receiver: string, offset: number, analyses: Iterable<Analysis>): ReceiverInfo | undefined {
    const scope = enclosingMatch(analysis.tokens, offset);
    if (!scope) return undefined;
    const bindings = matchBindings(analysis, scope, analyses);
    for (let index = scope.beginToken + 1; index < analysis.tokens.length && analysis.tokens[index].start < offset; index++) {
        const name = analysis.tokens[index];
        const colon = analysis.tokens[index + 1];
        const type = analysis.tokens[index + 2];
        if (name.kind === 'identifier' && colon?.text === ':' && type?.kind === 'identifier') {
            bindings.set(name.text, { type: type.text, role: 'local' });
        }
    }
    return bindings.get(receiver);
}

export function memberCompletionCandidates(
    text: string,
    offset: number,
    current: Analysis,
    analyses: Iterable<Analysis>
): CompletionCandidate[] | undefined {
    const memberAccess = /\b([A-Za-z][A-Za-z0-9_]*)\s*\.\s*[A-Za-z0-9_]*$/.exec(text.slice(0, offset));
    if (!memberAccess) return undefined;
    const allAnalyses = [...analyses];
    if (!allAnalyses.includes(current)) allAnalyses.push(current);
    const receiver = receiverInfo(current, memberAccess[1], offset, allAnalyses);
    if (!receiver) return [];
    const statementEnd = text.indexOf(';', offset);
    const remainder = text.slice(offset, statementEnd === -1 ? text.length : statementEnd);
    const collectionAssignment = remainder.includes(':>');
    const memberStart = offset - memberAccess[0].length;
    const statementStart = text.lastIndexOf(';', memberStart) + 1;
    const assignmentBefore = /:>|:=/.test(text.slice(statementStart, memberStart));
    const assignmentAfter = /:>|:=/.test(remainder);
    const expectedDirection = (!assignmentBefore && !assignmentAfter) || receiver.role === 'local'
        ? undefined
        : assignmentAfter === (receiver.role === 'root') ? 'synthesized' : 'inherited';
    const seen = new Set<string>();
    const candidates: CompletionCandidate[] = [];
    for (const analysis of allAnalyses) {
        for (const attribute of analysis.attributes) {
            if (attribute.receiverType !== receiver.type || (collectionAssignment && !attribute.collection) ||
                (expectedDirection && attribute.direction && attribute.direction !== expectedDirection) || seen.has(attribute.name)) continue;
            seen.add(attribute.name);
            candidates.push({ name: attribute.name, kind: 'attribute', detail: attribute.detail });
        }
    }
    return candidates.sort((left, right) => left.name.localeCompare(right.name));
}