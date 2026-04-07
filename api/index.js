const express = require('express');
const { Redis } = require('@upstash/redis');
const { default: makeWASocket, delay, Browsers, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.static('public'));

// Configuration Upstash Redis REST
const redis = new Redis({
  url: 'https://divine-garfish-80201.upstash.io',
  token: 'gQAAAAAAATlJAAIncDEzODViMDFiYmI0NDc0OTgzYWQ0MWUxNDE1ZmU1OTUzZXAxODAyMDE',
});

// Route virtuelle /api/generate
app.get('/api/generate', async (req, res) => {
    const number = req.query.number;
    const isCustomSession = req.query.custom === 'true'; // Récupérer l'état de la checkbox

    const sessionDir = path.join('/tmp', `session_${Date.now()}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: Browsers.macOS("Chrome"), // Browser compatible pairing
        });

        // --- GESTION QR CODE ---
        if (!number) {
            sock.ev.on('connection.update', (update) => {
                const { qr } = update;
                if (qr && !res.headersSent) {
                    return res.json({ qr: qr });
                }
            });
        } 
        // --- GESTION PAIRING CODE ---
        else {
            await delay(3000);
            try {
                const code = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));
                if (!res.headersSent) return res.json({ code: code });
            } catch (pairError) {
                if (!res.headersSent) return res.status(500).json({ error: "Erreur lors de la génération du code de couplage" });
            }
        }

        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                await delay(5000);

                const credsPath = path.join(sessionDir, "creds.json");
                if (fs.existsSync(credsPath)) {
                    const creds = fs.readFileSync(credsPath);
                    const sessionID = "HYB-" + Buffer.from(creds).toString('base64');
                    
                    // MESSAGE DE BIENVENUE STYLÉ EN MP
                    const welcomeMsg = `✨ *HYBRIDE-MD : CONNEXION RÉUSSIE* ✨\n\n👋 Félicitations Wicked, votre bot est connecté !\n\n📍 *VOTRE SESSION ID :*\n\`\`\`${sessionID}\`\`\`\n\n⚠️ *ATTENTION :* Ne partagez jamais cet identifiant. Il donne un accès total à votre compte.\n\n> *Powered by Wicked & Hybride-Core (ZGem)*`;
                    
                    await sock.sendMessage(sock.user.id, { text: welcomeMsg });
                    
                    // Stockage sur Redis Upstash REST
                    await redis.set(`session_${sock.user.id}`, sessionID);
                    console.log(`Session stockée sur Redis pour l'utilisateur ${sock.user.id}`);
                }

                // Nettoyage complet
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
                process.exit(0); // Fermer Baileys proprement
            }
        });

        // Sécurité contre le timeout de Vercel
        setTimeout(() => { if (!res.headersSent) res.status(408).json({ error: "Timeout : La génération a été trop longue, réessayez." }); }, 45000);

    } catch (err) {
        if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: "Erreur interne du serveur" });
    }
});

module.exports = app;
