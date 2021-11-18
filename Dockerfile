FROM node:lts-alpine
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install pm2 -g
RUN npm install && mv node_modules ../
COPY . .
EXPOSE 8000
RUN chown -R node /usr/src/app
USER node
CMD pm2-runtime -r dotenv/config server.js
