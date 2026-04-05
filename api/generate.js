const pino = require("pino");
const { PasteClient } = require("pastebin-api");
const fs = require("fs");

// 🔑 TA CLÉ PASTEBIN CONFIGURÉE
const PASTE_KEY = "Nl_9mAGsEssqcDevULF4FItMAasK5gQb"; 
const client = new PasteClient(PASTE_KEY);

module.exports = async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Numéro requis" });
    const targetNumber = number.replace(/[^0-9]/g, '');

    const sessionDir = `/tmp/session_${Date.now()}`;
    
    try {
        // Import dynamique de Baileys (Fix ERR_REQUIRE_ESM)
        const { 
            default: makeWASocket, 
            useMultiFileAuthState, 
            fetchLatestBaileysVersion, 
            makeCacheableSignalKeyStore 
        } = await import("@whiskeysockets/baileys");

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            // Config Safari Mac OS identique à ton panel
            browser: ['Mac OS', 'Safari', '10.15.7'], 
        });

        // --- GÉNÉRATION DU CODE DE PAIRING ---
        if (!sock.authState.creds.registered) {
            // Délai d'attente optimal pour Vercel (3 secondes)
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const rawCode = await sock.requestPairingCode(targetNumber);
            // Formatage du code : XXXX-XXXX
            const code = rawCode?.match(/.{1,4}/g)?.join("-") || rawCode;
            
            // On renvoie la réponse au site immédiatement
            return res.status(200).json({ code: code });
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                const credsData = JSON.stringify(sock.authState.creds);
                
                // Sauvegarde sur Pastebin pour générer le SESSION_ID
                const pasteUrl = await client.createPaste({
                    code: credsData,
                    expireDate: "1D",
                    name: "Hybride-Session",
                    publicity: 1 
                });

                const pasteId = pasteUrl.split('/').pop();
                const SESSION_ID = `Hybride~${Buffer.from(pasteId).toString('base64')}`;

                // Envoi de l'ID en message privé WhatsApp
                await sock.sendMessage(sock.user.id, { 
                    text: `🚀 *HYBRIDE-MD CONNECTÉ*\n\n*ID:* \`${SESSION_ID}\`\n\n_Copiez ce code pour votre bot._`
                });

                // Nettoyage du dossier temporaire
                setTimeout(() => {
                    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true });
                }, 5000);
            }
        });
    } catch (err) { 
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: "Erreur Core" }); 
    }
};
