# Change Log

All notable changes to the "aps-lang" extension will be documented in this file.

## [0.1.2]

- Added attribute-only completion after `.` inside and outside top-level match bodies,
	with all known attributes as a fallback when the receiver type is unresolved.
- Added receiver type inference from explicit pattern types, constructor results,
	nested constructor parameters, and typed local variables.
- Added attribute completion for typed receivers declared before a top-level match.
- Filtered attribute suggestions by receiver phylum, collection assignment, and
	inherited/synthesized direction when the statement context is unambiguous.
- Expanded syntax highlighting for declaration kinds, bindings, modifiers, control
	flow, constants, and punctuation.
- Changed CI publishing to maintain one rolling `latest` GitHub release and stable
	`aps-lang-latest.vsix` asset without version tags.
- Allowed one trailing dot as an incomplete member access while attribute completion
	is active, including inside calls and before expression boundaries.
- Resolved qualified generic constructors such as `Items$append` without cross-module
	name collisions, so nested pattern bindings receive the correct attribute type.

## [0.1.1]

- Restored syntax highlighting by fixing the packaged TextMate grammar JSON.
- Added validation for the manifest's APS grammar contribution and highlighting asset.
- Fixed false duplicate declarations between sibling polymorphic scopes.
- Added CI semantic validation against the upstream APS `base/` sources.

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
- Added tag-triggered GitHub Releases with the VSIX attached as a public download.
- Removed all runtime APS binary and WSL dependencies.

## [0.0.1]

- Initial release