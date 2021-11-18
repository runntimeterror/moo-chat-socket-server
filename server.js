require('dotenv').config()
var config = require('./config');
const express = require('express');
const app = express();
const path = require('path');
var server = require('http').createServer(app);
const { createAdapter } = require("@socket.io/redis-adapter");
const { instrument } = require("@socket.io/admin-ui");
const { createClient } = require("redis");
var io = require('socket.io')(server, {
  cors: {
    origin: '*',
    allowedHeaders: '*',
    methods: ["GET", "POST"]
  }
});
const { RedisStore } = require('./session');
const crypto = require("crypto");
const { REDIS_ENDPOINT } = require('./config');
const pubClient = createClient({ host: config.REDIS_ENDPOINT, port: config.REDIS_PORT });
const subClient = pubClient.duplicate();
const session = new RedisStore(pubClient)
const randomId = () => crypto.randomBytes(8).toString("hex");

/** MIDDLEWARE **/
app.use(express.static(path.join(__dirname, 'public')));

instrument(io, {
  auth: false
});
io.adapter(createAdapter(pubClient, subClient));

io.use(async (socket, next) => {
  const userId = socket.handshake.auth.userId;
  const sessionID = socket.handshake.auth.sessionID;
  const username = socket.handshake.auth.username;

  console.log("\nMIDDLEWARE :::::: =>", "\nauth ", socket.handshake.auth,"\n")
  if (!userId) {
    const err = new Error("not authorized");
    console.error("Errror =>",err.message)
    return next(err);
  }


  if (sessionID) {
    const soredSession = await session.find(sessionID);

    console.log("Found Session =>", soredSession, "\n")
    if (soredSession) {
      socket.sessionID = sessionID;
      socket.userId = soredSession.userId;
      socket.username = soredSession.username;
      socket.room = soredSession.room;
      return next();
    }
  }


  console.log("Setting Defaults")
  socket = setSocketDefaults(socket, userId, username)
  return next();
});

io.on('connection', (socket) => {
  console.log("\nCONNECTION :::::: =>", "\nauth ", socket.handshake.auth, "\nsessionID =>", `${socket.sessionID}`, "\nusername", `${socket.username}`, "\nuserid", `${socket.userId}`, "\nroom ", `${socket.room}`)

  socket.use(async (packet, next) => {
    const userId = socket.handshake.auth.userId;
    const sessionID = socket.handshake.auth.sessionID;
    const username = socket.handshake.auth.username;

    console.log("\nMIDDLEWARE :::::: =>", "\nauth ", socket.handshake.auth, "\n")
    if (!userId) {
      const err = new Error("not authorized");
      console.error("Errror =>", err.message)
      return next(err);
    }


    if (sessionID) {
      const soredSession = await session.find(sessionID);

      console.log("Found Session =>", soredSession, "\n")
      if (soredSession) {
        socket.sessionID = sessionID;
        socket.userId = soredSession.userId;
        socket.username = soredSession.username;
        socket.room = soredSession.room;
        return next();
      }
    }


    console.log("Setting Defaults")
    socket = setSocketDefaults(socket, userId, username)

    next();
  });

  session.save(socket.sessionID, {
    userId: socket.userId,
    username: socket.username,
    connected: true,
    room: socket.room
  });

  socket.emit("session", {
    sessionID: socket.sessionID,
    userId: socket.userId,
  });

  socket.on("joinRoom", ({ username, roomname }) => {
    console.log("\nJOIN ROOM :::::: =>", "\nauth ", socket.handshake.auth, "\nsessionID =>", `${socket.sessionID}`, "\nusername", `${socket.username}`, "\nuserid", `${socket.userId}`, "\nroom ", `${roomname}`)

    session.save(socket.sessionID, {
      userId: socket.userId,
      username: socket.username,
      connected: true,
      room: roomname
    });

    socket.join(roomname);

    socket.emit("message", {
      userId: socket.userId,
      username: socket.username,
      payload: { text: `Welcome ${socket.username}` },
    });

    socket.broadcast.to(roomname).emit("message", {
      userId: socket.userId,
      username: socket.username,
      payload: { text: `${socket.username} has joined the chat` },
    });

  });

  socket.on('chat', (payload) => {
    console.log("\nCHAT  :::::: =>", "\nauth ", socket.handshake.auth, "\npayload", payload, "\nsessionID =>", `${socket.sessionID}`, "\nusername", `${socket.username}`, "\nuserid", `${socket.userId}`, "\nroom ", `${socket.room}`)
    //gets the room user and the message sent
    // const p_user = get_Current_User(socket.id);
    try {
      io.to(socket.room).emit("message", {
        userId: socket.userId,
        username: socket.username,
        payload
      });
    }
    catch (ex) {
      console.error(ex)
    }
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', () => {
    console.log("\nDISCONNECT :::::: =>", "\nauth ", socket.handshake.auth, "\nsessionID =>", `${socket.sessionID}`, "\nusername", `${socket.username}`, "\nuserid", `${socket.userId}`, "\nroom ", `${socket.room}`)

    // const p_user = user_Disconnect(socket.id);

    if (socket.userId) {
      io.to(socket.room).emit("message", {
        userId: socket.userId,
        username: socket.username,
        payload: { text: `${socket.username} has left the chat` },
      });
    }

    session.save(socket.sessionID, {
      userId: socket.userId,
      username: socket.username,
      connected: false,
      room: ""
    });
    // echo globally that this client has left
    socket.broadcast.emit('user left', {
      username: socket.username
    });
  });
});

server.listen(config.PORT, () => {
  console.log('Server listening at port %d', config.PORT);
  console.log(`REDIS Endpoint: ${REDIS_ENDPOINT}`);
});

const setSocketDefaults = function (socket, userId, username) {
  socket.sessionID = randomId();
  socket.userId = userId;
  socket.username = username;
  socket.room = ""
  return socket
}
