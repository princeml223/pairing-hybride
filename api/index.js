<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hybride-MD Login</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
        body { background: linear-gradient(to bottom, #1a1a2e, #0b0b1a); color: white; font-family: sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
        .card { background: #16162d; border-radius: 20px; width: 90%; max-width: 400px; padding: 40px 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; }
        .display-area { background: rgba(0,0,0,0.2); border-radius: 15px; height: 220px; display: flex; align-items: center; justify-content: center; margin: 20px 0; border: 1px solid #2a2a4a; overflow: hidden; }
        .btn { background: #6366f1; border-radius: 12px; padding: 15px; width: 100%; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 10px; transition: 0.2s; }
        .btn:active { transform: scale(0.98); }
        .qr-canvas canvas { border-radius: 10px; }
    </style>
</head>
<body>

<div class="card">
    <h1 class="text-2xl font-bold mb-4">Hybride-MD Login</h1>
    
    <div class="flex items-center justify-center gap-2 mb-6 text-gray-400 text-sm">
        <input type="checkbox" class="accent-indigo-500"> <span>Use a custom session</span>
    </div>

    <div class="display-area" id="display">
        <span class="text-gray-500" id="msg">Select a login method</span>
        <div id="pairing-input" class="hidden w-full px-4">
            <input type="text" id="num" placeholder="223XXXXXXXX" class="w-full p-3 bg-[#1f1f3a] border border-[#33334d] rounded-xl text-center mb-3 outline-none">
            <button onclick="submitPairing()" class="bg-indigo-600 w-full py-2 rounded-lg text-sm font-bold">Générer</button>
        </div>
        <div id="qr-holder" class="hidden qr-canvas"></div>
    </div>

    <button onclick="showQR()" class="btn"><i class="fas fa-qrcode"></i> QR Code</button>
    <button onclick="showPairing()" class="btn"><i class="fas fa-link"></i> Pairing Code</button>

    <div class="mt-8 text-[10px] text-gray-600 flex justify-center gap-4">
        <span>MIT LICENSE</span>
        <span>INFO</span>
        <span>© 2026</span>
    </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>
    const display = document.getElementById('display');
    const msg = document.getElementById('msg');
    const pInput = document.getElementById('pairing-input');
    const qrHolder = document.getElementById('qr-holder');

    function reset() {
        msg.classList.add('hidden');
        pInput.classList.add('hidden');
        qrHolder.classList.add('hidden');
    }

    function showPairing() { reset(); pInput.classList.remove('hidden'); }

    async function submitPairing() {
        const n = document.getElementById('num').value;
        if(!n) return alert("Numéro !");
        msg.innerText = "Génération...";
        msg.classList.remove('hidden');
        pInput.classList.add('hidden');
        const res = await fetch(`/api/generate?number=${n}`);
        const data = await res.json();
        msg.innerHTML = `<div class='text-3xl font-bold tracking-widest text-indigo-400'>${data.code}</div>`;
    }

    async function showQR() {
        reset();
        msg.innerText = "Chargement...";
        msg.classList.remove('hidden');
        const res = await fetch(`/api/generate`);
        const data = await res.json();
        if(data.qr) {
            msg.classList.add('hidden');
            qrHolder.classList.remove('hidden');
            qrHolder.innerHTML = "";
            new QRCode(qrHolder, { text: data.qr, width: 160, height: 160, colorDark: "#000", colorLight: "#fff" });
        }
    }
</script>
</body>
</html>
