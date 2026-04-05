const pino = require("pino");
const fs = require("fs-extra");
const axios = require("axios");

// 🔑 TA CLÉ PASTEBIN (On garde ta logique de stockage externe)
const PASTE_KEY = "Nl_9mAGsEssqcDevULF4FItMAasK5gQb";

module.exports = async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Numéro requis" });

    const targetNumber = number.replace(/[^0-9]/g, '');
    const sessionDir = `/tmp/hybride_${Date.now()}`;

    try {
        // 🔥 Import dynamique du Baileys Officiel (Le plus stable)
        const { 
            default: HybrideWASocket, 
            useMultiFileAuthState, 
            delay, 
            makeCacheableSignalKeyStore, 
            fetchLatestBaileysVersion 
        } = await import("@whiskeysockets/baileys");

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        let sock = HybrideWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ["Ubuntu", "Chrome", "20.0.04"], // Browser standard pour éviter les bans
            syncFullHistory: false,
        });

        // --- GÉNÉRATION DU CODE (Style Venocyber) ---
        if (!sock.authState.creds.registered) {
            await delay(3000); 
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
                await delay(5000); // Temps de synchro indispensable

                try {
                    // On lit le fichier creds.json directement depuis le dossier temporaire
                    const credsData = fs.readFileSync(`${sessionDir}/creds.json`, 'utf-8');
                    
                    // Envoi vers Pastebin (Comme ton ancienne logique Venocyber mais via API)
                    const params = new URLSearchParams();
                    params.append('api_dev_key', PASTE_KEY);
                    params.append('api_option', 'paste');
                    params.append('api_paste_code', credsData);
                    params.append('api_paste_private', '1');
                    params.append('api_paste_expire_date', '1D');

                    const pasteRes = await axios.post('https://pastebin.com/api_post', params);
                    const pasteId = pasteRes.data.split('/').pop();
                    
                    // --- TON SESSION ID PERSONNALISÉ ---
                    const sessionID = "HYE~" + Buffer.from(pasteId).toString('base64');

                    let VENOCYBER_STYLE_TEXT = `
🚀 *ⲎⲨⲂꞄⲒⲆⲈ-ⲘⲆ Ⲭ ⲜⲈⲚⲞⲤⲨⲂⲈꞄ*
______________________________________

╔══════════════════════╗
║ *SESSION CONNECTÉE AVEC SUCCÈS*
║ _Voici ton ID de connexion._
╚══════════════════════╝

*SESSION ID :*
\`${sessionID}\`

______________________________________
*Propulsé par Mohamed Mahmoud BABY*
*Design by Wicked*`;

                    // Envoi du message final avec ton ID
                    await sock.sendMessage(targetNumber + '@s.whatsapp.net', { 
                        image: { url: "https://files.catbox.moe/szt37y.jpg" },
                        caption: VENOCYBER_STYLE_TEXT 
                    });

                } catch (e) {
                    console.error("Erreur Session:", e.message);
                }

                // Nettoyage et fermeture propre
                await delay(2000);
                if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true });
                process.exit(0); // On coupe la fonction Vercel proprement
            }
        });

    } catch (err) {
        console.log("Erreur de service");
        if (!res.headersSent) res.status(500).json({ error: "Service Temporairement Indisponible" });
    }
};
