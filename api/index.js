const express = require('express');
const { default: makeWASocket, delay, Browsers, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const pino = require("pino");
const Redis = require("ioredis");
const fs = require('fs');
const path = require('path');

const app = express();
// Ton URL Redis native (celle avec le mot de passe)
const redis = new Redis("rediss://default_ro:ggAAAAAAATlJAAIgcDHr_LF5T24xTi2dUAPCYE6ie8uuVs-FIC9A5Cvv8oAXJQ@divine-garfish-80201.upstash.io:6379");

app.get('/api/generate', async (req, res) => {
    const number = req.query.number;
    const sessionDir = path.join('/tmp', `session_${Date.now()}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.ubuntu("Chrome"),
        });

        if (!number) {
            sock.ev.on('connection.update', (update) => {
                const { qr } = update;
                if (qr && !res.headersSent) res.json({ qr: qr });
            });
        } else {
            await delay(3000);
            const code = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));
            if (!res.headersSent) res.json({ code: code });
        }

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (update) => {
            if (update.connection === 'open') {
                await delay(5000);
                const creds = fs.readFileSync(path.join(sessionDir, "creds.json"));
                const sessionID = "HYB-" + Buffer.from(creds).toString('base64');
                await sock.sendMessage(sock.user.id, { text: `✨ *HYBRIDE-MD CONNECTÉ*\n\nID: \`${sessionID}\`` });
                await redis.set(`session_${sock.user.id}`, sessionID);
                fs.rmSync(sessionDir, { recursive: true, force: true });
            }
        });
    } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: "Erreur" });
    }
});

module.exports = app;
