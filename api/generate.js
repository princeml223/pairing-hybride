const { default: makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const pino = require("pino");
const { PasteClient } = require("pastebin-api");
const fs = require("fs");

// 🔑 TA CLÉ PASTEBIN ICI (REPO PRIVÉ = SÉCURITÉ)
const PASTE_KEY = "TA_CLE_DEVELOPPEUR_PASTEBIN_ICI"; 
const client = new PasteClient(PASTE_KEY);

export default async function handler(req, res) {
    const { number } = req.query;
    if (!number) return res.status(400).json({ error: "Numéro requis" });

    const sessionDir = `/tmp/session_${Date.now()}`;
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    try {
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }),
            browser: ["Mac OS", "Chrome", "20.0.04"],
        });

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(number.replace(/[^0-9]/g, ''));
            res.status(200).json({ code: code });
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
    } catch (err) { res.status(500).json({ error: "Core Error" }); }
}
