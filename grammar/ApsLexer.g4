lexer grammar ApsLexer;

// TypeScript port of grammar/upstream/aps.lex. Dynamic fixity classification is
// performed after parsing because ANTLR token types cannot change at runtime.

TRIPLE_COLON: ':::';
ELLIPSIS: '...';
DOUBLE_COLON: '::';
COLON_EQUAL: ':=';
COLON_GREATER: ':>';
COLON_QUESTION: ':?';
ARROW: '->';
DOT_DOT: '..';

AND: 'and';
ATTRIBUTE: 'attribute';
BEGIN: 'begin';
CASE: 'case';
CIRCULAR: 'circular';
CLASS: 'class';
COLLECTION: 'collection';
CONSTANT: 'constant';
CONSTRUCTOR: 'constructor';
ELSCASE: 'elscase';
ELSE: 'else';
ELSIF: 'elsif';
END: 'end';
ENDIF: 'endif';
EXTENDS: 'extends';
FOR: 'for';
FUNCTION: 'function';
IF: 'if';
IN: 'in';
INFIX: 'infix';
INFIXL: 'infixl';
INFIXR: 'infixr';
INHERIT: 'inherit';
INPUT: 'input';
MATCH: 'match';
MODULE: 'module';
NOT: 'not';
ON: 'on';
OR: 'or';
PATTERN: 'pattern';
PHYLUM: 'phylum';
PRAGMA: 'pragma';
PRIVATE: 'private';
PROCEDURE: 'procedure';
PUBLIC: 'public';
REMOTE: 'remote';
SIGNATURE: 'signature';
THEN: 'then';
TYPE: 'type';
VAR: 'var';
WITH: 'with';

LPAREN: '(';
RPAREN: ')';
LBRACKET: '[';
RBRACKET: ']';
LBRACE: '{';
RBRACE: '}';
COLON: ':';
SEMICOLON: ';';
DOT: '.';
COMMA: ',';
QUESTION: '?';
EXCLAMATION: '!';
EQUAL: '=';
DOLLAR: '$';
MINUS: '-';

REAL: [0-9][A-Za-z0-9_]* '.' [0-9][A-Za-z0-9]*;
INTEGER: [0-9][A-Za-z0-9_]*;
STRING: '"' (ESCAPED_CHARACTER | ~[\r\n"\\])* '"';
CHARACTER: '\'' (ESCAPED_CHARACTER | ~[\r\n'\\])* '\'';
UNTERMINATED_STRING: '"' (ESCAPED_CHARACTER | ~[\r\n"\\])*;
UNTERMINATED_CHARACTER: '\'' (ESCAPED_CHARACTER | ~[\r\n'\\])*;
BACKTICK_OPERATOR: '`' [A-Za-z_] [A-Za-z0-9_]* '`';
IDENTIFIER: [A-Za-z] [A-Za-z0-9_]*;
ANONYMOUS: '_';
INVALID_IDENTIFIER: '_' [A-Za-z0-9_]+;
LINE_COMMENT: '--' ~[\r\n]* -> channel(HIDDEN);
OPERATOR: (SPECIAL | '-' SPECIAL)+ '-'?;
WS: [ \t\r\n\f]+ -> channel(HIDDEN);
UNKNOWN: .;

fragment SPECIAL: [~@#$%^&*+=<>/\\|];
fragment ESCAPED_CHARACTER: '\\' ('\r'? '\n' | .);