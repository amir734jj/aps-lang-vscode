parser grammar ApsParser;

options { tokenVocab=ApsLexer; }

// TypeScript port of grammar/upstream/aps.y. Operator precedence declared by
// infix/infixl/infixr is intentionally parsed generically for a semantic pass.

program: unit* EOF;

unit
    : withUnit
    | fixityDeclaration
    | visibilityDirective
    | declaration
    ;

withUnit: WITH STRING SEMICOLON;
fixityDeclaration: (INFIX | INFIXL | INFIXR) INTEGER? operator SEMICOLON;
visibilityDirective: (PRIVATE | PUBLIC) SEMICOLON;

declaration
    : declarationModifier* declarationCore
    ;

declarationModifier: PRIVATE | PUBLIC | VAR;

declarationCore
    : moduleDeclaration
    | classDeclaration
    | signatureDeclaration
    | typeDeclaration
    | phylumDeclaration
    | constructorDeclaration
    | patternDeclaration
    | attributeDeclaration
    | functionDeclaration
    | pragmaDeclaration
    | inheritanceDeclaration
    | replacementDeclaration
    | matchStatement
    | valueDeclaration
    | polymorphicDeclaration
    ;

moduleDeclaration
    : MODULE id polymorphism formals? signatureConstraint? resultKind? id? extension? moduleBody
    | MODULE id EQUAL qualifiedUse SEMICOLON
    ;

classDeclaration
    : CLASS id polymorphism id? signatureConstraint? moduleBody
    | CLASS id EQUAL qualifiedUse SEMICOLON
    ;

signatureDeclaration
    : SIGNATURE id (COLON_EQUAL | EQUAL) signature SEMICOLON
    ;

typeDeclaration
    : TYPE id signatureConstraint? ((COLON_EQUAL | EQUAL) typeReference)? SEMICOLON
    ;

phylumDeclaration
    : PHYLUM id signatureConstraint? ((COLON_EQUAL | EQUAL) typeReference)? SEMICOLON
    ;

constructorDeclaration: CONSTRUCTOR id formals resultValue SEMICOLON;

patternDeclaration
    : PATTERN id formals id? typeAnnotation? patternBody SEMICOLON
    | PATTERN id COLON typeReference patternBody SEMICOLON
    | PATTERN id EQUAL pattern SEMICOLON
    ;

patternBody: ((COLON_EQUAL | EQUAL) patternList?)?;

attributeDeclaration
    : direction? ATTRIBUTE attributeReceiver DOT id COLON typeReference defaultValue? SEMICOLON
    ;

attributeReceiver: typeReference | LPAREN id COLON typeReference RPAREN;

functionDeclaration
    : (FUNCTION | PROCEDURE) id formals multiResultValue functionBody? SEMICOLON
    ;

functionBody: BEGIN statement* END;

pragmaDeclaration
    : PRAGMA id (LPAREN pragmaActualList? RPAREN)? SEMICOLON
    ;

pragmaActualList: pragmaActual (COMMA pragmaActual)*;
pragmaActual: (PATTERN | TYPE | MODULE | SIGNATURE | CLASS)? expression;

inheritanceDeclaration: id? INHERIT typeReference declarationBlock;

replacementDeclaration
    : id ARROW expression SEMICOLON
    | PATTERN id ARROW atomicPattern SEMICOLON
    | TYPE id ARROW typeReference SEMICOLON
    | SIGNATURE id ARROW signature SEMICOLON
    ;

polymorphicDeclaration: id? polymorphism (declaration | declarationBlock);

valueDeclaration
    : direction? id COLON typeReference defaultValue? SEMICOLON
    | id EQUAL expression SEMICOLON
    ;

moduleBody: SEMICOLON | declarationBlock;
declarationBlock: BEGIN declarationItem* END SEMICOLON?;
declarationItem: visibilityDirective | mutabilityDirective | declaration;
mutabilityDirective: VAR SEMICOLON;

polymorphism: LBRACKET typeFormalList? RBRACKET;
typeFormalList: typeFormalGroup (SEMICOLON typeFormalGroup)*;
typeFormalGroup: (TYPE | PHYLUM)? id (COMMA id)* signatureConstraint?;

formals: LPAREN formalList? RPAREN;
formalList: formalGroup (SEMICOLON formalGroup)*;
formalGroup: id (COMMA id)* COLON typeReference ELLIPSIS?;

signatureConstraint: DOUBLE_COLON signature;
signature: simpleSignature (COMMA simpleSignature)*;
simpleSignature
    : (INPUT VAR | VAR INPUT | INPUT | VAR)? qualifiedUse typeParameters?
    | LBRACE typeList? RBRACE
    | LPAREN signature RPAREN
    ;

resultKind: TYPE | PHYLUM;
extension: (COLON_EQUAL | EQUAL | EXTENDS) typeReference;
typeAnnotation: COLON typeReference;

