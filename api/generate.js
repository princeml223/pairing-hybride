const pino = require("pino");
const fs = require("fs-extra");
const axios = require("axios");

// 🔑 TA CLÉ PASTEBIN
const PASTE_KEY = "Nl_9mAGsEssqcDevULF4FItMAasK5gQb";

module.exports = async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Numéro requis" });

    const targetNumber = number.replace(/[^0-9]/g, '');
    const sessionDir = `/tmp/session_${targetNumber}_${Date.now()}`;

    try {
        // Imports dynamiques pour Baileys ESM
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
            browser: ['Mac OS', 'Safari', '10.15.7'], // Ta config Safari
            syncFullHistory: false,
        });

        // --- PHASE 1 : GÉNÉRATION DU CODE ---
        if (!sock.authState.creds.registered) {
            await delay(5000); // Délai réduit à 5s pour éviter le timeout Vercel (max 10s en free)
            const code = await sock.requestPairingCode(targetNumber);
            const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
            
            // On répond immédiatement au client
            res.status(200).json({ code: formattedCode });
        }

        // --- PHASE 2 : SAUVEGARDE DE LA SESSION (Background) ---
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                await delay(5000); // Temps de synchro réduit pour Vercel

                try {
                    const credsData = JSON.stringify(sock.authState.creds);
                    const params = new URLSearchParams();
                    params.append('api_dev_key', PASTE_KEY);
                    params.append('api_option', 'paste');
                    params.append('api_paste_code', credsData);
                    params.append('api_paste_private', '1');
                    params.append('api_paste_expire_date', '10M');

                    const pasteRes = await axios.post('https://pastebin.com/api_post', params);
                    
                    if (pasteRes.data && pasteRes.data.includes('pastebin.com')) {
                        const pasteId = pasteRes.data.split('/').pop();
                        // Ton format d'ID personnalisé
                        const sessionID = "HYE~" + Buffer.from(pasteId).toString('base64');

                        // Envoi du message de confirmation avec ton image
                        await sock.sendMessage(targetNumber + '@s.whatsapp.net', { 
                            image: { url: "https://files.catbox.moe/szt37y.jpg" },
                            caption: `🚀 *ⲎⲨⲂꞄⲒⲆⲈ-ⲘⲆ V3*\n\n*SESSION ID :* \`${sessionID}\`\n\n_Généré avec succès sur Vercel._` 
                        });
                    }
                } catch (e) {
                    console.error("Erreur Pastebin:", e.message);
                }
                
                // Nettoyage immédiat
                if (fs.existsSync(sessionDir)) fs.removeSync(sessionDir);
            }
        });

    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: "Erreur Serveur" });
    }
};
