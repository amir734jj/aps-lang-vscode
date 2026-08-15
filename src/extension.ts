import * as path from 'path';
import * as vscode from 'vscode';
import { Analysis, analyze, ApsSymbol, ApsSymbolKind, completionCandidates, tokenAt } from './languageService';
import { SemanticOptions } from './semanticService';

const selector: vscode.DocumentSelector = { language: 'aps', scheme: 'file' };
const analyses = new Map<string, Analysis>();
const localDiagnostics = vscode.languages.createDiagnosticCollection('aps');
const output = vscode.window.createOutputChannel('APS');

function key(uri: vscode.Uri): string {
    return uri.toString();
}

function indexDocument(document: vscode.TextDocument, semanticOptions?: SemanticOptions): Analysis {
    const result = analyze(document.getText(), semanticOptions);
    analyses.set(key(document.uri), result);
    localDiagnostics.set(document.uri, result.diagnostics.map(item => {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(document.positionAt(item.start), document.positionAt(item.end)),
            item.message,
            item.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'APS';
        return diagnostic;
    }));
    return result;
}

async function analysisFor(uri: vscode.Uri): Promise<{ document: vscode.TextDocument; analysis: Analysis }> {
    const document = await vscode.workspace.openTextDocument(uri);
    return { document, analysis: analyses.get(key(uri)) ?? indexDocument(document) };
}

function symbolKind(kind: ApsSymbolKind): vscode.SymbolKind {
    const kinds: Record<ApsSymbolKind, vscode.SymbolKind> = {
        module: vscode.SymbolKind.Module,
        class: vscode.SymbolKind.Class,
        signature: vscode.SymbolKind.Interface,
        type: vscode.SymbolKind.TypeParameter,
        phylum: vscode.SymbolKind.Class,
        constructor: vscode.SymbolKind.Constructor,
        pattern: vscode.SymbolKind.Function,
        function: vscode.SymbolKind.Function,
        procedure: vscode.SymbolKind.Method,
        attribute: vscode.SymbolKind.Field,
        variable: vscode.SymbolKind.Variable,
        parameter: vscode.SymbolKind.Variable,
        pragma: vscode.SymbolKind.Event
    };
    return kinds[kind];
}

function completionKind(kind: ApsSymbolKind): vscode.CompletionItemKind {
    if (kind === 'function' || kind === 'procedure' || kind === 'pattern') return vscode.CompletionItemKind.Function;
    if (kind === 'constructor') return vscode.CompletionItemKind.Constructor;
    if (kind === 'attribute') return vscode.CompletionItemKind.Field;
    if (['module', 'class', 'signature', 'type', 'phylum'].includes(kind)) return vscode.CompletionItemKind.Class;
    return vscode.CompletionItemKind.Variable;
}

function definitionsNamed(name: string): Array<{ uri: vscode.Uri; symbol: ApsSymbol }> {
    const matches: Array<{ uri: vscode.Uri; symbol: ApsSymbol }> = [];
    for (const [uri, analysis] of analyses) {
        for (const symbol of analysis.symbols) {
            if (symbol.name === name && symbol.kind !== 'parameter' && symbol.kind !== 'pragma') {
                matches.push({ uri: vscode.Uri.parse(uri), symbol });
            }
        }
    }
    return matches;
}

async function location(uri: vscode.Uri, start: number, end: number): Promise<vscode.Location> {
    const document = await vscode.workspace.openTextDocument(uri);
    return new vscode.Location(uri, new vscode.Range(document.positionAt(start), document.positionAt(end)));
}

