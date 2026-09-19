# Zero-dependency server, so no build step and no npm install.
FROM node:20-alpine

WORKDIR /app

# Only what the server actually serves.
COPY server.js server-route.js scenarios.js package.json ./
COPY index.html styles.css app.js engine.js sim-source.js live-source.js speak.js ./

ENV NODE_ENV=production
# Railway/Render/Fly set PORT themselves; 3000 is the local default.
ENV PORT=3000
EXPOSE 3000

# Fails the deploy if the app stops responding.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
