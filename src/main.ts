import express from 'express';
import { config } from './config';
import { callGrok } from './call-grok';

console.log("\n\n\x1B[1m\x1B[32mChlamydomonos' Grok-to-OpenAI Proxy\x1B[0m\n\n");

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/v1/models', (_, res) => {
    res.send({ data: [{ id: 'grok-3' }] });
});

app.post('/v1/chat/completions', async (req, res) => {
    try {
        await callGrok(req, res);
    } catch (e) {
        console.log(e);
    }
});

app.listen(config.port, () => {
    console.log(`\n\x1B[37m\x1B[1mServer listening on ${config.port}\x1B[0m\n`);
});
