// Auto-detect if running locally or on production
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const serverUrl = isLocal ? 'http://localhost:3000' : 'http://157.230.212.21:3000';
const socket = io(serverUrl);
console.log('Connecting to:', serverUrl);
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let drawing = false;
let room = '';

// Brush system variables
let currentBrush = 'square';
let brushSize = 2;
let brushColor = '#00ff00';
let lastPoint = null;

// Undo system variables - simplified stroke-based
let strokeCount = 0;
let undoneStrokeCount = 0;
let maxUndoSteps = 10;
let currentlyDrawing = false; // Track if we're in the middle of a stroke

// Initialize canvas size
function initializeCanvas() {
    const canvasContainer = document.querySelector('.canvas-container');
    const rect = canvasContainer.getBoundingClientRect();
    const padding = 40;
    canvas.width = Math.max(rect.width - padding, 400);
    canvas.height = Math.max(rect.height - padding, 300);

    // Set default dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Initialize undo/redo system
function initializeUndoSystem() {
    // Initialize stroke counts and button states
    strokeCount = 0;
    undoneStrokeCount = 0;
    updateUndoRedoButtons();

    // Add undo button event listener after DOM is ready
    const undoButton = document.getElementById('undoButton');
    if (undoButton) {
        undoButton.addEventListener('click', undoLastAction);
        console.log('🔗 Undo button event listener attached');
    } else {
        console.error('❌ Undo button not found during initialization');
    }

    // Add redo button event listener after DOM is ready
    const redoButton = document.getElementById('redoButton');
    if (redoButton) {
        redoButton.addEventListener('click', redoLastAction);
        console.log('🔗 Redo button event listener attached');
    } else {
        console.error('❌ Redo button not found during initialization');
    }
}

// Initialize canvas when page loads
window.addEventListener('load', initializeCanvas);
window.addEventListener('load', initializeUndoSystem);
window.addEventListener('resize', () => {
    setTimeout(resizeCanvas, 100);
});

function createRoom() {
    const roomInput = document.getElementById('roomInput');
    const passwordInput = document.getElementById('passwordInput');
    const roomName = roomInput.value.trim();
    const password = passwordInput.value;

    if (roomName) {
        console.log('Creating room:', roomName, password ? 'with password' : 'public');
        socket.emit('createRoom', { room: roomName, password: password });
        room = roomName;
    } else {
        showNotification('Please enter a room name', 'error');
        roomInput.focus();
    }
}

function joinRoom() {
    const roomInput = document.getElementById('roomInput');
    const passwordInput = document.getElementById('passwordInput');
    const roomName = roomInput.value.trim();
    const password = passwordInput.value;

    if (roomName) {
        console.log('Joining room:', roomName);
        socket.emit('joinRoom', { room: roomName, password: password });
        room = roomName;
    } else {
        showNotification('Please enter a room name', 'error');
        roomInput.focus();
    }
}

function createOrJoinRoom() {
    // Backward compatibility - defaults to join
    joinRoom();
}

canvas.addEventListener('mousedown', (e) => {
    drawing = true;
    currentlyDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPoint = { x, y };
    console.log(`🎨 Stroke started at (${x}, ${y})`);

    // Notify server that a new stroke is starting
    socket.emit('strokeStart', {
        room,
        brush: currentBrush,
        size: brushSize,
        color: brushColor,
        startPoint: { x, y }
    });
});

canvas.addEventListener('mouseup', () => {
    if (drawing && currentlyDrawing) {
        // Only count as one stroke when the entire mouse down→up sequence completes
        strokeCount++;
        undoneStrokeCount = 0; // Clear redo history when new stroke is made
        currentlyDrawing = false;
        console.log(`✏️ Stroke completed: strokeCount=${strokeCount}`);
        updateUndoRedoButtons();

        // Notify other users that stroke is complete
        socket.emit('strokeEnd', { room });
    }
    drawing = false;
    lastPoint = null;
});

canvas.addEventListener('mousemove', draw);

function draw(event) {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Store current context settings
    const originalStrokeStyle = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;
    const originalFillStyle = ctx.fillStyle;
    const originalCompositeOperation = ctx.globalCompositeOperation;

    // Draw locally first with LOCAL user's brush settings
    if ((currentBrush === 'circle' || currentBrush === 'eraser' || currentBrush === 'spray' || currentBrush === 'neon') && lastPoint) {
        // For continuous brushes, draw connected strokes
        if (currentBrush === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
        }

        if (currentBrush === 'spray') {
            // Spray brush - create scattered dots along the path
            drawSprayStroke(lastPoint.x, lastPoint.y, x, y, brushSize, brushColor);
        } else if (currentBrush === 'neon') {
            // Neon brush - glowing connected strokes
            drawNeonStroke(lastPoint.x, lastPoint.y, x, y, brushSize, brushColor);
        } else {
            // Regular connected strokes for circle and eraser
            ctx.strokeStyle = currentBrush === 'eraser' ? '#000000' : brushColor;
            ctx.lineWidth = brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(lastPoint.x, lastPoint.y);
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    } else {
        // For square brush or first point of continuous brushes
        drawOnCanvas(x, y, currentBrush, brushSize, brushColor);
    }

    // Restore context settings
    ctx.strokeStyle = originalStrokeStyle;
    ctx.lineWidth = originalLineWidth;
    ctx.fillStyle = originalFillStyle;
    ctx.globalCompositeOperation = originalCompositeOperation;

    // Send drawing data with brush info
    socket.emit('draw', {
        x,
        y,
        room,
        brush: currentBrush,
        size: brushSize,
        color: brushColor,
        lastPoint: lastPoint,
        isConnected: (currentBrush === 'circle' || currentBrush === 'eraser' || currentBrush === 'spray' || currentBrush === 'neon') && lastPoint && drawing
    });

    // Update last point for line drawing
    lastPoint = { x, y };
}

function drawOnCanvas(x, y, brush = 'square', size = 2, color = '#00ff00') {
    // Store current context settings to restore later
    const originalStrokeStyle = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;
    const originalFillStyle = ctx.fillStyle;
    const originalCompositeOperation = ctx.globalCompositeOperation;

    // Apply the specific brush settings (could be from another user)
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    if (brush === 'square') {
        const halfSize = size / 2;
        ctx.fillRect(x - halfSize, y - halfSize, size, size);
    } else if (brush === 'circle') {
        // Circle brush - smooth circular strokes
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, 2 * Math.PI);
        ctx.fill();
    } else if (brush === 'spray') {
        // Spray brush - scattered dots
        drawSprayDots(x, y, size, color);
    } else if (brush === 'neon') {
        // Neon brush - glowing circle
        drawNeonDot(x, y, size, color);
    } else if (brush === 'eraser') {
        // Eraser - removes content
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, 2 * Math.PI);
        ctx.fill();
    }

    // Restore original context settings
    ctx.strokeStyle = originalStrokeStyle;
    ctx.lineWidth = originalLineWidth;
    ctx.fillStyle = originalFillStyle;
    ctx.globalCompositeOperation = originalCompositeOperation;
}

