const pino = require("pino");
const { PasteClient } = require("pastebin-api");
const fs = require("fs");

const PASTE_KEY = "Nl_9mAGsEssqcDevULF4FItMAasK5gQb"; 
const client = new PasteClient(PASTE_KEY);

module.exports = async (req, res) => {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Numéro requis" });

    const sessionDir = `/tmp/session_${Date.now()}`;
    
    try {
        // 🔥 FIX : Import dynamique de Baileys pour éviter l'erreur ERR_REQUIRE_ESM
        const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = await import("@whiskeysockets/baileys");

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ['Mac OS', 'Safari', '10.15.7'],
        });

        if (!sock.authState.creds.registered) {
            await delay(2000);
            const code = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));
            return res.status(200).json({ code: code });
        }

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
                    text: `*🔗 HYBRIDE-CORE SESSION*\n\nID: \`${SESSION_ID}\`\n\n_Copiez ce code dans vos variables._`
                });

                setTimeout(() => {
                    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true });
                }, 5000);
            }
        });
    } catch (err) { 
        console.error(err);
        if (!res.headersSent) res.status(500).json({ error: "Erreur d'importation Core" }); 
    }
};
