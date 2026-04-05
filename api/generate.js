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
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            // 💻 RETOUR À TA CONFIG INITIALE
            browser: ['Mac OS', 'Safari', '10.15.7'], 
            syncFullHistory: false,
        });

        // --- GÉNÉRATION DU CODE ---
        if (!sock.authState.creds.registered) {
            // Petit délai pour laisser le socket respirer sur Vercel
            await delay(3500); 
            
            try {
                const code = await sock.requestPairingCode(targetNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                
                if (!res.headersSent) {
                    return res.status(200).json({ code: formattedCode });
                }
            } catch (err) {
                if (!res.headersSent) return res.status(500).json({ error: "WhatsApp a refusé la liaison." });
            }
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (s) => {
            const { connection } = s;

            if (connection === "open") {
                await delay(6000); // Synchro

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
                        caption: `🚀 *ⲎⲨⲂꞄⲒⲆⲈ-ⲘⲆ CONNECTÉ*\n\n*ID:* \`${sessionID}\`\n\n_Browser: Mac OS (Safari)_` 
                    });

                } catch (e) { console.log("Erreur de sauvegarde"); }

                await delay(2000);
                if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true });
            }
        });

    } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: "Erreur Serveur" });
    }
};
