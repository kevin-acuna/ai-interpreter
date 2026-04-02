const fs = require("fs");
const path = require("path");
const http = require("http");
const HttpDispatcher = require("httpdispatcher");
const WebSocketServer = require("websocket").server;
const WebSocketClient = require("websocket").client;
const { generateInterpreterPrompt, getRandomAgent } = require("./constants.js");

require("dotenv").config();

const dispatcher = new HttpDispatcher();
const wsserver = http.createServer(handleRequest);

const HTTP_SERVER_PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

// Audio format constants
const TWILIO_SAMPLE_RATE = 8000;
const OPENAI_SAMPLE_RATE = 24000;

// Mulaw decoding table
const MULAW_DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let mulaw = ~i;
  let sign = mulaw & 0x80;
  let exponent = (mulaw >> 4) & 0x07;
  let mantissa = mulaw & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_DECODE_TABLE[i] = sign ? -sample : sample;
}

// Mulaw encoding function
function encodeMulaw(sample) {
  const MULAW_MAX = 32635;
  const MULAW_BIAS = 0x84;
  
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  
  sample += MULAW_BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
  
  let mantissa = (sample >> (exponent + 3)) & 0x0f;
  let mulawByte = ~(sign | (exponent << 4) | mantissa);
  
  return mulawByte & 0xff;
}

// Convert mulaw 8kHz to PCM16 24kHz
function mulawToPcm24k(mulawBuffer) {
  const pcm8k = new Int16Array(mulawBuffer.length);
  for (let i = 0; i < mulawBuffer.length; i++) {
    pcm8k[i] = MULAW_DECODE_TABLE[mulawBuffer[i]];
  }
  
  // Upsample from 8kHz to 24kHz (3x)
  const pcm24k = new Int16Array(pcm8k.length * 3);
  for (let i = 0; i < pcm8k.length; i++) {
    const curr = pcm8k[i];
    const next = i < pcm8k.length - 1 ? pcm8k[i + 1] : curr;
    pcm24k[i * 3] = curr;
    pcm24k[i * 3 + 1] = Math.round(curr + (next - curr) / 3);
    pcm24k[i * 3 + 2] = Math.round(curr + (2 * (next - curr)) / 3);
  }
  
  return Buffer.from(pcm24k.buffer);
}

// Convert PCM16 24kHz to mulaw 8kHz
function pcm24kToMulaw(pcmBuffer) {
  const pcm24k = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
  
  // Downsample from 24kHz to 8kHz (take every 3rd sample)
  const pcm8kLength = Math.floor(pcm24k.length / 3);
  const mulawBuffer = Buffer.alloc(pcm8kLength);
  
  for (let i = 0; i < pcm8kLength; i++) {
    mulawBuffer[i] = encodeMulaw(pcm24k[i * 3]);
  }
  
  return mulawBuffer;
}

const mediaws = new WebSocketServer({
  httpServer: wsserver,
  autoAcceptConnections: true,
});

function log(message, ...args) {
  console.log(new Date().toISOString(), message, ...args);
}

function handleRequest(request, response) {
  try {
    dispatcher.dispatch(request, response);
  } catch (err) {
    console.error(err);
  }
}

dispatcher.onPost("/twiml", function (req, res) {
  log("POST TwiML");

  // Select a random agent for this call
  const agent = getRandomAgent();
  log(`Agent selected for call: ${agent.name} (ID: ${agent.interpreterId}, voice: ${agent.voice})`);

  // Read the XML template and inject greeting + agent parameters
  const filePath = path.join(__dirname, "/templates", "streams.xml");
  let twiml = fs.readFileSync(filePath, "utf8");

  // Build TTS greeting
  const greeting = `Good morning, my name is ${agent.name}, interpreter ID ${agent.interpreterId}, and I will be your interpreter. Please speak in clear, short sentences so that I can interpret everything.`;

  // Insert <Say> before <Connect>
  twiml = twiml.replace(
    "<Connect>",
    `<Say voice="Polly.Joanna">${greeting}</Say>\n  <Connect>`
  );

  // Insert agent parameters into <Stream>
  twiml = twiml.replace(
    "</Stream>",
    `  <Parameter name="AgentName" value="${agent.name}" />\n      <Parameter name="AgentVoice" value="${agent.voice}" />\n      <Parameter name="AgentId" value="${agent.interpreterId}" />\n    </Stream>`
  );

  res.writeHead(200, {
    "Content-Type": "text/xml",
    "Content-Length": Buffer.byteLength(twiml),
  });
  res.end(twiml);
});

mediaws.on("connect", function (connection) {
  log("From Twilio: Connection accepted");
  new MediaStream(connection);
});

class MediaStream {
  constructor(twilioConnection) {
    this.twilioConnection = twilioConnection;
    this.openaiConnection = null;
    this.streamSid = null;
    this.hasSeenMedia = false;
    this.audioBuffer = [];
    this.language1 = "eng";
    this.language2 = "spa";
    this.sessionConfigured = false;
    this.agent = null;
    
    twilioConnection.on("message", this.processTwilioMessage.bind(this));
    twilioConnection.on("close", this.close.bind(this));
    
    this.connectToOpenAI();
  }

  connectToOpenAI() {
    const client = new WebSocketClient();
    
    client.on("connectFailed", (error) => {
      log("OpenAI WebSocket connection failed:", error.toString());
    });

    client.on("connect", (connection) => {
      log("Connected to OpenAI Realtime API");
      this.openaiConnection = connection;

      connection.on("error", (error) => {
        log("OpenAI WebSocket error:", error.toString());
      });

      connection.on("close", () => {
        log("OpenAI WebSocket closed");
        this.openaiConnection = null;
      });

      connection.on("message", this.processOpenAIMessage.bind(this));
    });

    client.connect(OPENAI_REALTIME_URL, null, null, {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    });
  }

