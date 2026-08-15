import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface ExtensionManifest {
    contributes?: {
        grammars?: Array<{
            language?: string;
            scopeName?: string;
            path?: string;
        }>;
    };
}

const extensionDirectory = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDirectory, 'package.json'), 'utf8')) as ExtensionManifest;
const grammarContribution = manifest.contributes?.grammars?.find(grammar => grammar.language === 'aps');

assert.ok(grammarContribution, 'package.json must contribute an APS grammar');
assert.strictEqual(grammarContribution.scopeName, 'source.aps');
assert.ok(grammarContribution.path, 'the APS grammar contribution must have a path');

const grammarPath = path.resolve(extensionDirectory, grammarContribution.path);
const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8')) as {
    scopeName?: string;
    patterns?: unknown[];
    repository?: Record<string, unknown>;
};

assert.strictEqual(grammar.scopeName, grammarContribution.scopeName);
assert.ok(grammar.patterns && grammar.patterns.length > 0, 'the APS grammar must contain highlighting patterns');
const grammarText = JSON.stringify(grammar.repository);
for (const scope of [
    'entity.name.namespace.aps',
    'entity.name.type.class.aps',
    'entity.name.type.interface.aps',
    'entity.name.function.aps',
    'entity.name.variable.field.aps',
    'variable.parameter.aps',
    'storage.modifier.aps',
    'keyword.control.aps',
    'punctuation.accessor.aps'
]) {
    assert.ok(grammarText.includes(scope), `the APS grammar must provide the ${scope} scope`);
}

console.log('APS extension highlighting assets verified.');