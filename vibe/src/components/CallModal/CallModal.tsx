import React, { useEffect, useRef } from "react";
import styles from "./CallModal.module.css";

interface CallModalProps {
  isOpen: boolean;
  callerName: string;
  callerImage: string;
  isVideoCall: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const CallModal: React.FC<CallModalProps> = ({
  isOpen,
  callerName,
  callerImage,
  isVideoCall,
  onAccept,
  onDecline,
}) => {
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  const playRingtone = () => {
    if (ringtoneIntervalRef.current) return; // Already playing

    const playBeep = () => {
      try {
        const audioContext =
          ringtoneContextRef.current ||
          new (window.AudioContext || (window as any).webkitAudioContext)();

        if (!ringtoneContextRef.current) {
          ringtoneContextRef.current = audioContext;
        }

        // Resume audio context if suspended (required by some browsers)
        if (audioContext.state === "suspended") {
          audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.type = "sine";

        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.5,
        );

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      } catch (error) {
        console.error("Error playing ringtone:", error);
      }
    };

    // Play double beep pattern every 3 seconds
    const playRingPattern = () => {
      playBeep();
      setTimeout(() => {
        playBeep();
      }, 300);
    };

    playRingPattern();
    ringtoneIntervalRef.current = setInterval(playRingPattern, 3000);
  };

  const stopRingtone = () => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }

    // Close audio context to free resources
    if (
      ringtoneContextRef.current &&
      ringtoneContextRef.current.state !== "closed"
    ) {
      ringtoneContextRef.current.close();
      ringtoneContextRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      playRingtone();
    } else {
      stopRingtone();
    }

    return () => {
      stopRingtone();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.callerInfo}>
          <div className={styles.callerAvatar}>
            <img
              src={callerImage}
              alt={callerName}
              className={styles.avatarImg}
            />
          </div>
          <h3 className={styles.callerName}>{callerName}</h3>
          <p className={styles.callType}>
            Incoming {isVideoCall ? "video" : "audio"} call...
          </p>
        </div>

        <div className={styles.actions}>
          <button className={styles.declineBtn} onClick={onDecline}>
            <span className="material-symbols-outlined">call_end</span>
            Decline
          </button>
          <button className={styles.acceptBtn} onClick={onAccept}>
            <span className="material-symbols-outlined">
              {isVideoCall ? "videocam" : "call"}
            </span>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallModal;
