const express = require('express');
const app = express();
const path = require('path');
var server = require('http').createServer(app);
var io = require('socket.io')(server, {
  cors: {
    origin: '*',
    allowedHeaders: '*',
  },
  pingInterval: 1000,
  pintTimeout: 3000,
});

const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
var config = require('./config');

   
const c_users = [];

const {SessionStore} = require('./session')

require('dotenv').config()

/** MIDDLEWARE **/
const { instrument } = require("@socket.io/admin-ui");
instrument(io, {
    auth: false
  });
  
// Routing
app.use(express.static(path.join(__dirname, 'public')));

/** SOCKET CONFIGURATIONS */
const pubClient = createClient({ host: config.REDIS_ENDPOINT, port: config.REDIS_PORT});
const subClient = pubClient.duplicate();

const session = new SessionStore(pubClient)
io.adapter(createAdapter(pubClient, subClient));

let numUsers = 0;

io.on('connection', (socket) => {
  let addedUser = false;

  // when the client emits 'new message', this listens and executes
  socket.on('chat', (payload) => {
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

  // when the client emits 'add user', this listens and executes
  socket.on("joinRoom", ({ username, roomname }) => {
    // we store the username in the socket session for this client
    socket.username = username;
    ++numUsers;
    addedUser = true;

    session.insertUser(socket.id, {username: socket.username
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
      --numUsers;

      const p_user = user_Disconnect(socket.id);

      if (p_user) {
        io.to(p_user.room).emit("message", {
          userId: p_user.id,
          username: p_user.username,
          payload: { text: `${p_user.username} has left the chat` },
        });
      }

      session.removeUser(socket.id)
      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
  });
});

server.listen(config.PORT, () => {
    console.log('Server listening at port %d', config.PORT);
});

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