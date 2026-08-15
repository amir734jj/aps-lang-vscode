# APS Language IDE

VS Code language support for APS, Professor John Boyland's attribute grammar
language. The extension works without modifying or embedding the APS repository.

## IDE features

- TextMate highlighting based on the APS Flex lexer
- Workspace-wide symbol indexing and completion
- Hover information and declaration signatures
- Go to Definition and Find References
- Document Outline and workspace symbol search
- Live ANTLR syntax diagnostics for unsaved documents
- Scoped duplicate type declaration diagnostics
- Closed-workspace unresolved type checks through **APS: Validate Current File**

The language service is implemented in TypeScript. Its ANTLR lexer and parser are
generated from APS grammar files owned by this extension and run in the extension
process. It does not execute an APS binary, require WSL, or modify the APS repository.

## Validation

Syntax and locally decidable semantic diagnostics update while a document is edited.
Use **APS: Validate Current File** to additionally report unresolved type names. That
command treats APS standard types and type/module declarations indexed from the open
workspace as its environment.

Because APS `with` directives use external search paths, unresolved names from modules
outside the workspace are not reported as live errors. Add those APS files to the
workspace before running closed-workspace validation.

## Development

```console
npm install
npm run check
npm run package
```

`npm run compile` regenerates the TypeScript lexer and parser from `grammar/*.g4`.
`npm run check` runs TypeScript-aware linting and self-contained unit tests. No APS
checkout or compiler is required for development, packaging, or extension runtime.
The full example corpus is intentionally not copied into this repository.

The GitHub Actions build runs the same checks, clones `amir734jj/aps`, parses every
`.aps` file under its `examples/` directory, packages the extension, and uploads the
VSIX as a workflow artifact. To run that external corpus check locally after compiling:

```console
APS_EXAMPLES=/path/to/aps/examples npm run test:corpus
```

Press `F5` in VS Code to launch an Extension Development Host. Use **APS: Reindex
Workspace** after files are generated outside VS Code.

## Architecture And Limits

`grammar/upstream/aps.lex` and `grammar/upstream/aps.y` are byte-for-byte snapshots
from APS commit `bf20927`. `grammar/ApsLexer.g4` and `grammar/ApsParser.g4` are their
executable ANTLR TypeScript port. APS assigns precedence to user-declared operators
dynamically; ANTLR token types are static, so the parser accepts a generic operator
chain for a later semantic pass to apply `infix`, `infixl`, and `infixr` declarations.

The current binder implements scoped type declarations, type parameters, duplicate
checks, and optional unresolved-type checks. Full import resolution, operator
reassociation, type inference, and fiber analysis are future semantic phases. Hover
and completion currently show source declarations rather than inferred types.