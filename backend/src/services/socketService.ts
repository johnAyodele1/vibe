import app from '../app';

export const socketService = {
  emitToUser(userId: string, event: string, data: any) {
    const ns = app.get('adultNamespace');
    if (ns) {
      ns.to(`user:${userId}`).emit(event, data);
    }
  }
};
