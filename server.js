const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

let rooms = {};
let roomTimestamps = {}; // Store room creation times
let roomLastActivity = {}; // Store last activity time for each room

// Auto-cleanup function - runs every 6 hours
function cleanupExpiredRooms() {
    const now = Date.now();
    const INACTIVITY_TIMEOUT = 3 * 24 * 60 * 60 * 1000; // 3 days of inactivity

    let deletedCount = 0;
    for (const roomName in roomLastActivity) {
        const lastActivity = roomLastActivity[roomName];
        const inactiveTime = now - lastActivity;

        if (inactiveTime > INACTIVITY_TIMEOUT) {
            console.log(`🗑️  Auto-deleting inactive room: ${roomName} (inactive for ${Math.floor(inactiveTime / (24 * 60 * 60 * 1000))} days)`);
            delete rooms[roomName];
            delete roomTimestamps[roomName];
            delete roomLastActivity[roomName];
            deletedCount++;
        }
    }

    if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} inactive rooms`);
        // Notify all clients to update room list
        const roomList = Object.keys(rooms).map(name => ({
            name: name,
            hasPassword: rooms[name] && rooms[name].hasPassword
        }));
        io.emit('updateRooms', roomList);
    }
}

// Run cleanup every 6 hours for production
setInterval(cleanupExpiredRooms, 6 * 60 * 60 * 1000);

// Run cleanup on startup to clear any expired rooms
console.log('🚀 Starting server with 3-day inactivity room cleanup...');
cleanupExpiredRooms();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    console.log('Current rooms:', Object.keys(rooms), 'Count:', Object.keys(rooms).length);

    // Add a catch-all event listener to debug
    socket.onAny((eventName, ...args) => {
        console.log(`📡 Received event: ${eventName}`, args);
    });

    socket.on('requestRooms', () => {
        const roomList = Object.keys(rooms).map(roomName => ({
            name: roomName,
            hasPassword: rooms[roomName] && rooms[roomName].hasPassword
        }));
        console.log(`🔥 Client ${socket.id} requested rooms, sending:`, roomList);
        socket.emit('updateRooms', roomList);
    });

    // Send initial room list with password info
    setTimeout(() => {
        const initialRooms = Object.keys(rooms).map(roomName => ({
            name: roomName,
            hasPassword: rooms[roomName] && rooms[roomName].hasPassword
        }));
        console.log(`Sending initial rooms to ${socket.id}:`, initialRooms);
        socket.emit('updateRooms', initialRooms);
    }, 50);

    socket.on('joinRoom', ({ room, password }) => {
        // Check if room exists and has a password
        if (rooms[room] && rooms[room].hasPassword && rooms[room].password) {
            if (rooms[room].password !== password) {
                socket.emit('joinError', 'Incorrect password');
                console.log(`Client ${socket.id} failed to join ${room} - wrong password`);
                return;
            }
        }

        // Create room if it doesn't exist
        if (!rooms[room]) {
            rooms[room] = {
                drawings: [],
                strokes: [], // Track complete strokes for undo
                undoneStrokes: [], // Track undone strokes for redo
                currentStroke: null, // Track stroke in progress
                lastActivity: Date.now(),
                hasPassword: false,
                password: null
            };
            roomTimestamps[room] = Date.now(); // Track creation time for auto-joined rooms
            console.log(`Created new room: ${room} (auto-expires after 3 days of inactivity)`);
        }

        // Update last activity time
        roomLastActivity[room] = Date.now();

        socket.join(room);
        socket.emit('loadCanvas', rooms[room].drawings);
        socket.emit('joinSuccess', room);

        // Send updated room list to ALL clients
        const roomList = Object.keys(rooms).map(roomName => ({
            name: roomName,
            hasPassword: rooms[roomName] && rooms[roomName].hasPassword
        }));
        console.log(`Broadcasting room list to all clients: ${roomList.length} rooms`);
        io.emit('updateRooms', roomList);

        console.log(`Client ${socket.id} joined room: ${room}`);
    });

    socket.on('createRoom', ({ room, password }) => {
        if (rooms[room]) {
            socket.emit('createError', 'Room already exists');
            return;
        }

        rooms[room] = {
            drawings: [],
            strokes: [], // Track complete strokes for undo
            undoneStrokes: [], // Track undone strokes for redo
            currentStroke: null, // Track stroke in progress
            lastActivity: Date.now(),
            hasPassword: password && password.trim() !== '',
            password: password && password.trim() !== '' ? password.trim() : null
        };
        roomTimestamps[room] = Date.now(); // Track creation time
        roomLastActivity[room] = Date.now(); // Track last activity
        if (password && password.trim() !== '') {
            console.log(`Created password-protected room: ${room} (auto-expires after 3 days of inactivity)`);
        } else {
            console.log(`Created public room: ${room} (auto-expires after 3 days of inactivity)`);
        }

        socket.join(room);
        socket.emit('loadCanvas', rooms[room].drawings);
        socket.emit('createSuccess', room);

        // Send updated room list to ALL clients
        const roomList = Object.keys(rooms).map(roomName => ({
            name: roomName,
            hasPassword: rooms[roomName] && rooms[roomName].hasPassword
        }));
        console.log(`Broadcasting room list to all clients: ${roomList.length} rooms`);
        io.emit('updateRooms', roomList);

        console.log(`Client ${socket.id} created and joined room: ${room}`);
    });

    // Handle stroke start events
    socket.on('strokeStart', (data) => {
        const { room, brush, size, color, startPoint } = data;

        if (rooms[room]) {
            // Start a new stroke
            rooms[room].currentStroke = {
                id: Date.now() + Math.random(), // Unique stroke ID
                brush,
                size,
                color,
                points: [startPoint],
                startTime: Date.now(),
                userId: socket.id
            };

            console.log(`🎨 Stroke started in ${room}: ${brush} brush by ${socket.id}`);
        }

        // Broadcast stroke start to all other clients in the room
        socket.to(room).emit('strokeStart', data);
    });

    socket.on('draw', (data) => {
        const { x, y, room, brush = 'square', size = 2, color = '#00ff00', lastPoint, isConnected = false } = data;

        // Ensure room exists with proper structure
        if (!rooms[room]) {
            rooms[room] = {
                drawings: [],
                strokes: [], // Track complete strokes for undo
                undoneStrokes: [], // Track undone strokes for redo
                currentStroke: null, // Track stroke in progress
                lastActivity: Date.now(),
                hasPassword: false,
                password: null
            };
            roomTimestamps[room] = Date.now();
        }

        // Add point to current stroke if one exists
        if (rooms[room].currentStroke) {
            rooms[room].currentStroke.points.push({ x, y, timestamp: Date.now() });
        }

        // Store the drawing data for immediate playback (legacy support)
        const drawingData = {
            x,
            y,
            brush,
            size,
            color,
            lastPoint: lastPoint || null,
            isConnected,
            timestamp: Date.now()
        };
        rooms[room].drawings.push(drawingData);

        rooms[room].lastActivity = Date.now();
        roomLastActivity[room] = Date.now(); // Update activity on drawing

        // Broadcast to all other clients in the room (excluding sender)
        socket.to(room).emit('draw', drawingData);

        console.log(`📝 Drawing in ${room}: ${brush} brush, size ${size}, color ${color} at (${x}, ${y}), connected: ${isConnected}`);
    });

    // Handle stroke end events
    socket.on('strokeEnd', (data) => {
        const { room } = data;

        if (rooms[room] && rooms[room].currentStroke) {
            // Complete the current stroke and add it to strokes history
            const completedStroke = { ...rooms[room].currentStroke };
            completedStroke.endTime = Date.now();

            rooms[room].strokes.push(completedStroke);
            rooms[room].currentStroke = null;

            // Clear redo history when a new stroke is made
            rooms[room].undoneStrokes = [];

            // Keep only last 10 strokes for undo
            if (rooms[room].strokes.length > 10) {
                rooms[room].strokes = rooms[room].strokes.slice(-10);
            }

            console.log(`✅ Stroke completed in ${room}: ${completedStroke.points.length} points, ${completedStroke.brush} brush`);
        }

        // Broadcast stroke end to all other clients in the room
        socket.to(room).emit('strokeEnd');
    });

    // Handle undo actions
    socket.on('undo', (data) => {
        const { room } = data;

        if (rooms[room] && rooms[room].strokes.length > 0) {
            // Remove the last stroke and save it for redo
            const undoneStroke = rooms[room].strokes.pop();
            rooms[room].undoneStrokes.push(undoneStroke);

            // Keep only last 10 undone strokes for redo
            if (rooms[room].undoneStrokes.length > 10) {
                rooms[room].undoneStrokes = rooms[room].undoneStrokes.slice(-10);
            }

            // Rebuild drawings array from remaining strokes only
            rooms[room].drawings = [];
            rooms[room].strokes.forEach(stroke => {
                stroke.points.forEach((point, index) => {
                    const isConnected = index > 0;
                    const lastPoint = index > 0 ? stroke.points[index - 1] : null;

                    rooms[room].drawings.push({
                        x: point.x,
                        y: point.y,
                        brush: stroke.brush,
                        size: stroke.size,
                        color: stroke.color,
                        lastPoint: lastPoint,
                        isConnected: isConnected,
                        timestamp: point.timestamp
                    });
                });
            });

            // Send the updated canvas state to all clients
            io.to(room).emit('undoComplete', {
                strokeCount: rooms[room].strokes.length,
                undoneCount: rooms[room].undoneStrokes.length,
                drawings: rooms[room].drawings
            });

            console.log(`↩️  Undo in ${room}: Removed stroke with ${undoneStroke.points.length} points. ${rooms[room].strokes.length} strokes remaining, ${rooms[room].undoneStrokes.length} available for redo.`);
        } else {
            console.log(`❌ Cannot undo in ${room}: No strokes available`);
        }
    });

    // Handle redo actions
    socket.on('redo', (data) => {
        const { room } = data;

        if (rooms[room] && rooms[room].undoneStrokes.length > 0) {
            // Take the last undone stroke and restore it
            const redoneStroke = rooms[room].undoneStrokes.pop();
            rooms[room].strokes.push(redoneStroke);

            // Rebuild drawings array from all strokes
            rooms[room].drawings = [];
            rooms[room].strokes.forEach(stroke => {
                stroke.points.forEach((point, index) => {
                    const isConnected = index > 0;
                    const lastPoint = index > 0 ? stroke.points[index - 1] : null;

                    rooms[room].drawings.push({
                        x: point.x,
                        y: point.y,
                        brush: stroke.brush,
                        size: stroke.size,
                        color: stroke.color,
                        lastPoint: lastPoint,
                        isConnected: isConnected,
                        timestamp: point.timestamp
                    });
                });
            });

            // Send the updated canvas state to all clients
            io.to(room).emit('redoComplete', {
                strokeCount: rooms[room].strokes.length,
                undoneCount: rooms[room].undoneStrokes.length,
                drawings: rooms[room].drawings
            });

            console.log(`↪️  Redo in ${room}: Restored stroke with ${redoneStroke.points.length} points. ${rooms[room].strokes.length} strokes active, ${rooms[room].undoneStrokes.length} available for redo.`);
        } else {
            console.log(`❌ Cannot redo in ${room}: No undone strokes available`);
        }
    });

    // Handle canvas state requests (for when users join or need to refresh)
    socket.on('requestCanvasState', (room) => {
        if (rooms[room] && rooms[room].drawings) {
            console.log(`🎨 Sending canvas state for room ${room} to ${socket.id} (${rooms[room].drawings.length} drawings)`);
            socket.emit('loadCanvas', rooms[room].drawings);
        }
    });

    // Clear canvas functionality
    socket.on('clearCanvas', (room) => {
        if (rooms[room]) {
            rooms[room].drawings = [];
            rooms[room].strokes = [];
            rooms[room].undoneStrokes = [];
            rooms[room].currentStroke = null;
            rooms[room].lastActivity = Date.now(); // Update activity
            roomLastActivity[room] = Date.now(); // Update activity
            io.to(room).emit('clearCanvas');
            console.log(`🧹 Canvas cleared in room: ${room}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));