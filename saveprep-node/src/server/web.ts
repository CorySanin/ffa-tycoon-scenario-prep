import fs from 'fs';
import { setTimeout } from 'node:timers/promises'
import { spawn } from 'spawn-but-with-promises';
import express from 'express';
// import fileUpload from 'express-fileupload';
// import dayjs from 'dayjs';
// const fsp = fs.promises;

// const PROJECT_ROOT = import.meta.dirname;

export interface ServerOptions {
    timeout: number;
    port: number;
    parkDir: string;
    maxFileNum: number;
    funds: number;
}

export function notStupidParseInt(v: string | number | undefined): number {
    if (typeof v === 'number') {
        return v;
    }
    return v === undefined ? NaN : parseInt(v);
}

export async function createServer(config: ServerOptions) {
    const app = express();
    const orct2Version = await (async function (timeout: number) {
        const process = spawn('openrct2-cli', ['--version']);
        const stdoutData: string[] = [];
        process.stdout.on('data', out => {
            stdoutData.push(...(out.toString() as string).split('\n').map(s => s.trim()))
        });
        await Promise.race([setTimeout(timeout), process]);
        return stdoutData[0]?.substring(stdoutData[0].indexOf(' ') + 1) || 'UNDEFINED';
    })(config.timeout);
    // let filenum = 0;
    app.get('/', (_req, res) => {
        res.send(orct2Version);
    });

    return app.listen(config.port, () => {
        console.log(`Web server listening on port ${config.port}.`);
        fs.mkdir(config.parkDir, { recursive: true }, err => {
            if (err) {
                console.log(err);
            }
        });
    });
}

