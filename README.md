# PixelDraw - Collaborative Drawing Canvas

🎨 **Real-time multiplayer drawing application with advanced brush system and undo/redo functionality.**

![Demo](https://img.shields.io/badge/Status-Live-brightgreen)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.0+-blue)

## ✨ Features

- **Real-time Collaboration**: Draw with multiple users simultaneously
- **Advanced Brush System**: 5 unique brush types with customizable settings
  - 🟩 Square Brush - Classic pixel art style
  - ⚪ Circle Brush - Smooth round strokes
  - 🌟 Spray Brush - Scattered dot effects
  - ✨ Neon Brush - Glowing cyberpunk effects
  - 🗑️ Eraser - Remove content precisely
- **Undo/Redo System**: Complete stroke-based history (up to 10 actions)
- **Room Management**: Create public or password-protected rooms
- **Auto-cleanup**: Rooms expire after 3 days of inactivity
- **Responsive Design**: Works on desktop and mobile devices
- **Cyberpunk Aesthetic**: Custom font and glowing effects

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- NPM or Yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jacksonalvarez/pixeldraw.git
   cd pixeldraw
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   # or
   node server.js
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

## Deployment on DigitalOcean

To host this application for free on DigitalOcean, follow these steps:

1. **Create a DigitalOcean Account**: Sign up for a DigitalOcean account if you don't have one. You can use a referral link to get some free credits.

2. **Create a Droplet**:
   - Go to the DigitalOcean dashboard and create a new Droplet.
   - Choose the "Marketplace" tab and select the "Node.js" one-click app.
   - Choose the cheapest plan (usually $5/month) which can be free with credits.
   - Select a data center region close to you.
   - Add your SSH key for secure access.
   - Create the Droplet.

3. **Deploy the App**:
   - SSH into your Droplet using the terminal: `ssh root@your_droplet_ip`
   - Install Git if not already installed: `apt update && apt install git`
   - Clone your repository: `git clone your_repo_url`
   - Navigate into your project directory: `cd your_project_directory`
   - Install dependencies: `npm install`
   - Start the server: `npm start`

4. **Access the App**:
   - Open your browser and go to `http://your_droplet_ip:3000` to see your app in action.

5. **Keep the App Running**:
   - Use a process manager like PM2 to keep your Node.js app running: `npm install -g pm2`
   - Start your app with PM2: `pm2 start server.js`

## Troubleshooting

- **Server Not Accessible**: If you cannot access the server from your browser, ensure the following:
  - The server is listening on all network interfaces by using `0.0.0.0` in the server listen method.
  - Your firewall settings on DigitalOcean allow traffic on port 3000. You can configure this in the "Networking" section of your Droplet settings.
  - Ensure that your client-side code is pointing to the correct IP address and port of your Droplet.

## Which IP to Use

- **IPv4 Address**: Use the public IPv4 address of your Droplet to connect from external networks. This is the address you should use in your client-side code and when accessing the app from a browser.
- **Private IP**: This is used for internal communication between Droplets in the same data center and is not accessible from the internet.
- **Reserved IP**: If you have set up a reserved IP, you can use it as a stable IP address that can be reassigned to different Droplets.

## How to Use

- Enter a room name and click "Create/Join Room" to start or join a drawing session.
- Draw on the canvas and see other players' drawings in real-time.
- View available rooms and join by clicking on them.
- When joining a room, see all previous drawings.
- **New Feature**: All available rooms are now displayed upon loading the page, allowing you to join any room immediately.

## Technologies Used

- HTML, CSS, JavaScript
- Node.js, Express, Socket.io