socket.on('draw', (data) => {
    // Store current context settings to preserve local user's brush
    const originalStrokeStyle = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;
    const originalFillStyle = ctx.fillStyle;
    const originalCompositeOperation = ctx.globalCompositeOperation;

    // Handle both old format (just x, y) and new format (with brush data)
    if (data.brush) {
        const { x, y, brush, size, color, lastPoint, isConnected } = data;

        if ((brush === 'circle' || brush === 'eraser' || brush === 'spray' || brush === 'neon') && isConnected && lastPoint) {
            // Draw connected stroke from last point to current point using OTHER USER'S settings
            if (brush === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = '#000000';  // Color doesn't matter for eraser
                ctx.lineWidth = size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(x, y);
                ctx.stroke();
            } else if (brush === 'spray') {
                // Spray brush connected stroke
                drawSprayStroke(lastPoint.x, lastPoint.y, x, y, size, color);
            } else if (brush === 'neon') {
                // Neon brush connected stroke
                drawNeonStroke(lastPoint.x, lastPoint.y, x, y, size, color);
            } else {
                // Circle brush connected stroke
                ctx.strokeStyle = color;
                ctx.lineWidth = size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
        } else {
            // Draw single point or start of stroke using OTHER USER'S settings
            drawOnCanvas(x, y, brush, size, color);
        }
    } else {
        // Legacy format - use default settings
        drawOnCanvas(data.x, data.y);
    }

    // Restore original context settings for local user
    ctx.strokeStyle = originalStrokeStyle;
    ctx.lineWidth = originalLineWidth;
    ctx.fillStyle = originalFillStyle;
    ctx.globalCompositeOperation = originalCompositeOperation;
});

socket.on('clearCanvas', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Set dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Reset stroke count when canvas is cleared
    resetStrokeCount();
});

