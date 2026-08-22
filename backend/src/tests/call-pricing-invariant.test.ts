import AdultCall from '../models/AdultCall';

describe('call pricing invariant', () => {
  const baseCall = {
    conversationId: 'conversation-1',
    callerId: '507f1f77bcf86cd799439011',
    receiverId: '507f1f77bcf86cd799439012',
    type: 'video' as const,
    status: 'ringing' as const,
    webrtcRoomId: 'room-1',
  };

  it('rejects a zero call rate instead of allowing a free call session', async () => {
    const call = new AdultCall({
      ...baseCall,
      perMinuteRate: 0,
    });

    await expect(call.validate()).rejects.toThrow(/must be greater than zero/);
  });

  it('accepts a positive configured call rate', async () => {
    const call = new AdultCall({
      ...baseCall,
      perMinuteRate: 42,
    });

    await expect(call.validate()).resolves.toBeUndefined();
  });
});
