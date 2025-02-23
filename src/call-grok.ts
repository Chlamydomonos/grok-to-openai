import axios from 'axios';
import type { Request, Response } from 'express';
import { createCookiePool, type NamedCookie } from './cookie-pool';

const grokUrl = 'https://grok.com/rest/app-chat/conversations/new';

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

export const callGrok = async (req: Request, res: Response) => {
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
        return;
    }

    console.log(`\x1B[32mUsing cookie \x1B[36m"${cookie.name}"\x1B[0m`);

    const abortController = new AbortController();
    res.on('close', () => {
        abortController.abort();
    });
    const axiosResponse = await axios.post(grokUrl, grokBody(req), {
        headers: { Cookie: cookie.cookie },
        responseType: 'stream',
        signal: abortController.signal,
    });

    const stream = axiosResponse.data;

    console.log('\x1B[2mStreaming response...\x1B[0m');

    let resStarted = false;

    stream.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
            try {
                const jsonObj = JSON.parse(line);
                if (!resStarted) {
                    if (jsonObj.error && jsonObj.error.code) {
                        const code = jsonObj.error.code;
                        if (code == 16 || code == 3) {
                            console.log('\x1B[31mThis cookie is invalid\x1B[0m');
                        } else {
                            console.log('\x1B[31mUnknown error:\x1B[0m');
                            console.log(`\x1B[31m${line}\x1B[0m`);
                        }
                    }
                }

                if (jsonObj.result && jsonObj.result.response && jsonObj.result.response.token) {
                    resStarted = true;
                    res.write(`data: ${JSON.stringify(openaiToken(jsonObj.result.response.token))}\n\n`);
                }
            } catch (e) {
                continue;
            }
        }
    });

    stream.on('end', () => {
        console.log('\x1B[2mStream response finished\x1B[0m');
        res.write('data: [DONE]\n\n');
        res.end();
    });
};
