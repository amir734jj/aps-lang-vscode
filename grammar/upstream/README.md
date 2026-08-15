# APS grammar source

These files are byte-for-byte copies from the APS repository at commit
`bf20927`:

- `aps.lex` from `parse/aps.lex`
- `aps.y` from `parse/aps.y`

Verified SHA-256 hashes:

- `aps.lex`: `E51F2CD520969974BEB5299FE7CEC7E71720DFDFBD7CF777A3D13F8564B1D83E`
- `aps.y`: `19460A93D76B31C5EE7921EEB603510101E791C80FAA2052C4D8AEFE3EDDC4A7`

`../ApsLexer.g4` and `../ApsParser.g4` are the executable ANTLR TypeScript
port. They preserve the source rules where ANTLR has an equivalent construct.
APS dynamically changes operator token types after `infix`, `infixl`, and
`infixr` declarations; ANTLR token types are static, so the port parses those
operators generically for a later semantic precedence pass.