const express = require('express');
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    makeCacheableSignalKeyStore, 
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// Stockage temporaire de l'ID pour l'affichage web
let lastSessionID = null; 

app.use(express.static('public'));

// Route de vérification pour ton interface HTML
app.get('/check-session', (req, res) => {
    res.json({ sessionID: lastSessionID });
});

app.get('/session', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).send({ error: "Numéro requis (ex: 223xxxx)" });

    const targetNumber = num.replace(/[^0-9]/g, '');
    const sessionDir = path.join(__dirname, 'sessions', 'temp_' + Date.now());
    lastSessionID = null; 

    let codeSent = false;
    let sessionGenerated = false;

    try {
        const { version } = await fetchLatestBaileysVersion();

        const startSocket = async () => {
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

            const sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                // 💻 TA CONFIGURATION DEMANDÉE
                browser: ['Mac OS', 'Safari', '10.15.7'],
                syncFullHistory: false,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 0,
                keepAliveIntervalMs: 10000,
            });

            // --- GÉNÉRATION DU CODE PAIRING ---
            if (!codeSent && !sock.authState.creds.registered) {
                await delay(5000); // Laisse le socket se stabiliser
                try {
                    const code = await sock.requestPairingCode(targetNumber);
                    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                    codeSent = true;
                    if (!res.headersSent) res.send({ code: formattedCode });
                } catch (e) {
                    console.error("Erreur Pairing:", e.message);
                    if (!res.headersSent) res.status(500).send({ error: "WhatsApp a refusé la requête." });
                }
            }

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
                    if (shouldReconnect && !sessionGenerated) {
                        console.log("🔄 Reconnexion en cours...");
                        await delay(5000);
                        startSocket();
                    }
                }

                if (connection === 'open') {
                    if (sessionGenerated) return;
                    sessionGenerated = true;
                    
                    await delay(8000); // Synchro des clés avant l'export

                    try {
                        // On récupère les creds.json complets
                        const credsData = fs.readFileSync(path.join(sessionDir, 'creds.json'), 'utf-8');
                        
                        const params = new URLSearchParams();
                        params.append('api_dev_key', "Nl_9mAGsEssqcDevULF4FItMAasK5gQb");
                        params.append('api_option', 'paste');
                        params.append('api_paste_code', credsData);
                        params.append('api_paste_private', '1');
                        params.append('api_paste_expire_date', '1D');

                        const pasteRes = await axios.post('https://pastebin.com/api_post', params);
                        
                        if (pasteRes.data && pasteRes.data.includes('pastebin.com')) {
                            const pasteId = pasteRes.data.split('/').pop();
                            const sessionID = "HYE~" + Buffer.from(pasteId).toString('base64');
                            
                            lastSessionID = sessionID; 

                            // Envoi du message de succès au numéro
                            await sock.sendMessage(targetNumber + '@s.whatsapp.net', { 
                                image: { url: "https://files.catbox.moe/szt37y.jpg" },
                                caption: `🚀 *ⲎⲨⲂꞄⲒⲆⲈ-ⲘⲆ CONNECTÉ*\n\n*SESSION ID :*\n\`${sessionID}\`\n\n_Copie cet ID dans tes variables de déploiement._` 
                            });
                            
                            console.log("✅ Session réussie pour " + targetNumber);
                        }
                    } catch (e) {
                        console.error("❌ Erreur Pastebin/Envoi :", e.message);
                    }
                    
                    // Nettoyage après succès
                    setTimeout(() => {
                        sock.ws.close();
                        fs.removeSync(sessionDir);
                    }, 10000);
                }
            });
        };

        startSocket();

    } catch (globalError) {
        if (!res.headersSent) res.status(500).send({ error: "Erreur serveur globale" });
    }
});

app.listen(PORT, () => console.log(`🚀 SERVEUR HYBRIDE DÉMARRÉ SUR PORT ${PORT}`));
