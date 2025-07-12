# Multiplayer Drawing App

This is a simple multiplayer drawing app where players can create or join rooms with a shared canvas and draw together in real-time.

## Setup

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Start the server with `npm start`.
4. Open your browser and navigate to `http://localhost:3000`.

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

## How to Use

- Enter a room name and click "Create/Join Room" to start or join a drawing session.
- Draw on the canvas and see other players' drawings in real-time.
- View available rooms and join by clicking on them.
- When joining a room, see all previous drawings.

## Technologies Used

- HTML, CSS, JavaScript
- Node.js, Express, Socket.io