import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export function getExpectedCWD() {
    const srcdir = dirname(fileURLToPath(import.meta.url));
    return resolve(srcdir, '..', '..');
}
