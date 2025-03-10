const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: '*' } // Allow connections from Netlify frontend
});

// Serve static files (for local testing; not needed on Vercel)
app.use(express.static('../frontend'));

// In-memory storage for rooms
const rooms = new Map(); // { roomId: { hostName, movieName, videoLink, participants, videoState } }

// Generate a unique Room ID
function generateRoomId() {
    return `room-${Math.random().toString(36).substr(2, 9)}`;
}

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Host a Party
    socket.on('host-party', (data) => {
        const { hostName, movieName, videoLink } = data;

        // Generate a unique Room ID
        const roomId = generateRoomId();

        // Store room data
        rooms.set(roomId, {
            hostName,
            movieName,
            videoLink,
            participants: { [socket.id]: hostName }, // Map of socket.id -> name
            videoState: { currentTime: 0, isPlaying: false }
        });

        // Join the host to the room
        socket.join(roomId);

        // Send Room ID back to host
        socket.emit('party-hosted', { roomId });
        console.log(`Hosted party: ${roomId} by ${hostName}`);
    });

    // Join a Party
    socket.on('join-party', (data) => {
        const { participantName, roomId } = data;

        // Check if room exists
        if (!rooms.has(roomId)) {
            socket.emit('error', 'Room ID does not exist.');
            return;
        }

        const room = rooms.get(roomId);

        // Check participant limit (max 3)
        if (Object.keys(room.participants).length >= 3) {
            socket.emit('error', 'Room is full (max 3 participants).');
            return;
        }

        // Add participant to room
        room.participants[socket.id] = participantName;
        socket.join(roomId);

        // Send confirmation to participant
        socket.emit('party-joined', { roomId });

        // Broadcast updated room data to all in room
        io.to(roomId).emit('room-data', {
            hostName: room.hostName,
            movieName: room.movieName,
            videoLink: room.videoLink,
            currentTime: room.videoState.currentTime,
            isPlaying: room.videoState.isPlaying,
            participants: room.participants
        });

        console.log(`${participantName} joined ${roomId}`);
    });

    // Rejoin a Party (e.g., on page refresh)
    socket.on('rejoin-party', (data) => {
        const { roomId } = data;

        if (!rooms.has(roomId)) {
            socket.emit('error', 'Room no longer exists.');
            return;
        }

        const room = rooms.get(roomId);

        if (!room.participants[socket.id]) {
            socket.emit('error', 'You are not a participant in this room.');
            return;
        }

        socket.join(roomId);

        // Send current room state to rejoining user
        socket.emit('room-data', {
            hostName: room.hostName,
            movieName: room.movieName,
            videoLink: room.videoLink,
            currentTime: room.videoState.currentTime,
            isPlaying: room.videoState.isPlaying,
            participants: room.participants
        });

        console.log(`${room.participants[socket.id]} rejoined ${roomId}`);
    });

    // Video Sync Events
    socket.on('video-event', (data) => {
        const { roomId, eventType, timestamp } = data;

        if (!rooms.has(roomId)) return;

        const room = rooms.get(roomId);

        // Update video state
        room.videoState.currentTime = timestamp;
        if (eventType === 'play') {
            room.videoState.isPlaying = true;
        } else if (eventType === 'pause') {
            room.videoState.isPlaying = false;
        }

        // Broadcast sync event to all in room (except sender)
        socket.to(roomId).emit('sync-video', { eventType, timestamp });
        console.log(`Video ${eventType} in ${roomId} at ${timestamp}s`);
    });

    // Chat Messages
    socket.on('chat-message', (data) => {
        const { roomId, message, senderName } = data;

        if (!rooms.has(roomId)) return;

        // Broadcast message to all in room
        io.to(roomId).emit('new-message', { senderName, message });
        console.log(`Chat in ${roomId} - ${senderName}: ${message}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        for (const [roomId, room] of rooms) {
            if (room.participants[socket.id]) {
                delete room.participants[socket.id];
                console.log(`User ${socket.id} left ${roomId}`);

                // If room is empty, delete it
                if (Object.keys(room.participants).length === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted (empty)`);
                } else {
                    // Update remaining participants
                    io.to(roomId).emit('room-data', {
                        hostName: room.hostName,
                        movieName: room.movieName,
                        videoLink: room.videoLink,
                        currentTime: room.videoState.currentTime,
                        isPlaying: room.videoState.isPlaying,
                        participants: room.participants
                    });
                }
                break;
            }
        }
    });
});

// Export for Vercel (serverless function)
module.exports = app;

// For local testing (optional)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});