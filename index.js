const qrcode_terminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const port = process.env.PORT || 8000;
const basicAuth = require('express-basic-auth');

const { Client, LocalAuth } = require('whatsapp-web.js');
const { phoneNumberFormatter } = require('./helpers/Formatter');
const { verifyApiToken } = require('./middleware');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

app.use(basicAuth({
    users:  { [process.env.CREDENTIAL_USERNAME]: process.env.CREDENTIAL_PASSWORD },
    challenge: true,
    unauthorizedResponse: 'Invalid credentials! access denied.'
}));

const io = require('socket.io')(server, {
    cors: {
        origin: "http://localhost:8000",
        methods: ["GET", "POST"],
        transports: ['websocket', 'polling'],
        credentials: true
    },
    allowEIO3: true
});

const client = new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // <- this one doesn't works in Windows
        '--disable-gpu'
      ],
    },
    authStrategy: new LocalAuth()
  });

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

app.get('/', (req, res) => {
    res.sendFile('index.html', {
      root: __dirname
    });
  });

app.post('/send-otp', verifyApiToken, async (req,res) => {

    const phone_number = phoneNumberFormatter(req.body.phone_number)
    const message = req.body.message

    await client.sendMessage(phone_number, message).then(response => {
        res.status(200).send({
            'message': "message send successfully"
        })
    })
    
})

client.initialize();

server.listen(port, () => {
    console.log('App running on *: ' + port);
  });

io.on('connection', (socket) => {
    socket.emit('message', 'Connecting...');
  
    client.on('qr', (qr) => {
    // use qrcode_terminal for rendering in terminal
    //   qrcode_terminal.generate(qr, {small: true});

      qrcode.toDataURL(qr, (err, url) => {
        socket.emit('qr', url);
        socket.emit('message', 'QR Code received, scan please!');
      });
    });
  
    client.on('ready', () => {
      socket.emit('ready', 'Whatsapp is ready!');
      socket.emit('message', 'Attached current phone number session: ' + client.info.wid.user);
    });
  
    client.on('authenticated', () => {
      socket.emit('authenticated', 'Whatsapp is authenticated!');
      socket.emit('message', 'Whatsapp successfuly authenticated!');
    });
  
    client.on('auth_failure', function(session) {
      socket.emit('message', 'Auth failure, restarting...');
    });
  
    client.on('disconnected', (reason) => {
      socket.emit('message', 'Whatsapp is disconnected!');
      client.destroy();
      client.initialize();
    });
    
  });