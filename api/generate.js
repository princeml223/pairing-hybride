const pino = require("pino");
const fs = require("fs-extra");
const axios = require("axios");

const PASTE_KEY = "Nl_9mAGsEssqcDevULF4FItMAasK5gQb";

module.exports = async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Numéro requis" });

    const targetNumber = number.replace(/[^0-9]/g, '');
    const sessionDir = `/tmp/hybride_${Date.now()}`;

    try {
        const { 
            default: makeWASocket, 
            useMultiFileAuthState, 
            delay, 
            makeCacheableSignalKeyStore, 
            fetchLatestBaileysVersion 
        } = await import("@whiskeysockets/baileys");

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ['Mac OS', 'Safari', '10.15.7'], 
            syncFullHistory: false, // OBLIGATOIRE pour gagner du temps
            qrTimeout: 20000,
            connectTimeoutMs: 30000,
        });

        // --- GÉNÉRATION ULTRA-RAPIDE ---
        if (!sock.authState.creds.registered) {
            // On réduit le délai à 2s pour laisser plus de temps à l'utilisateur
            await delay(2000); 
            
            const code = await sock.requestPairingCode(targetNumber);
            const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
            
            if (!res.headersSent) {
                res.status(200).json({ code: formattedCode });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (s) => {
            const { connection } = s;

            if (connection === "open") {
                // Dès que c'est ouvert, on extrait l'ID sans attendre la synchro lourde
                try {
                    const credsData = fs.readFileSync(`${sessionDir}/creds.json`, 'utf-8');
                    const params = new URLSearchParams();
                    params.append('api_dev_key', PASTE_KEY);
                    params.append('api_option', 'paste');
                    params.append('api_paste_code', credsData);
                    params.append('api_paste_private', '1');
                    params.append('api_paste_expire_date', '1D');

                    const pasteRes = await axios.post('https://pastebin.com/api_post', params);
                    const pasteId = pasteRes.data.split('/').pop();
                    const sessionID = "HYE~" + Buffer.from(pasteId).toString('base64');

                    await sock.sendMessage(targetNumber + '@s.whatsapp.net', { 
                        image: { url: "https://files.catbox.moe/szt37y.jpg" },
                        caption: `🚀 *ⲎⲨⲂꞄⲒⲆⲈ-ⲘⲆ CONNECTÉ*\n\n*ID:* \`${sessionID}\`` 
                    });

                } catch (e) { console.log("Erreur synchro rapide"); }

                // Nettoyage express
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir, { recursive: true });
            }
        });

    } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: "Réessayez plus vite" });
    }
};