  configureSession() {
    this.sessionConfigured = true;
    log("=== CONFIGURING SESSION ===");
    log("ISO codes received:", this.language1, "->", this.language2);
    log(`Agent: ${this.agent.name} (ID: ${this.agent.interpreterId}, voice: ${this.agent.voice})`);
    const interpreterPrompt = generateInterpreterPrompt(this.language1, this.language2, this.agent);
    log("Prompt generated for languages:", this.language1, "->", this.language2);
    log("=== PROMPT SENT TO OPENAI ===");
    log(interpreterPrompt);
    log("=== END PROMPT ===");
    const sessionConfig = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions: interpreterPrompt,
        voice: this.agent.voice,
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        turn_detection: {
          type: "semantic_vad",
          eagerness: "auto",
        },
        // input_audio_transcription: {
        //   model: "whisper-1",
        // },
         speed: 1.2,
      },
    };

    log("Configuring OpenAI session...");
    this.openaiConnection.sendUTF(JSON.stringify(sessionConfig));
  }

  processTwilioMessage(message) {
    if (message.type !== "utf8") return;

    const data = JSON.parse(message.utf8Data);

    switch (data.event) {
      case "connected":
        log("From Twilio: Connected event received");
        break;

      case "start":
        log("From Twilio: Start event received", data.start);
        this.streamSid = data.start.streamSid;
        if (data.start.customParameters) {
          this.language1 = data.start.customParameters.Language1 || "eng";
          this.language2 = data.start.customParameters.Language2 || "spa";
          log("Languages configured:", this.language1, "->", this.language2);

          // Read agent from customParameters (injected by /twiml handler)
          if (data.start.customParameters.AgentName) {
            this.agent = {
              name: data.start.customParameters.AgentName,
              voice: data.start.customParameters.AgentVoice,
              interpreterId: data.start.customParameters.AgentId,
            };
          } else {
            // Fallback if agent params are missing
            this.agent = getRandomAgent();
          }
          log(`AI Agent: ${this.agent.name} (ID: ${this.agent.interpreterId}, voice: ${this.agent.voice})`);
        }
        if (this.openaiConnection && !this.sessionConfigured) {
          this.configureSession();
        }
        break;

      case "media":
        if (!this.hasSeenMedia) {
          log("From Twilio: Receiving media stream...");
          this.hasSeenMedia = true;
        }
        this.forwardAudioToOpenAI(data.media.payload);
        break;

      case "mark":
        log("From Twilio: Mark event received", data.mark);
        break;

      case "stop":
        log("From Twilio: Stop event received");
        this.close();
        break;
    }
  }

  forwardAudioToOpenAI(payload) {
    if (!this.openaiConnection) return;

    // Send mulaw audio directly to OpenAI (no conversion needed with g711_ulaw format)
    const audioEvent = {
      type: "input_audio_buffer.append",
      audio: payload,
    };
    
    this.openaiConnection.sendUTF(JSON.stringify(audioEvent));
  }

  processOpenAIMessage(message) {
    if (message.type !== "utf8") return;

    const data = JSON.parse(message.utf8Data);

    switch (data.type) {
      case "session.created":
        log("✅ Sesión OpenAI creada");
        if (this.streamSid && this.agent && !this.sessionConfigured) {
          this.configureSession();
        }
        break;

      case "session.updated":
        log("✅ Sesión configurada");
        break;

      case "input_audio_buffer.speech_started":
        log("🎤 Usuario hablando...");
        this.sendClearMessage();
        break;

      case "conversation.item.input_audio_transcription.completed":
        log("🎤 USUARIO:", data.transcript);
        break;

      case "response.audio.delta":
        this.forwardAudioToTwilio(data.delta);
        break;

      case "response.audio_transcript.done":
        log("🤖 IA:", data.transcript);
        break;

      case "error":
        log("❌ ERROR:", JSON.stringify(data.error));
        break;
    }
  }

  forwardAudioToTwilio(base64Audio) {
    if (!this.twilioConnection || !this.streamSid) return;

    // Send mulaw audio directly to Twilio (no conversion needed with g711_ulaw format)
    const mediaMessage = {
      event: "media",
      streamSid: this.streamSid,
      media: {
        payload: base64Audio,
      },
    };

    this.twilioConnection.sendUTF(JSON.stringify(mediaMessage));
  }

  sendClearMessage() {
    if (!this.twilioConnection || !this.streamSid) return;

    const clearMessage = {
      event: "clear",
      streamSid: this.streamSid,
    };
    this.twilioConnection.sendUTF(JSON.stringify(clearMessage));
  }

  triggerInitialGreeting() {
    if (!this.openaiConnection) return;

    log("Triggering initial greeting...");
    
    // Add a conversation item to simulate the "first turn" context
    const conversationItem = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "[System: Session started. Deliver your interpreter greeting now.]",
          },
        ],
      },
    };
    this.openaiConnection.sendUTF(JSON.stringify(conversationItem));

    // Trigger response using session instructions (INTERPRETER_PROMPT)
    const responseCreate = {
      type: "response.create",
    };
    this.openaiConnection.sendUTF(JSON.stringify(responseCreate));
  }

  close() {
    log("Closing connections...");
    if (this.openaiConnection) {
      this.openaiConnection.close();
    }
    if (this.twilioConnection.connected) {
      this.twilioConnection.close();
    }
  }
}

wsserver.listen(HTTP_SERVER_PORT, function () {
  console.log("AI Interpreter Server listening on: http://localhost:%s", HTTP_SERVER_PORT);
});
