# Anonymous Fishbowl — Cloudflare Edition

Real-time 2–8 player anonymous question game using Cloudflare Workers + Durable Objects.

The `public/` folder contains the browser game. `src/index.js` contains the Worker and Durable Object room server. `wrangler.json` configures the asset bundle and Durable Object.

Deployment can be done from Cloudflare Workers & Pages by importing this GitHub repository. Cloudflare Workers Builds can run `npx wrangler deploy` automatically.
