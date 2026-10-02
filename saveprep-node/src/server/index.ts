import path from 'path';
import { createServer, notStupidParseInt } from './web.js';

const HOME = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME']!;

const server = await createServer({
    timeout: notStupidParseInt(process.env['TIMEOUT'] || 30000),
    port: notStupidParseInt(process.env['PORT'] || 8080),
    maxFileNum: notStupidParseInt(process.env['MAXFILENUM'] || 100000),
    funds: notStupidParseInt(process.env['FUNDS'] || 100000),
    parkDir: process.env['PARKDIR'] || path.join(HOME, '.config', 'OpenRCT2', 'save')
});

process.on('SIGTERM', () => {
    server.close()
});
