const pino = require("pino");
const fs = require("fs-extra");
const axios = require("axios");

const PASTE_KEY = "Nl_9mAGsEssqcDevULF4FItMAasK5gQb";

module.exports = async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Numéro requis" });

    const targetNumber = number.replace(/[^0-9]/g, '');
    const sessionDir = `/tmp/session_${targetNumber}`;

    try {
        const { 
            default: makeWASocket, 
            useMultiFileAuthState, 
            delay, 
            makeCacheableSignalKeyStore, 
            fetchLatestBaileysVersion,
            PHONENUMBER_MCC
        } = await import("@whiskeysockets/baileys");

        if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
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
            // 💻 CONFIG MAC OS SAFARI (Comme demandé)
            browser: ['Mac OS', 'Safari', '10.15.7'],
            syncFullHistory: false,
            markOnlineOnConnect: true, // Force le statut en ligne pour réveiller la notif
        });

        // Gestion de la session en arrière-plan
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (s) => {
            if (s.connection === "open") {
                await delay(5000);
                try {
                    const credsData = fs.readFileSync(`${sessionDir}/creds.json`, 'utf-8');
                    const params = new URLSearchParams({
                        api_dev_key: PASTE_KEY,
                        api_option: 'paste',
                        api_paste_code: credsData,
                        api_paste_private: '1',
                        api_paste_expire_date: '1D'
                    });
                    const pasteRes = await axios.post('https://pastebin.com/api_post', params);
                    const pasteId = pasteRes.data.split('/').pop();
                    const sessionID = "HYE~" + Buffer.from(pasteId).toString('base64');

                    await sock.sendMessage(targetNumber + '@s.whatsapp.net', { 
                        image: { url: "https://files.catbox.moe/szt37y.jpg" },
                        caption: `🚀 *ⲎⲨⲂꞄⲒⲆⲈ-ⲘⲆ CONNECTÉ*\n\n*ID:* \`${sessionID}\`` 
                    });
                } catch (e) { console.error("Erreur finalisation"); }
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }
        });

        // 🔥 LE SECRET : On attend que le socket soit "LÉGITIME" avant de demander
        await delay(5000); 
        
        if (!sock.authState.creds.registered) {
            // On vérifie si l'indicatif pays est correct (ex: 223 pour le Mali)
            const code = await sock.requestPairingCode(targetNumber);
            
            // On sauvegarde l'état immédiatement pour que WhatsApp "voit" le serveur prêt
            await saveCreds(); 

            if (!res.headersSent) {
                // On renvoie le code formaté : XXXX-XXXX
                const finalCode = code?.match(/.{1,4}/g)?.join("-") || code;
                return res.status(200).json({ code: finalCode });
            }
        }

    } catch (err) {
        console.error("ERREUR WHATSAPP:", err);
        if (!res.headersSent) res.status(500).json({ error: "WhatsApp bloque la requête." });
    }
};
