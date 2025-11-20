const statusEl = document.querySelector('.status');
const orb = document.querySelector('.orb');
const userTextEl = document.getElementById('user-text');
const aiTextEl = document.getElementById('ai-text');
const startBtn = document.getElementById('start-btn');

let ws;
let recognition;
let isListening = false;
let audioQueue = [];
let isPlaying = false;

// Initialize WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        statusEl.textContent = 'Connected';
        startBtn.disabled = false;
    };

    ws.onclose = () => {
        statusEl.textContent = 'Disconnected. Reconnecting...';
        setTimeout(connectWebSocket, 3000);
    };

    ws.onmessage = async (event) => {
        if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);
            if (data.type === 'text') {
                aiTextEl.textContent = data.content;
            } else if (data.type === 'error') {
                console.error(data.message);
                statusEl.textContent = `Error: ${data.message}`;
            }
        } else if (event.data instanceof Blob) {
            // Audio data
            audioQueue.push(event.data);
            playAudioQueue();
        }
    };
}

// Initialize Speech Recognition
function setupRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        alert('Web Speech API not supported. Please use Chrome.');
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.continuous = false; // We want to stop after each sentence to process
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        isListening = true;
        orb.classList.add('listening');
        orb.classList.remove('speaking');
        statusEl.textContent = 'Listening...';
    };

    recognition.onend = () => {
        isListening = false;
        orb.classList.remove('listening');
        // If we are not playing audio, restart listening (continuous loop)
        // But we wait if we are about to play audio
        if (!isPlaying) {
             // Small delay to prevent instant loop if error
             setTimeout(() => {
                 if (!isPlaying && !isListening) recognition.start();
             }, 500);
        }
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        userTextEl.textContent = `You: ${transcript}`;
        statusEl.textContent = 'Thinking...';
        ws.send(transcript);
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        statusEl.textContent = 'Error listening';
    };
}

async function playAudioQueue() {
    if (isPlaying || audioQueue.length === 0) return;

    isPlaying = true;
    orb.classList.remove('listening');
    orb.classList.add('speaking');
    statusEl.textContent = 'Speaking...';
    
    // Stop listening while speaking to avoid picking up own voice
    if (isListening) recognition.stop();

    const audioBlob = audioQueue.shift();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    audio.onended = () => {
        isPlaying = false;
        orb.classList.remove('speaking');
        statusEl.textContent = 'Idle';
        
        if (audioQueue.length > 0) {
            playAudioQueue();
        } else {
            // Resume listening
            recognition.start();
        }
    };

    await audio.play();
}

startBtn.addEventListener('click', () => {
    startBtn.style.display = 'none';
    setupRecognition();
    recognition.start();
});

connectWebSocket();
