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

  socket.on('disconnect', () => {
    disconnectHandler(socket);
  });

  socket.on('conn-signal', (data) => {
    signalingHandler(data, socket);
  });

  socket.on('conn-init', (data) => {
    initializeConnectionHandler(data, socket);
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
  const room = rooms.find((room) => room.id === roomId);

  room.connectedUsers = [...room.connectedUsers, newUser];

  //join socket.io room
  socket.join(roomId);

  //add new user to connected users array
  connectedUsers = [...connectedUsers, newUser];

  //peer 연결을 준비하기 위해 이미 이 방에 있는 모든 사용자에게 전송
  room.connectedUsers.forEach((user) => {
    if (user.socketId !== socket.id) {
      const data = {
        connUserSocketId: socket.id,
      };

      io.to(user.socketId).emit('conn-prepare', data);
    }
  });

  io.to(roomId).emit('room-update', { connectedUsers: room.connectedUsers });
};

const disconnectHandler = (socket) => {
  //find if user has been registered - if yes remove him from room and connected users array
  const user = connectedUsers.find((user) => user.socketId === socket.id);

  if (user) {
    //remove user
    const room = rooms.find((room) => room.id === user.roomId);

    room.connectedUsers = room.connectedUsers.filter(
      (user) => user.socketId !== socket.id
    );

    //leave socket io room
    socket.leave(user.roomId);

    //TODO
    // 방을 떠난 나머지 사용자에게 이벤트를 내보냅니다.
    //방에 머무를 사용자 수가 0인 경우 방을 닫습니다.
    if (room.connectedUsers.length > 0) {
      io.to(room.id).emit('room-update', {
        connectedUsers: room.connectedUsers,
      });
    } else {
      rooms = rooms.filter((r) => r.id !== room.id);
    }
  }
};

const signalingHandler = (data, socket) => {
  const { connUserSocketId, signal } = data;
  const signalingData = { signal, connUserSocketId: socket.id };
  io.to(connUserSocketId).emit('conn-signal', signalingData);
};

//이미 방에 있는 클라이언트로부터 들어오는 연결을 위해 미리 준비한 정보
const initializeConnectionHandler = (data, socket) => {
  const { connUserSocketId } = data;
  const initData = { connUserSocketId: socket.id };
  io.to(connUserSocketId).emit('conn-init', initData);
};

server.listen(PORT, () => {
  console.log(`Server is listening on ${PORT}`);
});
