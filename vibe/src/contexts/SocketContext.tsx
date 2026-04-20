import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "../config";
import { useAuth } from "./AuthContext";

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let newSocket: Socket | null = null;

    if (isAuthenticated) {
      const token = localStorage.getItem("accessToken");
      if (!token) return;

      // In development, SOCKET_URL is undefined, so it connects to the same host (proxied by Vite)
      const socketUrl = SOCKET_URL || window.location.origin;

      newSocket = io(socketUrl, {
        auth: { token },
        // Ensure we don't have multiple connections if this re-runs
        transports: ["websocket", "polling"],
      });

      newSocket.on("connect", () => {
        console.log("Socket connected:", newSocket?.id);
        setConnected(true);

        // Signal that the user is online
        const userId = (user as any)?._id || (user as any)?.id;
        if (userId) {
          newSocket?.emit("user:online", { userId });
        }
      });

      newSocket.on("disconnect", () => {
        console.log("Socket disconnected");
        setConnected(false);
      });

      setSocket(newSocket);
    }

    return () => {
      if (newSocket) {
        console.log("Disconnecting socket in cleanup");
        newSocket.disconnect();
      }
    };
  }, [isAuthenticated, (user as any)?._id, (user as any)?.id]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
