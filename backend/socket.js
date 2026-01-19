// Socket.io server for real-time chat, typing, online status, and call signaling
const { Server } = require("socket.io");
const Conversation = require("./models/Conversation");
const User = require("./models/User");

let ioInstance;
const userSocketMap = new Map();

function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  ioInstance = io;

  // Authenticate socket
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.log("No token provided for socket");
      return next(new Error("Authentication error"));
    }
    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      console.log("Socket authenticated for user:", socket.userId);
      next();
    } catch (err) {
      console.log("Invalid token for socket");
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    console.log("Socket connected for user:", socket.userId);
    // Join user room
    socket.join(socket.userId);
    // Authenticate and join user room
    socket.on("user:online", async ({ userId }) => {
      userSocketMap.set(userId, socket.id);
      await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastActive: new Date(),
      });
      io.emit("user:status", { userId, isOnline: true });
    });

    socket.on("user:offline", async ({ userId }) => {
      userSocketMap.delete(userId);
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastActive: new Date(),
      });
      io.emit("user:status", { userId, isOnline: false });
    });

    // Join conversation room
    socket.on("join:conversation", ({ conversationId }) => {
      socket.join(conversationId);
    });

    // Real-time message relay
    socket.on("message", (message) => {
      // Broadcast to all in the conversation room except sender
      if (message.conversation) {
        socket.to(message.conversation).emit("message", message);
      }
      // Optionally, also emit to receiver's user room for redundancy
      if (message.receiver) {
        socket.to(message.receiver).emit("message", message);
      }
    });

    // Typing indicator
    socket.on("typing", ({ conversationId, userId }) => {
      socket.to(conversationId).emit("typing", { userId });
    });
    socket.on("stopTyping", ({ conversationId, userId }) => {
      socket.to(conversationId).emit("stopTyping", { userId });
    });

    // Video/Audio call signaling
    socket.on("call:offer", (data) => {
      socket.to(data.conversationId).emit("call:offer", data);
    });
    socket.on("call:answer", (data) => {
      socket.to(data.conversationId).emit("call:answer", data);
    });
    socket.on("call:ice-candidate", (data) => {
      socket.to(data.conversationId).emit("call:ice-candidate", data);
    });

    socket.on("disconnect", async () => {
      for (const [userId, id] of userSocketMap.entries()) {
        if (id === socket.id) {
          userSocketMap.delete(userId);
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastActive: new Date(),
          });
          io.emit("user:status", { userId, isOnline: false });
        }
      }
    });
  });

  return io;
}

module.exports = { setupSocket, ioInstance, userSocketMap };
