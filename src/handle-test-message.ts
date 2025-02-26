import type { Request, Response } from 'express';

export const handleTestMessage = (req: Request, res: Response, state: { resStarted: boolean }) => {
    if (req.body.messages && !req.body.stream) {
        const m = req.body.messages;
        if (m[0]) {
            if (m[0].role === 'user' && m[0].content === 'Hi') {
                console.log('\x1B[2mDetected SillyTavern test message, directly return response\x1B[0m');
                res.send({
                    choices: [
                        {
                            message: {
                                role: 'assistant',
                                content: 'This is a test message sent from reverse proxy (not from the AI!)',
                            },
                        },
                    ],
                });
                state.resStarted = true;
                return true;
            }
        }
    }
    return false;
};