typeReference
    : (PRIVATE | REMOTE)* simpleType
    | FUNCTION formals multiResultTyping
    ;

simpleType: qualifiedUse typeParameters? actuals? | LPAREN typeReference RPAREN;
qualifiedUse: id (DOLLAR id)*;
typeParameters: LBRACKET typeList? RBRACKET;
typeList: typeReference (COMMA typeReference)*;

direction: INPUT CIRCULAR? COLLECTION? | CIRCULAR COLLECTION? | COLLECTION;
defaultValue: (COLON_EQUAL | EQUAL | COLON_GREATER) expression (COMMA expression)?;

resultValue: direction? id? typeAnnotation? defaultValue?;
multiResultValue
    : direction? id? typeAnnotation defaultValue?
    | LPAREN resultValue (SEMICOLON resultValue)* RPAREN
    |
    ;
multiResultTyping
    : id? typeAnnotation
    | LPAREN id typeAnnotation (SEMICOLON id typeAnnotation)* RPAREN
    |
    ;

statement
    : expression actuals SEMICOLON
    | expression (COLON_EQUAL | COLON_GREATER) expressionList SEMICOLON
    | IF expression THEN statement* elsifPart* elsePart? ENDIF SEMICOLON?
    | FOR id typeAnnotation? IN expression BEGIN statement* END SEMICOLON?
    | BEGIN statement* END SEMICOLON?
    | CASE expression BEGIN matchStatement* caseDefault? END SEMICOLON?
    | FOR expression BEGIN matchStatement* END SEMICOLON?
    | direction? id COLON typeReference defaultValue? SEMICOLON
    | functionDeclaration
    | patternDeclaration
    | pragmaDeclaration
    ;

elsifPart: ELSIF expression THEN statement*;
elsePart: ELSE statement*;
caseDefault: ELSE statement* | ELSCASE expression BEGIN matchStatement* caseDefault?;
matchStatement: MATCH pattern BEGIN statement* END SEMICOLON?;

patternList: pattern (COMMA pattern)*;
pattern: patternTerm ((AND | EQUAL) patternTerm | COLON_QUESTION typeReference)* (IF expression)?;
patternTerm
    : patternName patternArguments?
    | LBRACE patternActualList? RBRACE (COLON typeReference)?
    | qualifiedUse DOLLAR LBRACE patternActualList? RBRACE
    | QUESTION id? typeAnnotation?
    | EXCLAMATION simpleExpression
    | LPAREN pattern RPAREN
    | atomicPattern
    ;
atomicPattern: patternName (COLON typeReference)? | INTEGER | REAL | STRING | CHARACTER;
patternName: qualifiedUse;
patternArguments: LPAREN patternActualList? RPAREN;
patternActualList: patternActual (COMMA patternActual)*;
patternActual: id COLON_EQUAL pattern | ELLIPSIS (AND patternTerm)? | pattern;

expressionList: expression (COMMA expression)*;
typedExpressionList: typedExpression (COMMA typedExpression)*;
typedExpression: expression (COLON typeReference)?;
expression
    : unaryExpression ELLIPSIS? (binaryOperator unaryExpression ELLIPSIS?)*
      (IF expression)?
      (FOR id typeAnnotation? IN expression)?
    ;
unaryExpression: (NOT | MINUS | EQUAL | operator)* simpleExpression;
simpleExpression: atomicExpression (actuals | DOT atomicExpression)* DOT?;
atomicExpression
    : qualifiedUse
    | INTEGER
    | REAL
    | STRING
    | CHARACTER
    | LPAREN typedExpressionList RPAREN
    | LBRACE expressionList? RBRACE
    | qualifiedUse DOLLAR LBRACE expressionList? RBRACE
    ;
actuals: LPAREN expressionList? RPAREN;
binaryOperator: operator | MINUS | EQUAL | DOT_DOT | AND | OR | IN | NOT IN;
operator: OPERATOR | BACKTICK_OPERATOR;

id: IDENTIFIER | ANONYMOUS | LPAREN escapedIdentifier RPAREN | LBRACE DOT RBRACE;
escapedIdentifier: keyword | operator | EQUAL | MINUS | DOT | DOT_DOT | ELLIPSIS;
keyword
    : AND | ATTRIBUTE | BEGIN | CASE | CIRCULAR | CLASS | COLLECTION | CONSTANT
    | CONSTRUCTOR | ELSCASE | ELSE | ELSIF | END | ENDIF | EXTENDS | FOR
    | FUNCTION | IF | IN | INFIX | INFIXL | INFIXR | INHERIT | INPUT | MATCH
    | MODULE | NOT | ON | OR | PATTERN | PHYLUM | PRAGMA | PRIVATE | PROCEDURE
    | PUBLIC | REMOTE | SIGNATURE | THEN | TYPE | VAR | WITH
    ;