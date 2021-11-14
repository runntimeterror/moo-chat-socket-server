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
  },
  pingInterval: 1000,
  pintTimeout: 3000,
});
const { RedisStore } = require('./session');
const crypto = require("crypto");
const pubClient = createClient({ host: config.REDIS_ENDPOINT, port: config.REDIS_PORT });
const subClient = pubClient.duplicate();
const session = new RedisStore(pubClient)
const randomId = () => crypto.randomBytes(8).toString("hex");

/** MIDDLEWARE **/
app.use(express.static(path.join(__dirname, 'public')));
const sessionMiddleware = session({ secret: 'keyboard cat', cookie: { maxAge: 60000 }});
app.use(sessionMiddleware);

instrument(io, {
  auth: false
});
io.adapter(createAdapter(pubClient, subClient));

io.use(async (socket, next) => {
  console.log("MIDDLEWARE :::::: =>", "auth==> ", socket.handshake.auth)
  const sessionID = socket.handshake.auth.sessionID;

  if (sessionID) {
    const session = await session.find(sessionID);
    console.log("Found Session =>", session)
    if (session) {
      socket.sessionID = sessionID;
      socket.userId = session.userId;
      socket.username = session.username;
      return next();
    }
  }
  const username = socket.handshake.auth.username;
  const userId = socket.handshake.auth.userId;
  if (!userId) {
    return next(new Error("user not authenticated"));
  }
  socket.sessionID = randomId();
  socket.userId = userId;
  socket.username = username;
  next();
});

io.on('connection', (socket) => {
  console.log("CONNECTION :::::: =>", "auth==> ", socket.handshake.auth,"sessionID =>", socket.sessionID, "username= >", socket.username, "userid= >", socket.userId)

  session.save(socket.sessionID, {
    userId: socket.userId,
    username: socket.username,
    connected: true,
    room:""
  });

  socket.emit("session", {
    sessionID: socket.sessionID,
    userId: socket.userId,
  });

  socket.on("joinRoom", ({ username, roomname }) => {
    console.log("JOIN ROOM :::::: =>", "auth==> ", socket.handshake.auth,"sessionID =>", socket.sessionID, "username= >", socket.username, "userid= >", socket.userId)

    session.save(socket.sessionID, {
      userId: socket.userId,
      username: socket.username,
      connected: false,
      room: roomname
    });

    //* create user
    const p_user = join_User(socket.id, username, roomname);
    console.log(socket.id, "=id");
    socket.join(p_user.room);

    //display a welcome message to the user who have joined a room
    socket.emit("message", {
      userId: p_user.id,
      username: p_user.username,
      payload: { text: `Welcome ${p_user.username}` },
    });

    //displays a joined room message to all other room users except that particular user
    socket.broadcast.to(p_user.room).emit("message", {
      userId: p_user.id,
      username: p_user.username,
      payload: { text: `${p_user.username} has joined the chat` },
    });

  });

  socket.on('chat', (payload) => {
    console.log("CHAT  :::::: =>", "auth==> ", socket.handshake.auth,"sessionID =>", socket.sessionID, "username= >", socket.username, "userid= >", socket.userId)
    //gets the room user and the message sent
    const p_user = get_Current_User(socket.id);
    try {
      io.to(p_user.room).emit("message", {
        userId: p_user.id,
        username: p_user.username,
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
    console.log("DISCONNECT :::::: =>", "auth==> ", socket.handshake.auth,"sessionID =>", socket.sessionID, "username= >", socket.username, "userid= >", socket.userId)

    const p_user = user_Disconnect(socket.id);

    if (p_user) {
      io.to(p_user.room).emit("message", {
        userId: p_user.id,
        username: p_user.username,
        payload: { text: `${p_user.username} has left the chat` },
      });
    }

    session.save(socket.sessionID, {
      userId: socket.userId,
      username: socket.username,
      connected: false,
      room:""
    });
    // echo globally that this client has left
    socket.broadcast.emit('user left', {
      username: socket.username
    });
  });
});

server.listen(config.PORT, () => {
  console.log('Server listening at port %d', config.PORT);
});




/** TEMP CODE */

var c_users = [];
function join_User(id, username, room) {
  const p_user = { id, username, room };

  c_users.push(p_user);
  console.log(c_users, "users");

  return p_user;
}

// Gets a particular user id to return the current user
function get_Current_User(id) {
  return c_users.find((p_user) => p_user.id === id);
}

function user_Disconnect(id) {
  const index = c_users.findIndex((p_user) => p_user.id === id);

  if (index !== -1) {
    return c_users.splice(index, 1)[0];
  }
}