socket.on('updateRooms', (rooms) => {
    console.log('Received rooms update:', rooms, 'Length:', rooms.length, 'Type:', typeof rooms, 'IsArray:', Array.isArray(rooms));
    const roomList = document.getElementById('roomList');
    if (!roomList) {
        console.error('roomList element not found');
        return;
    }
    roomList.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        const li = document.createElement('li');
        li.className = 'room-placeholder';
        li.textContent = 'No rooms available. Create one!';
        roomList.appendChild(li);
        console.log('No rooms available - showing placeholder');
    } else {
        rooms.forEach(roomInfo => {
            const li = document.createElement('li');
            li.className = 'room-item';

            // Handle both old format (string) and new format (object)
            const roomName = typeof roomInfo === 'string' ? roomInfo : roomInfo.name;
            const hasPassword = typeof roomInfo === 'object' ? roomInfo.hasPassword : false;

            if (hasPassword) {
                li.classList.add('locked');
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'room-name';
            nameSpan.textContent = roomName;

            const statusSpan = document.createElement('span');
            statusSpan.className = 'room-status';
            statusSpan.textContent = hasPassword ? '🔒' : '';

            li.appendChild(nameSpan);
            li.appendChild(statusSpan);

            li.onclick = () => {
                document.getElementById('roomInput').value = roomName;
                if (hasPassword) {
                    showPasswordModal(roomName);
                } else {
                    document.getElementById('passwordInput').value = '';
                    joinRoom();
                }
            };
            roomList.appendChild(li);
        });
        console.log('Updated room list with', rooms.length, 'rooms');
    }
});

socket.on('loadCanvas', (drawings) => {
    // Clear canvas and set dark background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let strokeCounter = 0;
    let lastWasStrokeStart = false;

    drawings.forEach((drawing, index) => {
        // Handle both old format (just x, y) and new format (with brush data)
        if (drawing.brush) {
            const { x, y, brush, size, color, lastPoint, isConnected } = drawing;

            // Store current context settings
            const originalStrokeStyle = ctx.strokeStyle;
            const originalLineWidth = ctx.lineWidth;
            const originalFillStyle = ctx.fillStyle;
            const originalCompositeOperation = ctx.globalCompositeOperation;

            // Draw using proper brush handling
            if ((brush === 'circle' || brush === 'eraser' || brush === 'spray' || brush === 'neon') && isConnected && lastPoint) {
                // Connected stroke - use proper brush rendering
                if (brush === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = size;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                } else if (brush === 'spray') {
                    drawSprayStroke(lastPoint.x, lastPoint.y, x, y, size, color);
                } else if (brush === 'neon') {
                    drawNeonStroke(lastPoint.x, lastPoint.y, x, y, size, color);
                } else if (brush === 'circle') {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = size;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }
            } else {
                // Single point or start of stroke - use drawOnCanvas with proper brush
                drawOnCanvas(x, y, brush, size, color);
            }

            // Restore context settings
            ctx.strokeStyle = originalStrokeStyle;
            ctx.lineWidth = originalLineWidth;
            ctx.fillStyle = originalFillStyle;
            ctx.globalCompositeOperation = originalCompositeOperation;

            // Count complete strokes: increment when starting a new stroke
            const isStrokeStart = !isConnected || !lastPoint;
            if (isStrokeStart) {
                strokeCounter++;
            }
        } else {
            // Legacy format - use default settings
            drawOnCanvas(drawing.x, drawing.y);
            strokeCounter++; // Legacy format - count each as a stroke
        }
    });

    // Update stroke count and undo button
    strokeCount = strokeCounter;
    updateUndoRedoButtons();
    console.log(`📊 Loaded canvas with ${strokeCount} strokes from ${drawings.length} drawing points`);
});

// Handle room join/create responses
socket.on('joinSuccess', (roomName) => {
    console.log('Successfully joined room:', roomName);
    updateCurrentRoom(roomName);
    showNotification(`Successfully joined room: ${roomName}`, 'success');
});

socket.on('joinError', (message) => {
    console.log('Failed to join room:', message);
    showNotification(`Failed to join room: ${message}`, 'error');
});

