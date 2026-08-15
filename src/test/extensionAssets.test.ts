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
};

assert.strictEqual(grammar.scopeName, grammarContribution.scopeName);
assert.ok(grammar.patterns && grammar.patterns.length > 0, 'the APS grammar must contain highlighting patterns');

console.log('APS extension highlighting assets verified.');