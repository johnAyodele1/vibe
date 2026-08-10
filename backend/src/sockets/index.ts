import { getIO } from '../socket';

export const emitToAdmins = (event: string, data: any) => {
  const io = getIO();
  if (io) {
    // Send to the general 'admin' room
    io.to('admin').emit(event, data);

    // Also send to the '/adult' namespace 'admin' room
    const adultNamespace = io.of('/adult');
    if (adultNamespace) {
      adultNamespace.to('admin').emit(event, data);
    }
  } else {
    // Silent fallback or standard debug logging
  }
};