socket.on('createSuccess', (roomName) => {
    console.log('Successfully created room:', roomName);
    updateCurrentRoom(roomName);
    showNotification(`Successfully created room: ${roomName}`, 'success');
});

socket.on('createError', (message) => {
    console.log('Failed to create room:', message);
    showNotification(`Failed to create room: ${message}`, 'error');
});

// Stroke-based undo/redo system functions
let undoInProgress = false;
let redoInProgress = false;

function undoLastAction() {
    console.log(`🔙 Undo requested: strokeCount=${strokeCount}, room=${room}`);
    if (undoInProgress) {
        console.log('❌ Undo already in progress, ignoring request');
        return;
    }

    if (strokeCount > 0) {
        undoInProgress = true;
        // Request undo from server
        socket.emit('undo', { room: room });
        console.log('📤 Undo request sent to server');

        // Timeout to reset progress flag if server doesn't respond
        setTimeout(() => {
            if (undoInProgress) {
                undoInProgress = false;
                console.log('⏰ Undo timeout - resetting progress flag');
            }
        }, 5000);
    } else {
        console.log('❌ Cannot undo: no strokes available');
    }
}

function redoLastAction() {
    console.log(`🔄 Redo requested: undoneStrokeCount=${undoneStrokeCount}, room=${room}`);
    if (redoInProgress) {
        console.log('❌ Redo already in progress, ignoring request');
        return;
    }

    if (undoneStrokeCount > 0) {
        redoInProgress = true;
        // Request redo from server
        socket.emit('redo', { room: room });
        console.log('📤 Redo request sent to server');

        // Timeout to reset progress flag if server doesn't respond
        setTimeout(() => {
            if (redoInProgress) {
                redoInProgress = false;
                console.log('⏰ Redo timeout - resetting progress flag');
            }
        }, 5000);
    } else {
        console.log('❌ Cannot redo: no undone strokes available');
    }
}

function updateUndoRedoButtons() {
    const undoButton = document.getElementById('undoButton');
    const redoButton = document.getElementById('redoButton');

    if (undoButton) {
        const shouldDisableUndo = strokeCount === 0;
        undoButton.disabled = shouldDisableUndo;
        console.log(`🔄 Undo button updated: strokeCount=${strokeCount}, disabled=${shouldDisableUndo}`);
    } else {
        console.error('❌ Undo button not found in updateUndoRedoButtons');
    }

    if (redoButton) {
        const shouldDisableRedo = undoneStrokeCount === 0;
        redoButton.disabled = shouldDisableRedo;
        console.log(`🔄 Redo button updated: undoneStrokeCount=${undoneStrokeCount}, disabled=${shouldDisableRedo}`);
    } else {
        console.error('❌ Redo button not found in updateUndoRedoButtons');
    }
}

// Legacy function for backward compatibility
function updateUndoButton() {
    updateUndoRedoButtons();
}

function resetStrokeCount() {
    strokeCount = 0;
    undoneStrokeCount = 0;
    updateUndoRedoButtons();
}

// UI Helper Functions
function updateCurrentRoom(roomName) {
    const currentRoomElement = document.getElementById('currentRoomName');
    if (currentRoomElement) {
        currentRoomElement.textContent = roomName || 'None';
    }
}

function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connectionIndicator');
    const text = document.getElementById('connectionText');

    if (indicator && text) {
        if (connected) {
            indicator.classList.remove('disconnected');
            text.textContent = 'Connected';
        } else {
            indicator.classList.add('disconnected');
            text.textContent = 'Disconnected';
        }
    }
}

function showNotification(message, type = 'info') {
    // Create a simple notification - you can enhance this further
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--secondary)' : 'var(--primary)'};
        color: white;
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Password Modal Functions
let currentRoomForPassword = '';

function showPasswordModal(roomName) {
    currentRoomForPassword = roomName;
    const modal = document.getElementById('passwordModal');
    const input = document.getElementById('modalPasswordInput');

    modal.style.display = 'flex';
    input.value = '';
    input.focus();

    // Allow Enter key to submit
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            submitPassword();
        } else if (e.key === 'Escape') {
            closePasswordModal();
        }
    };
}

