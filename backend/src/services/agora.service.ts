import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

export function generateAgoraToken(
  appId: string,
  appCertificate: string,
  channelName: string,
  uidOrAccount: string | number,
  roleStr: 'publisher' | 'subscriber' = 'publisher',
  expireTimeInSeconds: number = 3600
): string {
  if (!appId) {
    throw new Error('AGORA_APP_ID is required');
  }
  if (!appCertificate) {
    throw new Error('AGORA_APP_CERTIFICATE is required');
  }
  if (!channelName) {
    throw new Error('Channel name (roomId) is required');
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expireTimeInSeconds;

  const role = roleStr === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  let token: string;
  if (typeof uidOrAccount === 'number') {
    token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uidOrAccount,
      role,
      privilegeExpiredTs
    );
  } else {
    token = RtcTokenBuilder.buildTokenWithAccount(
      appId,
      appCertificate,
      channelName,
      uidOrAccount,
      role,
      privilegeExpiredTs
    );
  }

  return token;
}
