# Anonymous Fishbowl

A real-time 2–8 player browser game.

## Run locally
1. Install Node.js 18+.
2. Open this folder in a terminal.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

For friends on other devices, deploy the folder to a Node-compatible host that supports WebSockets. Share the resulting HTTPS URL.

## Included
- Room codes
- 2–8 players
- Unlimited questions
- Anonymous server-side authorship
- Random non-repeating question selection
- Fishbowl animation
- Yes / No / Other answers
- Anonymous results
- Host start/skip
- Basic moderation and spam-word blocking
- Reconnect attempt
- Dark/light mode
- Mobile responsive UI

## Privacy note
The server keeps the question author internally so the game can support future author-reveal/guess modes, but the current UI never sends or displays that author. For a production deployment, add authentication/rate limiting, stronger moderation, HTTPS/WSS, persistent storage if desired, and privacy/retention controls.
