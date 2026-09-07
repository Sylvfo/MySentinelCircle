// NoSMSNow — terminal stand-in for a real SMS/email provider during dev.
//
// - Watches outbound sends: the backend's console sender services POST here
//   (SMS_SENDER/OTP_SENDER/EMAIL_SENDER, when NOSMSNOW_URL is set) instead of
//   just logging to their own terminal.
// - Lets you simulate an inbound SMS reply from a REPL prompt, forwarded to
//   the real backend's /sentinel/sms/inbound webhook.
//
// Plain Node.js, zero dependencies — `node server.js` and nothing else.

const http = require('http');
const readline = require('readline');

const PORT = process.env.NOSMSNOW_PORT ?? 4001;
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';

function timestamp() {
  return new Date().toISOString();
}

function printSend(payload) {
  const { channel = 'sms', to, subject, body } = payload;
  const label = channel.toUpperCase();
  const subjectPart = subject ? ` [${subject}]` : '';
  console.log(`[${timestamp()}] ${label} -> ${to}${subjectPart}: ${body}`);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/send') {
    res.writeHead(404).end();
    return;
  }

  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    try {
      const payload = JSON.parse(raw);
      printSend(payload);
      res.writeHead(204).end();
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`NoSMSNow listening on http://localhost:${PORT} (POST /send)`);
  console.log(`Forwarding simulated inbound SMS to ${BACKEND_URL}/sentinel/sms/inbound`);
  console.log('Type "<phone> <message>" to simulate an inbound SMS reply, e.g.: +41791234567 OUI');
  startRepl();
});

function startRepl() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'nosmsnow> ' });
  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (trimmed) {
      const spaceIndex = trimmed.indexOf(' ');
      if (spaceIndex === -1) {
        console.log('Usage: <phone> <message>  (e.g. +41791234567 OUI)');
      } else {
        const from = trimmed.slice(0, spaceIndex);
        const body = trimmed.slice(spaceIndex + 1);
        await simulateInboundSms(from, body);
      }
    }
    rl.prompt();
  });

  rl.on('close', () => {
    server.close();
    process.exit(0);
  });
}

async function simulateInboundSms(from, body) {
  try {
    const res = await fetch(`${BACKEND_URL}/sentinel/sms/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, body }),
      signal: AbortSignal.timeout(5000),
    });
    const result = await res.json().catch(() => null);
    console.log(`[${timestamp()}] inbound SMS from ${from} -> backend responded ${res.status}:`, result);
  } catch (err) {
    console.log(`[${timestamp()}] failed to reach backend at ${BACKEND_URL}: ${err.message}`);
  }
}