async function reindexWorkspace(): Promise<void> {
    const files = await vscode.workspace.findFiles('**/*.aps', '**/{node_modules,.git}/**');
    const currentFiles = new Set(files.map(key));
    for (const uri of analyses.keys()) {
        if (!currentFiles.has(uri) && !vscode.workspace.textDocuments.some(document => key(document.uri) === uri && document.languageId === 'aps')) {
            analyses.delete(uri);
        }
    }
    await Promise.all(files.map(async uri => indexDocument(await vscode.workspace.openTextDocument(uri))));
    output.appendLine(`Indexed ${files.length} APS file(s).`);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(localDiagnostics, output);
    for (const document of vscode.workspace.textDocuments.filter(item => item.languageId === 'aps')) indexDocument(document);
    await reindexWorkspace();

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => { if (document.languageId === 'aps') indexDocument(document); }),
        vscode.workspace.onDidChangeTextDocument(event => { if (event.document.languageId === 'aps') indexDocument(event.document); }),
        vscode.workspace.onDidCreateFiles(event => {
            for (const uri of event.files.filter(file => path.extname(file.fsPath).toLowerCase() === '.aps')) {
                void vscode.workspace.openTextDocument(uri).then(indexDocument);
            }
        }),
        vscode.workspace.onDidDeleteFiles(event => {
            for (const uri of event.files) {
                analyses.delete(key(uri));
                localDiagnostics.delete(uri);
            }
        }),
        vscode.workspace.onDidRenameFiles(event => {
            for (const { oldUri, newUri } of event.files) {
                analyses.delete(key(oldUri));
                localDiagnostics.delete(oldUri);
                if (path.extname(newUri.fsPath).toLowerCase() === '.aps') {
                    void vscode.workspace.openTextDocument(newUri).then(indexDocument);
                }
            }
        }),
        vscode.commands.registerCommand('aps.validateFile', () => {
            const document = vscode.window.activeTextEditor?.document;
            if (document?.languageId !== 'aps') return;
            const knownTypes = [...analyses.values()].flatMap(analysis => analysis.symbols
                .filter(symbol => ['module', 'class', 'type', 'phylum'].includes(symbol.kind))
                .map(symbol => symbol.name));
            const result = indexDocument(document, { knownTypes, reportUnresolved: true });
            const message = result.diagnostics.length === 0
                ? 'APS validation passed.'
                : `APS validation found ${result.diagnostics.length} diagnostic(s).`;
            void vscode.window.showInformationMessage(message);
        }),
        vscode.commands.registerCommand('aps.reindexWorkspace', reindexWorkspace),
        vscode.languages.registerCompletionItemProvider(selector, {
            provideCompletionItems: () => {
                return completionCandidates(analyses.values()).map(candidate => {
                    const kind = candidate.kind === 'keyword' ? vscode.CompletionItemKind.Keyword : completionKind(candidate.kind);
                    const item = new vscode.CompletionItem(candidate.name, kind);
                    item.detail = candidate.detail;
                    return item;
                });
            }
        }),
        vscode.languages.registerHoverProvider(selector, {
            provideHover: (document, position) => {
                const current = indexDocument(document);
                const token = tokenAt(current, document.offsetAt(position));
                if (!token || token.kind !== 'identifier') return undefined;
                const localDefinitions = current.symbols.filter(symbol => symbol.name === token.text && symbol.start <= token.start);
                const local = localDefinitions[localDefinitions.length - 1];
                const definition = local ?? definitionsNamed(token.text)[0]?.symbol;
                if (!definition) return undefined;
                const markdown = new vscode.MarkdownString();
                markdown.appendCodeblock(definition.detail, 'aps');
                markdown.appendMarkdown(`\n**${definition.kind}**`);
                return new vscode.Hover(markdown, new vscode.Range(document.positionAt(token.start), document.positionAt(token.end)));
            }
        }),
        vscode.languages.registerDefinitionProvider(selector, {
            provideDefinition: async (document, position) => {
                const current = indexDocument(document);
                const token = tokenAt(current, document.offsetAt(position));
                if (!token || token.kind !== 'identifier') return undefined;
                const localDefinitions = current.symbols.filter(symbol => symbol.name === token.text && symbol.start <= token.start);
                const local = localDefinitions[localDefinitions.length - 1];
                if (local) return location(document.uri, local.start, local.end);
                return Promise.all(definitionsNamed(token.text).map(match => location(match.uri, match.symbol.start, match.symbol.end)));
            }
        }),
        vscode.languages.registerReferenceProvider(selector, {
            provideReferences: async (_document, position, options) => {
                const source = await analysisFor(_document.uri);
                const token = tokenAt(source.analysis, source.document.offsetAt(position));
                if (!token || token.kind !== 'identifier') return [];
                const results: vscode.Location[] = [];
                for (const [uriText, analysis] of analyses) {
                    const uri = vscode.Uri.parse(uriText);
                    const definitions = new Set(analysis.symbols.filter(symbol => symbol.name === token.text).map(symbol => symbol.start));
                    for (const candidate of analysis.tokens) {
                        if (candidate.kind !== 'identifier' || candidate.text !== token.text || (!options.includeDeclaration && definitions.has(candidate.start))) continue;
                        results.push(await location(uri, candidate.start, candidate.end));
                    }
                }
                return results;
            }
        }),
        vscode.languages.registerDocumentSymbolProvider(selector, {
            provideDocumentSymbols: document => indexDocument(document).symbols.map(symbol => new vscode.DocumentSymbol(
                symbol.name,
                symbol.detail,
                symbolKind(symbol.kind),
                new vscode.Range(document.positionAt(symbol.declarationStart), document.positionAt(symbol.declarationEnd)),
                new vscode.Range(document.positionAt(symbol.start), document.positionAt(symbol.end))
            ))
        }),
        vscode.languages.registerWorkspaceSymbolProvider({
            provideWorkspaceSymbols: async query => {
                const symbols: vscode.SymbolInformation[] = [];
                for (const [uriText, analysis] of analyses) {
                    const uri = vscode.Uri.parse(uriText);
                    for (const symbol of analysis.symbols.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))) {
                        symbols.push(new vscode.SymbolInformation(symbol.name, symbolKind(symbol.kind), '', await location(uri, symbol.start, symbol.end)));
                    }
                }
                return symbols;
            }
        })
    );
}

export function deactivate(): void {
    analyses.clear();
}