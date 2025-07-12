const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth - 40;
canvas.height = window.innerHeight - 200;

let drawing = false;
let room = '';

function createOrJoinRoom() {
    const roomInput = document.getElementById('roomInput');
    room = roomInput.value;
    if (room) {
        socket.emit('joinRoom', room);
    }
}

canvas.addEventListener('mousedown', () => drawing = true);
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mousemove', draw);

function draw(event) {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    drawOnCanvas(x, y);
    socket.emit('draw', { x, y, room });
}

function drawOnCanvas(x, y) {
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(x, y, 2, 2);
}

socket.on('draw', ({ x, y }) => {
    drawOnCanvas(x, y);
});

socket.on('clearCanvas', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

socket.on('updateRooms', (rooms) => {
    const roomList = document.getElementById('roomList');
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.textContent = room;
        li.onclick = () => {
            document.getElementById('roomInput').value = room;
            createOrJoinRoom();
        };
        roomList.appendChild(li);
    });
});

socket.on('loadCanvas', (drawings) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawings.forEach(({ x, y }) => {
        drawOnCanvas(x, y);
    });
});