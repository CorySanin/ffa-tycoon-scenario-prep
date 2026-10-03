import path from 'path';
import { createServer, notStupidParseInt } from './web.js';

const OPENRCT2_DIR = process.env['USERPROFILE'] ? path.join(process.env['USERPROFILE'], 'Documents', 'OpenRCT2') :
    path.join(process.env['HOME']!, '.config', 'OpenRCT2');

function parseComplex(env: string, fallback: boolean | string | number) {
    if (!(env in process.env) || process.env[env] === undefined) {
        return fallback;
    }
    const toLower = process.env[env].toLowerCase();
    if (['true', 'false'].some(tf => tf === toLower)) {
        return toLower === 'true';
    }
    const possibleNumber = notStupidParseInt(process.env[env]);
    if (!isNaN(possibleNumber)){
        return possibleNumber;
    }
    return process.env[env];
}

const server = await createServer({
    timeout: notStupidParseInt(process.env['TIMEOUT'] || 30000),
    port: notStupidParseInt(process.env['PORT'] || 8080),
    maxFileNum: notStupidParseInt(process.env['MAXFILENUM'] || 100000),
    funds: notStupidParseInt(process.env['FUNDS'] || 100000),
    parkDir: process.env['PARKDIR'] || path.join(OPENRCT2_DIR, 'save'),
    trustProxy: parseComplex('TRUSTPROXY', false)
});

process.on('SIGTERM', () => {
    server.close();
});
