const express = require('express');
const { default: makeWASocket, delay, Browsers, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const pino = require("pino");
const Redis = require("ioredis");
const fs = require('fs');
const path = require('path');

const app = express();
// Ton URL Redis Upstash
const redis = new Redis("rediss://default_ro:ggAAAAAAATlJAAIgcDHr_LF5T24xTi2dUAPCYE6ie8uuVs-FIC9A5Cvv8oAXJQ@divine-garfish-80201.upstash.io:6379");

app.get('/api/generate', async (req, res) => {
    const number = req.query.number;
    if (!number) return res.status(400).json({ error: "Numéro requis" });

    const sessionDir = path.join('/tmp', `session_${Date.now()}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.macOS("Chrome"),
        });

        // Génération du code de pairing
        await delay(3000);
        const code = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));
        
        // Envoi de la réponse au site
        res.json({ code: code });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                await delay(5000);

                const credsPath = path.join(sessionDir, "creds.json");
                if (fs.existsSync(credsPath)) {
                    const creds = fs.readFileSync(credsPath);
                    const sessionID = "HYB-" + Buffer.from(creds).toString('base64');

                    // MESSAGE STYLÉ EN PV
                    const welcomeMsg = `✨ *HYBRIDE-MD CONNECTÉ* ✨\n\n` +
                        `👋 Cher utilisateur, votre bot est maintenant prêt !\n\n` +
                        `📍 *VOTRE SESSION ID :*\n` +
                        `\`\`\`${sessionID}\`\`\`\n\n` +
                        `⚠️ *ATTENTION :* Ne partagez jamais ce code. Il donne un accès total à votre compte WhatsApp.\n\n` +
                        `> *Powered by Wicked & Zokou-Gem*`;
                    
                    await sock.sendMessage(sock.user.id, { text: welcomeMsg });
                    
                    // Backup sur Redis
                    await redis.set(`session_${sock.user.id}`, sessionID);
                }

                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
            }
        });

    } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: "Erreur" });
    }
});

module.exports = app;
