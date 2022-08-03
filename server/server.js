const express = require('express');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const twilio = require('twilio');

const PORT = process.env.PORT || 5002;

const app = express();

const server = http.createServer(app);

app.use(cors());

let connectedUsers = [];
let rooms = [];

//create route to check if room exists
app.get('/api/room-exists/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.find((room) => room.id === roomId);

  if (room) {
    //send response that room exists
    if (room.connectedUsers.length > 3) {
      return res.send({ roomExists: true, full: true });
    } else {
      return res.send({ roomExists: true, full: false });
    }
  } else {
    //send response that room does not exists
    return res.send({ roomExists: false });
  }
});

const io = require('socket.io')(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`유저연결 ${socket.id}`);

  socket.on('create-new-room', (data) => {
    createNewRoomHandler(data, socket);
  });

  socket.on('join-room', (data) => {
    joinRoomHandler(data, socket);
  });
});

//socket.io handlers
const createNewRoomHandler = (data, socket) => {
  console.log('방장이 새롭게 만든 방');
  console.log('data', data);

  const { identity } = data;

  const roomId = uuidv4();

  const newUser = {
    identity,
    id: uuidv4(),
    socketId: socket.id,
    roomId,
  };

  //push that user to connectedUsers
  connectedUsers = [...connectedUsers, newUser];

  const newRoom = {
    id: roomId,
    connectedUsers: [newUser],
  };

  //join socket.io room
  socket.join(roomId);

  rooms = [...rooms, newRoom];

  //해당 방 roomId를 생성한 클라이언트에게 방출
  socket.emit('room-id', { roomId });

  //연결된 모든 사용자에게 이벤트 발생
  //이 방에 있는 새로운 사용자에 대해 그 방으로
  socket.emit('room-update', { connectedUsers: newRoom.connectedUsers });
};

const joinRoomHandler = (data, socket) => {
  const { identity, roomId } = data;

  const newUser = {
    identity,
    id: uuidv4(),
    socketId: socket.id,
    roomId,
  };

  //join room as user which just is trying to join room passing room id
  console.log(
    '머',
    rooms.find((room) => room.id === roomId)
  );
  const room = rooms.find((room) => room.id === roomId);

  room.connectedUsers = [...room.connectedUsers, newUser];

  //join socket.io room
  socket.join(roomId);

  //add new user to connected users array
  connectedUsers = [...connectedUsers, newUser];

  io.to(roomId).emit('room-update', { connectedUsers: room.connectedUsers });
};

server.listen(PORT, () => {
  console.log(`Server is listening on ${PORT}`);
});
