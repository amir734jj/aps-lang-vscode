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
    diagnostics: LocalDiagnostic[];
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

export function analyze(text: string, semanticOptions: SemanticOptions = {}): Analysis {
    const lexical = lex(text);
    const parsed = parse(text);
    return {
        tokens: lexical.tokens,
        symbols: collectSymbols(text, lexical.tokens),
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