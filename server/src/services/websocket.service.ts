import type { Server as SocketIOServer } from 'socket.io';
import logger from '../config/logger';
import { verifyToken } from './auth.service';

let io: SocketIOServer;

/**
 * Initialize WebSocket server
 * @param server HTTP server instance
 */
export const setupWebSocketServer = (socketIo: SocketIOServer): void => {
  io = socketIo;

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: Token missing'));
      }

      const decoded = await verifyToken(token);
      socket.data.user = decoded;

      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.data.user?.id;

    logger.info(`User connected to WebSocket: ${userId}`);

    // Join user-specific room
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // Handle task updates
    socket.on('task:update', (data) => {
      logger.debug(`Task update from ${userId}:`, data);

      // Broadcast to all users in the project room
      if (data.projectId) {
        socket.to(`project:${data.projectId}`).emit('task:updated', data);
      }
    });

    // Handle project room join
    socket.on('project:join', (projectId) => {
      logger.debug(`User ${userId} joined project room: ${projectId}`);
      socket.join(`project:${projectId}`);
    });

    // Handle project room leave
    socket.on('project:leave', (projectId) => {
      logger.debug(`User ${userId} left project room: ${projectId}`);
      socket.leave(`project:${projectId}`);
    });

    // Handle workspace room join
    socket.on('workspace:join', (workspaceId) => {
      logger.debug(`User ${userId} joined workspace room: ${workspaceId}`);
      socket.join(`workspace:${workspaceId}`);
    });

    // Handle workspace room leave
    socket.on('workspace:leave', (workspaceId) => {
      logger.debug(`User ${userId} left workspace room: ${workspaceId}`);
      socket.leave(`workspace:${workspaceId}`);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`User disconnected from WebSocket: ${userId}`);
    });
  });

  logger.info('WebSocket server initialized');
};

/**
 * Send notification to a specific user
 * @param userId User ID
 * @param notification Notification data
 */
export const sendUserNotification = (userId: string, notification: any): void => {
  if (!io) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  io.to(`user:${userId}`).emit('notification', notification);
};

/**
 * Send task update to all users in a project
 * @param projectId Project ID
 * @param taskData Task data
 */
export const sendTaskUpdate = (projectId: string, taskData: any): void => {
  if (!io) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  io.to(`project:${projectId}`).emit('task:updated', taskData);
};

/**
 * Send project update to all users in a project
 * @param projectId Project ID
 * @param projectData Project data
 */
export const sendProjectUpdate = (projectId: string, projectData: any): void => {
  if (!io) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  io.to(`project:${projectId}`).emit('project:updated', projectData);
};

/**
 * Send workspace update to all users in a workspace
 * @param workspaceId Workspace ID
 * @param workspaceData Workspace data
 */
export const sendWorkspaceUpdate = (workspaceId: string, workspaceData: any): void => {
  if (!io) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  io.to(`workspace:${workspaceId}`).emit('workspace:updated', workspaceData);
};

/**
 * Send message to all connected clients
 * @param event Event name
 * @param data Event data
 */
export const broadcastToAll = (event: string, data: any): void => {
  if (!io) {
    logger.warn('WebSocket server not initialized');
    return;
  }

  io.emit(event, data);
};

/**
 * Get active connections count
 * @returns Number of active connections
 */
export const getActiveConnectionsCount = (): number => {
  if (!io) {
    return 0;
  }

  return io.engine.clientsCount;
};

/**
 * Get active connections by room
 * @param room Room name
 * @returns Array of socket IDs in the room
 */
export const getConnectionsByRoom = async (room: string): Promise<string[]> => {
  if (!io) {
    return [];
  }

  const sockets = await io.in(room).fetchSockets();
  return sockets.map((socket) => socket.id);
};