function closePasswordModal() {
    const modal = document.getElementById('passwordModal');
    const modalContent = modal.querySelector('.modal');

    // Add exit animation
    modalContent.style.animation = 'modalExit 0.3s ease forwards';
    modal.style.animation = 'fadeOutOverlay 0.3s ease forwards';

    setTimeout(() => {
        modal.style.display = 'none';
        modalContent.style.animation = '';
        modal.style.animation = '';
        currentRoomForPassword = '';
    }, 300);
}

function submitPassword() {
    const input = document.getElementById('modalPasswordInput');
    const password = input.value.trim();

    if (password) {
        document.getElementById('passwordInput').value = password;
        closePasswordModal();
        joinRoom();
    } else {
        showNotification('Please enter a password', 'error');
        input.focus();
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('passwordModal');
    if (e.target === modal) {
        closePasswordModal();
    }
});

// Request the list of rooms when the client connects
socket.on('connect', () => {
    console.log('Connected to server');
    updateConnectionStatus(true);
    // Add a larger delay to ensure server is ready
    setTimeout(() => {
        console.log('Requesting rooms...');
        socket.emit('requestRooms');
    }, 500);
});

// Also add error handling
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    updateConnectionStatus(false);
    showNotification('Connection error', 'error');
});

// Add a retry mechanism
socket.on('disconnect', () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);
    updateCurrentRoom('');
    showNotification('Disconnected from server', 'error');
});

// Add this to also request rooms when the page loads
window.addEventListener('load', () => {
    console.log('Page loaded, waiting for socket connection...');

    // Check if roomList element exists
    const roomListElement = document.getElementById('roomList');
    console.log('roomList element found:', !!roomListElement, roomListElement);

    // If already connected, request rooms immediately
    if (socket.connected) {
        console.log('Socket already connected, requesting rooms...');
        socket.emit('requestRooms');
    }
    // Also try requesting rooms periodically until we get some
    const roomRequestInterval = setInterval(() => {
        if (socket.connected) {
            console.log('Requesting rooms (periodic check)...');
            socket.emit('requestRooms');
            // Stop requesting after we get rooms or after 10 attempts
            const roomList = document.getElementById('roomList');
            if (roomList && roomList.children.length > 0) {
                clearInterval(roomRequestInterval);
            }
        }
    }, 1000);

    // Stop trying after 10 seconds
    setTimeout(() => {
        clearInterval(roomRequestInterval);
        console.log('Stopped periodic room requests');
    }, 10000);
});

// Sidebar toggle functionality
let sidebarCollapsed = false;

function toggleSidebar() {
    const container = document.querySelector('.container');
    const sidebar = document.querySelector('.sidebar');
    const toggleIcon = document.getElementById('toggleIcon');

    console.log('toggleSidebar called, current state:', sidebarCollapsed);

    sidebarCollapsed = !sidebarCollapsed;

    if (sidebarCollapsed) {
        sidebar.classList.add('collapsed');
        toggleIcon.textContent = '▶';
        toggleIcon.setAttribute('aria-label', 'Show sidebar');
        console.log('Sidebar collapsed');
    } else {
        sidebar.classList.remove('collapsed');
        toggleIcon.textContent = '◀';
        toggleIcon.setAttribute('aria-label', 'Hide sidebar');
        console.log('Sidebar expanded');
    }
}

function resizeCanvas() {
    const container = document.querySelector('.container');
    const canvasContainer = document.querySelector('.canvas-container');
    const rect = canvasContainer.getBoundingClientRect();

    // Save current canvas content with transparency
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    // Calculate new canvas size based on available space
    const padding = 40;
    const newWidth = rect.width - padding;
    const newHeight = rect.height - padding;

    // Only resize if dimensions actually changed
    if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;

        // Set dark background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Restore the saved content using drawImage
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(tempCanvas, 0, 0);
    }
}



// Tools toggle functionality
let toolsCollapsed = false;

function toggleTools() {
    const container = document.querySelector('.container');
    const tools = document.querySelector('.brush-tools');
    const toggleIcon = document.getElementById('toolsToggleIcon');

    console.log('toggleTools called, current state:', toolsCollapsed);

    toolsCollapsed = !toolsCollapsed;

    if (toolsCollapsed) {
        tools.classList.add('collapsed');
        toggleIcon.textContent = '◀';
        toggleIcon.setAttribute('aria-label', 'Show tools');
        console.log('Tools collapsed');
    } else {
        tools.classList.remove('collapsed');
        toggleIcon.textContent = '▶';
        toggleIcon.setAttribute('aria-label', 'Hide tools');
        console.log('Tools expanded');
    }
}

