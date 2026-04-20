// Socket.io server for real-time chat, typing, online status, and call signaling
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Conversation = require("./models/Conversation");
const User = require("./models/User");

let ioInstance;
const userSocketMap = new Map(); // Stores a Set of socket IDs per userId

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
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "fallback_secret",
      );
      socket.userId = decoded.userId;
      console.log("Socket authenticated for user:", socket.userId);
      next();
    } catch (err) {
      console.log("Invalid token for socket");
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", async (socket) => {
    console.log("Socket connected for user:", socket.userId);
    const userId = socket.userId;

    // Join user room
    socket.join(userId);

    // Update user status to online
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set());
    }
    const userSockets = userSocketMap.get(userId);
    const isFirstConnection = userSockets.size === 0;
    userSockets.add(socket.id);

    if (isFirstConnection) {
      try {
        await User.findByIdAndUpdate(userId, {
          isOnline: true,
          lastActive: new Date(),
        });
        io.emit("user:status", { userId, isOnline: true });
        console.log(`User ${userId} is now online`);
      } catch (err) {
        console.error("Error updating user status to online:", err);
      }
    }

    // Explicit online/offline events for compatibility
    socket.on("user:online", async () => {
      const targetUserId = userId;
      if (!userSocketMap.has(targetUserId)) {
        userSocketMap.set(targetUserId, new Set());
      }
      const userSockets = userSocketMap.get(targetUserId);
      const isNewlyOnline = userSockets.size === 0;
      userSockets.add(socket.id);

      if (isNewlyOnline) {
        try {
          await User.findByIdAndUpdate(targetUserId, {
            isOnline: true,
            lastActive: new Date(),
          });
          io.emit("user:status", { userId: targetUserId, isOnline: true });
        } catch (err) {
          console.error("Error updating user status to online:", err);
        }
      }
    });

    socket.on("user:offline", async () => {
      const targetUserId = userId;
      const userSockets = userSocketMap.get(targetUserId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userSocketMap.delete(targetUserId);
          try {
            await User.findByIdAndUpdate(targetUserId, {
              isOnline: false,
              lastActive: new Date(),
            });
            io.emit("user:status", { userId: targetUserId, isOnline: false });
          } catch (err) {
            console.error("Error updating user status to offline:", err);
          }
        }
      }
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
    socket.on("call:offer", async (data) => {
      try {
        // Get conversation to find the other participant
        const conversation = await Conversation.findById(data.conversationId);
        if (!conversation) {
          console.log("Conversation not found for call offer");
          return;
        }

        // Find the other participant (not the caller)
        const otherParticipant = conversation.participants.find(
          (participant) => participant.toString() !== socket.userId,
        );

        if (!otherParticipant) {
          console.log("Other participant not found in conversation");
          return;
        }

        // Send to conversation room (for when recipient is in DM)
        socket.to(data.conversationId).emit("call:offer", data);

        // Also send to recipient's user room (for when they're not in DM)
        socket.to(otherParticipant.toString()).emit("call:offer", data);

        console.log(
          `Call offer sent to conversation ${data.conversationId} and user ${otherParticipant}`,
        );
      } catch (error) {
        console.error("Error handling call offer:", error);
      }
    });
    socket.on("call:answer", async (data) => {
      try {
        // Get conversation to find the other participant
        const conversation = await Conversation.findById(data.conversationId);
        if (!conversation) {
          console.log("Conversation not found for call answer");
          return;
        }

        // Find the other participant (not the answerer)
        const otherParticipant = conversation.participants.find(
          (participant) => participant.toString() !== socket.userId,
        );

        if (!otherParticipant) {
          console.log("Other participant not found in conversation");
          return;
        }

        // Send to conversation room
        socket.to(data.conversationId).emit("call:answer", data);

        // Also send to recipient's user room
        socket.to(otherParticipant.toString()).emit("call:answer", data);
      } catch (error) {
        console.error("Error handling call answer:", error);
      }
    });

    socket.on("call:ice-candidate", async (data) => {
      try {
        // Get conversation to find the other participant
        const conversation = await Conversation.findById(data.conversationId);
        if (!conversation) {
          console.log("Conversation not found for ICE candidate");
          return;
        }

        // Find the other participant (not the sender)
        const otherParticipant = conversation.participants.find(
          (participant) => participant.toString() !== socket.userId,
        );

        if (!otherParticipant) {
          console.log("Other participant not found in conversation");
          return;
        }

        // Send to conversation room
        socket.to(data.conversationId).emit("call:ice-candidate", data);

        // Also send to recipient's user room
        socket.to(otherParticipant.toString()).emit("call:ice-candidate", data);
      } catch (error) {
        console.error("Error handling ICE candidate:", error);
      }
    });

    socket.on("disconnect", async () => {
      console.log("Socket disconnected for user:", userId);

      const userSockets = userSocketMap.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userSocketMap.delete(userId);
          try {
            await User.findByIdAndUpdate(userId, {
              isOnline: false,
              lastActive: new Date(),
            });
            io.emit("user:status", { userId, isOnline: false });
            console.log(`User ${userId} is now offline`);
          } catch (err) {
            console.error("Error updating user status to offline:", err);
          }
        }
      }
    });
  });

  return io;
}

module.exports = { setupSocket, ioInstance, userSocketMap };
