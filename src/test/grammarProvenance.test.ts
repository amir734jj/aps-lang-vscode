import * as assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const expected = new Map([
    ['aps.lex', { bytes: 7611, sha256: 'E51F2CD520969974BEB5299FE7CEC7E71720DFDFBD7CF777A3D13F8564B1D83E' }],
    ['aps.y', { bytes: 40722, sha256: '19460A93D76B31C5EE7921EEB603510101E791C80FAA2052C4D8AEFE3EDDC4A7' }]
]);

const upstreamDirectory = path.resolve(__dirname, '../../grammar/upstream');
for (const [fileName, provenance] of expected) {
    const content = fs.readFileSync(path.join(upstreamDirectory, fileName));
    assert.strictEqual(content.length, provenance.bytes, `${fileName} must remain byte-identical to the APS source`);
    assert.strictEqual(
        createHash('sha256').update(content).digest('hex').toUpperCase(),
        provenance.sha256,
        `${fileName} must remain byte-identical to the APS source`
    );
}

console.log('APS Flex/Bison source provenance verified.');