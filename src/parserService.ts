import {
    ATNSimulator,
    BaseErrorListener,
    CharStream,
    CommonTokenStream,
    Recognizer,
    Token
} from 'antlr4ng';
import { ApsLexer } from './generated/ApsLexer';
import { ApsParser, ProgramContext } from './generated/ApsParser';
import { LocalDiagnostic } from './languageService';

class DiagnosticErrorListener extends BaseErrorListener {
    public readonly diagnostics: LocalDiagnostic[] = [];

    public override syntaxError<S extends Token, T extends ATNSimulator>(
        _recognizer: Recognizer<T>,
        offendingSymbol: S | null,
        _line: number,
        _column: number,
        message: string
    ): void {
        const start = Math.max(0, offendingSymbol?.start ?? 0);
        const stop = offendingSymbol?.stop ?? start;
        this.diagnostics.push({
            message,
            start,
            end: Math.max(start + 1, stop + 1),
            severity: 'error'
        });
    }
}

export interface ParseResult {
    tree: ProgramContext;
    diagnostics: LocalDiagnostic[];
}

export function parse(text: string): ParseResult {
    const input = CharStream.fromString(text);
    const lexer = new ApsLexer(input);
    const lexerErrors = new DiagnosticErrorListener();
    lexer.removeErrorListeners();
    lexer.addErrorListener(lexerErrors);

    const tokens = new CommonTokenStream(lexer);
    const parser = new ApsParser(tokens);
    const parserErrors = new DiagnosticErrorListener();
    parser.removeErrorListeners();
    parser.addErrorListener(parserErrors);
    const tree = parser.program();

    tokens.fill();
    const invalidTokens = tokens.getTokens().flatMap(token => {
        if (![ApsLexer.INVALID_IDENTIFIER, ApsLexer.UNKNOWN, ApsLexer.UNTERMINATED_STRING, ApsLexer.UNTERMINATED_CHARACTER].includes(token.type)) return [];
        const message = token.type === ApsLexer.INVALID_IDENTIFIER
            ? 'APS identifiers may not start with an underscore'
            : token.type === ApsLexer.UNTERMINATED_STRING
                ? 'Unterminated string constant'
                : token.type === ApsLexer.UNTERMINATED_CHARACTER
                    ? 'Unterminated character constant'
                    : `Unexpected character '${token.text ?? ''}'`;
        return [{
            message,
            start: token.start,
            end: token.stop + 1,
            severity: 'error' as const
        }];
    });

    return {
        tree,
        diagnostics: [...lexerErrors.diagnostics, ...parserErrors.diagnostics, ...invalidTokens]
    };
}