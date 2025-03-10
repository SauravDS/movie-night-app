// Connect to the backend via Socket.IO (replace with your Vercel URL after deployment)
const socket = io('https://movie-night-backend-three.vercel.app/');

// Check which page we're on based on the file name
const isPartyPage = window.location.pathname.includes('party.html');
const urlParams = new URLSearchParams(window.location.search);
const roomIdFromUrl = urlParams.get('room'); // Get room ID from URL if on party.html

// --- Landing Page Logic (index.html) ---
if (!isPartyPage) {
    // DOM elements for landing page
    const hostBtn = document.getElementById('host-btn');
    const joinBtn = document.getElementById('join-btn');
    const hostForm = document.getElementById('host-form');
    const joinForm = document.getElementById('join-form');
    const errorMsg = document.getElementById('error-msg');

    // Toggle Host form
    hostBtn.addEventListener('click', () => {
        hostForm.classList.remove('hidden');
        joinForm.classList.add('hidden');
        errorMsg.classList.add('hidden');
    });

    // Toggle Join form
    joinBtn.addEventListener('click', () => {
        joinForm.classList.remove('hidden');
        hostForm.classList.add('hidden');
        errorMsg.classList.add('hidden');
    });

    // Host Party: Handle "Play Video" button
    document.getElementById('play-video').addEventListener('click', () => {
        const hostName = document.getElementById('host-name').value.trim();
        const movieName = document.getElementById('movie-name').value.trim();
        const videoLink = document.getElementById('video-link').value.trim();

        if (!hostName || !movieName || !videoLink) {
            errorMsg.textContent = 'Please fill in all fields.';
            errorMsg.classList.remove('hidden');
            return;
        }

        // Extract Google Drive file ID from the link
        const fileIdMatch = videoLink.match(/\/d\/(.+?)\//) || videoLink.match(/id=(.+?)&/);
        const fileId = fileIdMatch ? fileIdMatch[1] : null;
        if (!fileId) {
            errorMsg.textContent = 'Invalid Google Drive link.';
            errorMsg.classList.remove('hidden');
            return;
        }

        // Emit host-party event to backend
        socket.emit('host-party', { hostName, movieName, videoLink });
    });

    // Join Party: Handle "Join Party" button
    document.getElementById('join-party').addEventListener('click', () => {
        const participantName = document.getElementById('participant-name').value.trim();
        const roomId = document.getElementById('room-id').value.trim();

        if (!participantName || !roomId) {
            errorMsg.textContent = 'Please fill in all fields.';
            errorMsg.classList.remove('hidden');
            return;
        }

        // Emit join-party event to backend
        socket.emit('join-party', { participantName, roomId });
    });

    // Handle successful hosting
    socket.on('party-hosted', (data) => {
        const { roomId } = data;
        window.location.href = `party.html?room=${roomId}`;
    });

    // Handle successful joining
    socket.on('party-joined', (data) => {
        const { roomId } = data;
        window.location.href = `party.html?room=${roomId}`;
    });

    // Handle errors from backend
    socket.on('error', (message) => {
        errorMsg.textContent = message;
        errorMsg.classList.remove('hidden');
    });
}

// --- Party Page Logic (party.html) ---
if (isPartyPage && roomIdFromUrl) {
    // DOM elements for party page
    const videoPlayer = document.getElementById('video-player');
    const roomInfo = document.getElementById('room-info');
    const messages = document.getElementById('messages');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    let userName = ''; // Will be set by backend response
    let currentRoomId = roomIdFromUrl;

    // Function to extract direct Google Drive video URL
    function getDirectVideoUrl(videoLink) {
        const fileIdMatch = videoLink.match(/\/d\/(.+?)\//) || videoLink.match(/id=(.+?)&/);
        const fileId = fileIdMatch ? fileIdMatch[1] : null;
        return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : null;
    }

    // Join the room automatically when page loads
    socket.emit('rejoin-party', { roomId: currentRoomId });

    // Handle room data from backend (initial state)
    socket.on('room-data', (data) => {
        const { hostName, movieName, videoLink, currentTime, isPlaying, participants } = data;
        userName = participants[socket.id]; // Get this user's name
        roomInfo.textContent = `Room: ${currentRoomId} | Movie: ${movieName} | Host: ${hostName}`;

        // Set video source
        videoPlayer.src = getDirectVideoUrl(videoLink);
        videoPlayer.currentTime = currentTime || 0;

        // Sync initial state
        if (isPlaying) {
            videoPlayer.play();
        } else {
            videoPlayer.pause();
        }
    });

    // Video sync: Emit events when user interacts with video
    videoPlayer.addEventListener('play', () => {
        socket.emit('video-event', { roomId: currentRoomId, eventType: 'play', timestamp: videoPlayer.currentTime });
    });

    videoPlayer.addEventListener('pause', () => {
        socket.emit('video-event', { roomId: currentRoomId, eventType: 'pause', timestamp: videoPlayer.currentTime });
    });

    videoPlayer.addEventListener('seeked', () => {
        socket.emit('video-event', { roomId: currentRoomId, eventType: 'seek', timestamp: videoPlayer.currentTime });
    });

    // Handle video sync from other users
    socket.on('sync-video', (data) => {
        const { eventType, timestamp } = data;
        videoPlayer.currentTime = timestamp;

        if (eventType === 'play') {
            videoPlayer.play();
        } else if (eventType === 'pause') {
            videoPlayer.pause();
        }
    });

    // Chat: Send message on button click
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    function sendMessage() {
        const message = chatInput.value.trim();
        if (message) {
            socket.emit('chat-message', { roomId: currentRoomId, message, senderName: userName });
            chatInput.value = '';
        }
    }

    // Receive and display chat messages
    socket.on('new-message', (data) => {
        const { senderName, message } = data;
        const li = document.createElement('li');
        li.textContent = `${senderName}: ${message}`;
        messages.appendChild(li);
        messages.scrollTop = messages.scrollHeight; // Auto-scroll to latest message
    });

    // Handle errors on party page
    socket.on('error', (message) => {
        alert(message); // Simple alert for party page errors
        window.location.href = '/'; // Redirect to landing page
    });
} 