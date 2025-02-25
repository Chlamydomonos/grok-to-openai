import axios from 'axios';
import type { Request, Response } from 'express';
import { createCookiePool, type NamedCookie } from './cookie-pool';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from './config';

const grokUrl = 'https://grok.com/rest/app-chat/conversations/new';

const axiosInstance = config.useHttpProxy
    ? axios.create({
          httpsAgent: new HttpsProxyAgent(config.httpProxyUrl),
      })
    : axios;

const cookiePool = createCookiePool();

const grokBody = (req: Request) => {
    const reqMessages = req.body.messages as {
        role: string;
        content: string;
    }[];
    const reqMessageText = reqMessages.map((m) => `${m.role}:\n\n${m.content}`).join('\n\n');
    return {
        temporary: true,
        modelName: 'grok-3',
        message: reqMessageText,
        fileAttachments: [],
        imageAttachments: [],
        disableSearch: true,
        enableImageGeneration: false,
        returnImageBytes: false,
        returnRawGrokInXaiRequest: false,
        enableImageStreaming: true,
        imageGenerationCount: 2,
        forceConcise: false,
        toolOverrides: {},
        enableSideBySide: true,
        isPreset: false,
        sendFinalMetadata: true,
        customInstructions: '',
        deepsearchPreset: '',
        isReasoning: false,
    };
};

const openaiToken = (token: string) => ({ choices: [{ delta: { role: 'assistant', content: token } }] });

type Writeable = {
    write: (content: string) => void;
    end: () => void;
    on: (event: 'close', handler: () => void) => void;
    error: (code: number, msg: string) => void;
};

const callGrokToStream = async (cookie: string, req: Request, res: Writeable) => {
    const abortController = new AbortController();
    res.on('close', () => {
        console.log('\x1B[2mRequest is aborted by user\x1B[0m');
        abortController.abort();
    });
    const axiosResponse = await axiosInstance.post(grokUrl, grokBody(req), {
        headers: { Cookie: cookie },
        responseType: 'stream',
        signal: abortController.signal,
    });

    const stream = axiosResponse.data;

    console.log('\x1B[2mStreaming response...\x1B[0m');

    let buffer = Buffer.alloc(0);

    stream.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf(0x0a)) !== -1) {
            const lineBuffer = buffer.subarray(0, newlineIndex + 1);
            buffer = buffer.subarray(newlineIndex + 1);

            try {
                const line = lineBuffer.toString('utf-8').trim();
                if (!line) continue;

                const jsonObj = JSON.parse(line);
                if (jsonObj.error?.code) {
                    const code = jsonObj.error.code;
                    if (code === 16 || code === 3) {
                        console.log('\x1B[31mThis cookie is invalid\x1B[0m');
                    } else {
                        console.log('\x1B[31mUnknown error:\x1B[0m');
                        console.log(`\x1B[31m${line}\x1B[0m`);
                    }

                    res.error(500, 'Internal error');
                    return;
                }

                if (jsonObj.result?.response?.token) {
                    res.write(jsonObj.result.response.token);
                }
            } catch (e) {
                continue;
            }
        }
    });

    stream.on('end', () => {
        console.log('\x1B[2mStream response finished\x1B[0m');
        res.end();
    });
};

export const callGrok = async (req: Request, res: Response, state: { resStarted: boolean }) => {
    console.log(`\n\x1B[36m[${new Date().toLocaleString()}] Request received\x1B[0m`);

    const authorization = req.headers.authorization;
    let cookie: NamedCookie | undefined;
    if (authorization) {
        const match = /^Bearer (.+)/.exec(authorization);
        if (match) {
            const cookieName = match[1];
            console.log(`Trying to use cookie ${cookieName}`);
            if (cookiePool.has(cookieName)) {
                cookie = cookiePool.getCookie(cookieName);
                if (!cookie) {
                    console.log('\x1B[31mNo quota for this cookie, aborted request\x1B[0m');
                }
            } else {
                console.log('\x1B[33mThis cookie does not exist, trying to use a random cookie\x1B[0m');
                cookie = cookiePool.getRandom();
                if (!cookie) {
                    console.log('\x1B[31mNo cookie available, aborted request\x1B[0m');
                }
            }
        } else {
            console.log(`Trying to use a random cookie`);
            cookie = cookiePool.getRandom();
            if (!cookie) {
                console.log('\x1B[31mNo cookie available, aborted request\x1B[0m');
            }
        }
    } else {
        console.log(`Trying to use a random cookie`);
        cookie = cookiePool.getRandom();
        if (!cookie) {
            console.log('\x1B[31mNo cookie available, aborted request\x1B[0m');
        }
    }

    if (!cookie) {
        res.status(429).send('Cookie已超出限额');
        state.resStarted = true;
        return;
    }

    console.log(`\x1B[32mUsing cookie \x1B[36m"${cookie.name}"\x1B[0m`);

    if (req.body.stream) {
        callGrokToStream(cookie.cookie, req, {
            write(content) {
                state.resStarted = true;
                res.write(`data: ${JSON.stringify(openaiToken(content))}\n\n`);
            },
            end() {
                state.resStarted = true;
                res.write(`data: [DONE]\n\n`);
                res.end();
            },
            on: res.on,
            error(code, msg) {
                if (!state.resStarted) {
                    res.status(code).send(msg);
                    state.resStarted = true;
                } else {
                    res.end();
                }
            },
        });
    } else {
        let output = '';
        callGrokToStream(cookie.cookie, req, {
            write(content) {
                output += content;
            },
            end() {
                res.send({
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content: output,
                            },
                        },
                    ],
                });
                state.resStarted = true;
            },
            on: res.on,
            error(code, msg) {
                res.status(code).send(msg);
                state.resStarted = true;
            },
        });
    }
};
