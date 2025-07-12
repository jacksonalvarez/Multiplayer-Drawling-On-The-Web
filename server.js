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

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    socket.on('joinRoom', (room) => {
        if (!rooms[room]) {
            rooms[room] = [];
        }
        socket.join(room);
        socket.emit('loadCanvas', rooms[room]);
        io.emit('updateRooms', Object.keys(rooms));
        console.log(`Joined room: ${room}`);
    });

    socket.on('draw', ({ x, y, room }) => {
        if (rooms[room]) {
            rooms[room].push({ x, y });
            io.to(room).emit('draw', { x, y });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));