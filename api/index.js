const express = require('express');
const { default: makeWASocket, delay, Browsers, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const pino = require("pino");
const Redis = require("ioredis");
const fs = require('fs');
const path = require('path');

const app = express();
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
            browser: Browsers.macOS("Chrome"),
        });

        if (!number) {
            // MODE QR CODE
            sock.ev.on('connection.update', (update) => {
                const { qr } = update;
                if (qr) return res.json({ qr: qr });
            });
        } else {
            // MODE PAIRING
            await delay(3000);
            const code = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));
            res.json({ code: code });
        }

        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                await delay(5000);
                const creds = fs.readFileSync(path.join(sessionDir, "creds.json"));
                const sessionID = "HYB-" + Buffer.from(creds).toString('base64');
                
                await sock.sendMessage(sock.user.id, { 
                    text: `✨ *HYBRIDE-MD CONNECTÉ* ✨\n\nID: \`\`\`${sessionID}\`\`\`\n\n> Gardez ce code secret.` 
                });
                
                await redis.set(`session_${sock.user.id}`, sessionID);
                if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
            }
        });
    } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: "Erreur" });
    }
});

module.exports = app;