// Keyboard shortcuts for sidebar and tools toggle
document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        toggleTools();
    }
});

// Brush tool functions
function selectBrush(brushType) {
    currentBrush = brushType;

    // Update UI
    document.querySelectorAll('.brush-option').forEach(option => {
        option.classList.remove('active');
    });
    document.querySelector(`[data-brush="${brushType}"]`).classList.add('active');

    console.log('Selected brush:', brushType);
}

function updateBrushSize(size) {
    brushSize = parseInt(size);
    document.getElementById('brushSizeValue').textContent = size + 'px';
    console.log('Brush size:', brushSize);
}

function selectColor(color) {
    brushColor = color;

    // Update UI
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('active');
    });
    document.querySelector(`[data-color="${color}"]`).classList.add('active');

    console.log('Selected color:', color);
}

// Specialized brush functions
function drawSprayDots(x, y, size, color) {
    const density = Math.min(size * 2, 20); // More dots for larger brush
    const radius = size / 2;

    ctx.fillStyle = color;

    for (let i = 0; i < density; i++) {
        // Random position within brush radius
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * radius;
        const dotX = x + Math.cos(angle) * distance;
        const dotY = y + Math.sin(angle) * distance;

        // Random dot size (smaller dots)
        const dotSize = Math.random() * 2 + 1;

        ctx.beginPath();
        ctx.arc(dotX, dotY, dotSize / 2, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function drawSprayStroke(x1, y1, x2, y2, size, color) {
    // Draw spray dots along the stroke path
    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const steps = Math.max(distance / 5, 1); // More steps for longer strokes

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        drawSprayDots(x, y, size, color);
    }
}

function drawNeonDot(x, y, size, color) {
    // Create glow effect with multiple layers
    const originalCompositeOperation = ctx.globalCompositeOperation;

    // Outer glow
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = size;
    ctx.beginPath();
    ctx.arc(x, y, size / 4, 0, 2 * Math.PI);
    ctx.fill();

    // Inner bright core
    ctx.shadowBlur = size / 2;
    ctx.beginPath();
    ctx.arc(x, y, size / 6, 0, 2 * Math.PI);
    ctx.fill();

    // Reset shadow
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = originalCompositeOperation;
}

function drawNeonStroke(x1, y1, x2, y2, size, color) {
    const originalCompositeOperation = ctx.globalCompositeOperation;

    // Outer glow stroke
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = size;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Inner bright core
    ctx.shadowBlur = size / 2;
    ctx.lineWidth = size / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Reset
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = originalCompositeOperation;
}

// Handle stroke start from other users
socket.on('strokeStart', (data) => {
    console.log(`👥 Other user started stroke: ${data.brush} brush`);
});

// Handle stroke end from other users
socket.on('strokeEnd', () => {
    // Increment stroke count when another user completes a stroke
    strokeCount++;
    undoneStrokeCount = 0; // Clear redo when new stroke is made
    updateUndoRedoButtons();
    console.log(`👥 Other user completed stroke: strokeCount=${strokeCount}`);
});

// Handle undo completion from server
socket.on('undoComplete', (data) => {
    console.log('🔙 Undo response received from server:', data);
    undoInProgress = false; // Reset the progress flag

    // Clear canvas and set dark background first
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Redraw all remaining drawings with proper brush handling
    if (data.drawings && data.drawings.length > 0) {
        data.drawings.forEach(drawing => {
            const { x, y, brush, size, color, lastPoint, isConnected } = drawing;

            // Store current context settings
            const originalStrokeStyle = ctx.strokeStyle;
            const originalLineWidth = ctx.lineWidth;
            const originalFillStyle = ctx.fillStyle;
            const originalCompositeOperation = ctx.globalCompositeOperation;

            // Draw using the stored drawing data with proper brush handling
            if ((brush === 'circle' || brush === 'eraser' || brush === 'spray' || brush === 'neon') && isConnected && lastPoint) {
                // Connected stroke - use proper brush rendering
                if (brush === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = size;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                } else if (brush === 'spray') {
                    drawSprayStroke(lastPoint.x, lastPoint.y, x, y, size, color);
                } else if (brush === 'neon') {
                    drawNeonStroke(lastPoint.x, lastPoint.y, x, y, size, color);
                } else if (brush === 'circle') {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = size;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }
            } else {
                // Single point or start of stroke - use drawOnCanvas with proper brush
                drawOnCanvas(x, y, brush, size, color);
            }

            // Restore context settings
            ctx.strokeStyle = originalStrokeStyle;
            ctx.lineWidth = originalLineWidth;
            ctx.fillStyle = originalFillStyle;
            ctx.globalCompositeOperation = originalCompositeOperation;
        });
    }

    // Update stroke count and buttons
    strokeCount = data.strokeCount || 0;
    undoneStrokeCount = data.undoneCount || 0;
    updateUndoRedoButtons();

    console.log(`✅ Undo completed. ${strokeCount} strokes remaining, ${undoneStrokeCount} undone strokes available for redo.`);
});

// Handle redo completion from server
socket.on('redoComplete', (data) => {
    console.log('🔄 Redo response received from server:', data);
    redoInProgress = false; // Reset the progress flag

    // Clear current canvas and set dark background first
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Redraw all drawings with proper brush handling (same structure as undo)
    if (data.drawings && data.drawings.length > 0) {
        data.drawings.forEach(drawing => {
            const { x, y, brush, size, color, lastPoint, isConnected } = drawing;

            // Store current context settings
            const originalStrokeStyle = ctx.strokeStyle;
            const originalLineWidth = ctx.lineWidth;
            const originalFillStyle = ctx.fillStyle;
            const originalCompositeOperation = ctx.globalCompositeOperation;

            // Draw using the stored drawing data with proper brush handling
            if ((brush === 'circle' || brush === 'eraser' || brush === 'spray' || brush === 'neon') && isConnected && lastPoint) {
                // Connected stroke - use proper brush rendering
                if (brush === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = size;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                } else if (brush === 'spray') {
                    drawSprayStroke(lastPoint.x, lastPoint.y, x, y, size, color);
                } else if (brush === 'neon') {
                    drawNeonStroke(lastPoint.x, lastPoint.y, x, y, size, color);
                } else if (brush === 'circle') {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = size;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(lastPoint.x, lastPoint.y);
                    ctx.lineTo(x, y);
                    ctx.stroke();
                }
            } else {
                // Single point or start of stroke - use drawOnCanvas with proper brush
                drawOnCanvas(x, y, brush, size, color);
            }

            // Restore context settings
            ctx.strokeStyle = originalStrokeStyle;
            ctx.lineWidth = originalLineWidth;
            ctx.fillStyle = originalFillStyle;
            ctx.globalCompositeOperation = originalCompositeOperation;
        });
    }

    // Update stroke count and buttons
    strokeCount = data.strokeCount || 0;
    undoneStrokeCount = data.undoneCount || 0;
    updateUndoRedoButtons();

    console.log(`✅ Redo completed. ${strokeCount} strokes total, ${undoneStrokeCount} undone strokes remaining.`);
});

// Helper function to redraw a complete stroke from stroke data
function redrawStroke(stroke) {
    // Each stroke contains an array of drawing points
    if (!stroke.points || stroke.points.length === 0) return;

    stroke.points.forEach((point, index) => {
        const { x, y, brush, size, color, lastPoint, isConnected } = point;

        // Store current context settings
        const originalStrokeStyle = ctx.strokeStyle;
        const originalLineWidth = ctx.lineWidth;
        const originalFillStyle = ctx.fillStyle;
        const originalCompositeOperation = ctx.globalCompositeOperation;

        // Draw using the stored drawing data
        if (isConnected && lastPoint) {
            // Connected stroke
            if (brush === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(x, y);
                ctx.stroke();
            } else if (brush === 'spray') {
                drawSprayStroke(lastPoint.x, lastPoint.y, x, y, size, color);
            } else if (brush === 'neon') {
                drawNeonStroke(lastPoint.x, lastPoint.y, x, y, size, color);
            } else {
                ctx.strokeStyle = color;
                ctx.lineWidth = size;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
        } else {
            // Single point
            drawOnCanvas(x, y, brush, size, color);
        }

        // Restore context settings
        ctx.strokeStyle = originalStrokeStyle;
        ctx.lineWidth = originalLineWidth;
        ctx.fillStyle = originalFillStyle;
        ctx.globalCompositeOperation = originalCompositeOperation;
    });
}

// Canvas mouse event listeners