const pino = require("pino");
const { PasteClient } = require("pastebin-api");
const fs = require("fs");

const PASTE_KEY = "Nl_9mAGsEssqcDevULF4FItMAasK5gQb"; 
const client = new PasteClient(PASTE_KEY);

module.exports = async (req, res) => {
    // 1. Extraction et nettoyage du numéro
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Numéro requis" });
    const phoneNumber = number.replace(/[^0-9]/g, '');

    const sessionDir = `/tmp/session_${Date.now()}`;
    
    try {
        // 2. Import dynamique moderne pour éviter ERR_REQUIRE_ESM
        const { 
            default: makeWASocket, 
            useMultiFileAuthState, 
            delay, 
            makeCacheableSignalKeyStore,
            PHONENUMBER_MCC 
        } = await import("@whiskeysockets/baileys");

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        // 3. Configuration du Socket
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            // Browser indispensable pour le pairing code
            browser: ["Ubuntu", "Chrome", "20.0.04"], 
        });

        // 4. Génération du Code
        if (!sock.authState.creds.registered) {
            await delay(3000); // On laisse le temps au socket de s'initialiser
            const code = await sock.requestPairingCode(phoneNumber);
            
            // On renvoie DIRECTEMENT la réponse ici
            return res.status(200).json({ code: code });
        }

        // 5. Gestion de la session (en arrière-plan)
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                const credsData = JSON.stringify(sock.authState.creds);
                const pasteUrl = await client.createPaste({
                    code: credsData,
                    expireDate: "1D",
                    name: "Hybride-Session",
                    publicity: 1
                });

                const pasteId = pasteUrl.split('/').pop();
                const SESSION_ID = `Hybride~${Buffer.from(pasteId).toString('base64')}`;

                await sock.sendMessage(sock.user.id, { 
                    text: `*🔗 HYBRIDE-CORE SESSION*\n\nID: \`${SESSION_ID}\``
                });

                setTimeout(() => {
                    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true });
                }, 5000);
            }
        });

    } catch (err) { 
        console.error("Erreur détaillée:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Erreur lors de la génération du code" });
        }
    }
};
