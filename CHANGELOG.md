# Change Log

All notable changes to the "aps-lang" extension will be documented in this file.

## [0.1.0]

- Added workspace completion, hover, definitions, references, and symbols.
- Added an in-process ANTLR lexer and parser ported from the APS Flex/Bison grammar.
- Vendored byte-identical APS Flex/Bison grammar sources as the ANTLR port baseline.
- Added live parser diagnostics for unsaved documents.
- Added scoped duplicate declarations and closed-workspace unresolved type checks.
- Rebuilt syntax highlighting from the APS lexer token set.
- Added TypeScript build, tests, and VSIX packaging.
- Added linting and self-contained parser/binder unit tests.
- Added a GitHub Actions build that uploads the packaged VSIX as an artifact.
- Added CI validation of the generated lexer/parser against every upstream APS example.
- Removed all runtime APS binary and WSL dependencies.

## [0.0.1]

- Initial release