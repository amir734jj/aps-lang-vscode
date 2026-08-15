import { ParserRuleContext, ParseTreeWalker } from 'antlr4ng';
import {
    ClassDeclarationContext,
    ModuleDeclarationContext,
    PhylumDeclarationContext,
    ProgramContext,
    TypeDeclarationContext,
    TypeFormalGroupContext,
    TypeReferenceContext
} from './generated/ApsParser';
import { ApsParserListener } from './generated/ApsParserListener';
import type { LocalDiagnostic } from './languageService';

const standardTypes = new Set([
    'Boolean', 'Character', 'IEEEdouble', 'IEEEsingle', 'Integer', 'Real',
    'Result', 'String', 'Symbol', 'Unit', 'Void'
]);

interface Scope {
    parent?: Scope;
    types: Map<string, ParserRuleContext>;
}

export interface SemanticOptions {
    knownTypes?: Iterable<string>;
    reportUnresolved?: boolean;
}

function diagnostic(message: string, context: ParserRuleContext): LocalDiagnostic {
    return {
        message,
        start: context.start?.start ?? 0,
        end: Math.max((context.start?.start ?? 0) + 1, (context.stop?.stop ?? context.start?.stop ?? 0) + 1),
        severity: 'error'
    };
}

function declarationName(context: ModuleDeclarationContext | ClassDeclarationContext): ParserRuleContext | undefined {
    return context.id(0) ?? undefined;
}

export function semanticDiagnostics(tree: ProgramContext, options: SemanticOptions = {}): LocalDiagnostic[] {
    const diagnostics: LocalDiagnostic[] = [];
    const root: Scope = { types: new Map() };
    const nestedScopes = new Map<ParserRuleContext, Scope>();
    let current = root;

    const declare = (nameContext: ParserRuleContext | undefined): void => {
        if (!nameContext) return;
        const name = nameContext.getText();
        if (current.types.has(name)) {
            diagnostics.push(diagnostic(`Duplicate type declaration '${name}'`, nameContext));
        } else {
            current.types.set(name, nameContext);
        }
    };
    const enterContainer = (context: ModuleDeclarationContext | ClassDeclarationContext): void => {
        declare(declarationName(context));
        const child: Scope = { parent: current, types: new Map() };
        nestedScopes.set(context, child);
        current = child;
    };
    const exitContainer = (): void => {
        current = current.parent ?? root;
    };

    const declarationListener = new ApsParserListener();
    declarationListener.enterModuleDeclaration = enterContainer;
    declarationListener.exitModuleDeclaration = exitContainer;
    declarationListener.enterClassDeclaration = enterContainer;
    declarationListener.exitClassDeclaration = exitContainer;
    declarationListener.enterTypeDeclaration = (context: TypeDeclarationContext) => declare(context.id());
    declarationListener.enterPhylumDeclaration = (context: PhylumDeclarationContext) => declare(context.id());
    declarationListener.enterTypeFormalGroup = (context: TypeFormalGroupContext) => {
        for (const name of context.id()) declare(name);
    };
    ParseTreeWalker.DEFAULT.walk(declarationListener, tree);

    if (!options.reportUnresolved) return diagnostics;

    const knownTypes = new Set([...standardTypes, ...(options.knownTypes ?? [])]);
    current = root;
    const isKnown = (name: string): boolean => {
        if (knownTypes.has(name)) return true;
        for (let scope: Scope | undefined = current; scope; scope = scope.parent) {
            if (scope.types.has(name)) return true;
        }
        return false;
    };

    const referenceListener = new ApsParserListener();
    referenceListener.enterModuleDeclaration = context => { current = nestedScopes.get(context) ?? current; };
    referenceListener.exitModuleDeclaration = exitContainer;
    referenceListener.enterClassDeclaration = context => { current = nestedScopes.get(context) ?? current; };
    referenceListener.exitClassDeclaration = exitContainer;
    referenceListener.enterTypeReference = (context: TypeReferenceContext) => {
        const qualified = context.simpleType()?.qualifiedUse();
        const nameContext = qualified?.id(0);
        if (!nameContext || qualified?.DOLLAR().length) return;
        const name = nameContext.getText();
        if (!isKnown(name)) diagnostics.push(diagnostic(`Unknown type '${name}'`, nameContext));
    };
    ParseTreeWalker.DEFAULT.walk(referenceListener, tree);
    return diagnostics;
}