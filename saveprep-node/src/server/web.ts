import path from 'path';
import fs from 'fs';
import { randomUUID, type UUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises'
import { spawn } from 'spawn-but-with-promises';
import express from 'express';
import { getExpectedCWD } from './cwd-checker.js';
import fileUpload from 'express-fileupload';
import dayjs from 'dayjs';
import process from 'node:process';
const fsp = fs.promises;

const PROJECT_ROOT = getExpectedCWD();

export interface ServerOptions {
    timeout: number;
    port: number;
    parkDir: string;
    maxFileNum: number;
    funds: number;
    trustProxy: boolean | string | number;
}

export function notStupidParseInt(v: string | number | undefined): number {
    if (typeof v === 'number') {
        return v;
    }
    return v === undefined ? NaN : parseInt(v);
}

export type scenarioType = 'sandbox' | 'economy';

export interface PreparedPark {
    mode: scenarioType;
    filename: string;
    /**
     * base64-encoded string
     */
    data: string;
}

export interface ResponseBody {
    status: string;
    id: UUID;
}

interface prepareParams {
    timeout: number;
    filename: string;
    destination: string;
    mode: 'sandbox' | 'economy'
}

interface prepareSandboxParams extends prepareParams {
    mode: 'sandbox';
}

interface prepareEconParams extends prepareParams {
    mode: 'economy';
    funds: number;
}

async function prepareSave(params: prepareSandboxParams | prepareEconParams) {
    const { timeout, filename, destination, mode } = params;
    const args = ['prep', mode];
    if (mode === 'economy') {
        args.push(`${params.funds}`);
    }
    args.push(filename, destination);
    const proc = spawn('openrct2-cli', args, {
        stdio: ['ignore', process.stdout, process.stderr]
    });

    await Promise.race([setTimeout(timeout), proc]);
    if (proc.exitCode === null) {
        proc.kill();
        throw new Error(`prepare timed out after ${timeout} seconds`);
    }
    else if (proc.exitCode === 0) {
        const prepared: PreparedPark = {
            mode,
            filename: path.basename(destination),
            data: (await fsp.readFile(destination)).toString('base64')
        };
        return prepared;
    }
    throw new Error(`prepare exited with code ${proc.exitCode}`);
}

export async function createServer(config: ServerOptions) {
    const runningJobs: Record<string, Promise<PreparedPark>[]> = {};
    const app = express();
    const orct2Version = await (async function (timeout: number) {
        const proc = spawn('openrct2-cli', ['--version']);
        const stdoutData: string[] = [];
        proc.stdout.on('data', out => {
            stdoutData.push(...(out.toString() as string).split('\n').map(s => s.trim()))
        });
        await Promise.race([setTimeout(timeout), proc]);
        if (proc.exitCode === null) {
            proc.kill();
        }
        return stdoutData[0]?.substring(stdoutData[0].indexOf(' ') + 1) || 'UNDEFINED';
    })(config.timeout);
    let filenum = 0;

    const getFileNum = () => {
        return (filenum = (filenum + 1) % config.maxFileNum);
    }

    app.set('trust proxy', config.trustProxy);
    app.set('view engine', 'ejs');
    app.use('/assets/', express.static(path.join(PROJECT_ROOT, 'assets'), { maxAge: '30 days' }));

    const fileuploadMiddleware = fileUpload({
        createParentPath: true,
        abortOnLimit: true,
        limits: {
            fileSize: 100 * 1024 * 1024
        }
    });

    app.get('/healthcheck', async (_req, res) => {
        res.send('Healthy');
    });

    app.post('/upload', fileuploadMiddleware, async (req, res) => {
        try {
            if (!req.files || !req.files['park'] || Array.isArray(req.files['park'])) {
                res.status(400).send({
                    status: 'bad'
                });
            }
            else {
                const park = req.files['park'];
                const fext = path.extname(park.name) || '.park';
                const basename = path.basename(park.name, fext).replaceAll(' ', '_').toLowerCase();
                let dir = path.join(config.parkDir, `upload_${dayjs().format('YYYYMMDD')}_${getFileNum()}`);
                let filename = path.join(dir, park.name);
                await fsp.mkdir(dir);
                await park.mv(filename);
                let destsandbox = path.join(dir, `${basename}-sandbox.park`);
                let desteconomy = path.join(dir, `${basename}-economy.park`);

                try {
                    const id = randomUUID();
                    const jobs = [
                        prepareSave({
                            timeout: config.timeout,
                            filename,
                            destination: destsandbox,
                            mode: 'sandbox'
                        }),
                        prepareSave({
                            timeout: config.timeout,
                            filename,
                            destination: desteconomy,
                            mode: 'economy',
                            funds: parseInt(req.body.funds) || config.funds
                        })
                    ];
                    runningJobs[id] = jobs;
                    res.send({
                        status: 'nice',
                        id
                    } satisfies ResponseBody);

                    await Promise.all(jobs);
                    delete runningJobs[id];
                    await fsp.rm(dir, { recursive: true });
                }
                catch (ex) {
                    console.log(ex);
                    res.status(500).send({ status: 'bad' });
                }
            }
        }
        catch (ex) {
            console.log(ex);
            res.status(500).send({
                status: 'bad'
            });
        }
    });

    app.get('/results/:id', async (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const jobs = typeof req.params.id === 'string' ? runningJobs[req.params.id] : null;
        if (!jobs) {
            res.end();
            return;
        }
        jobs.forEach(j => {
            j.then(park => res.write(`data:${JSON.stringify(park)}\n\n`));
        });
        await Promise.all(jobs);
        res.end();
    });

    app.get('/', (_req, res) => {
        res.render('index',
            {
                inliner: function (file: string) {
                    return fs.readFileSync(path.join(PROJECT_ROOT, file));
                },
                version: orct2Version
            },
            function (err, html) {
                if (!err) {
                    res.send(html);
                }
                else {
                    console.log(err);
                    res.send();
                }
            }
        );
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
