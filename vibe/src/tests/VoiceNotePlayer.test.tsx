import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceNotePlayer } from '../components/AdultZone/VoiceNotePlayer';

describe('VoiceNotePlayer', () => {
  let playSpy: ReturnType<typeof vi.fn>;
  let pauseSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    playSpy = vi.fn().mockResolvedValue(undefined);
    pauseSpy = vi.fn();

    window.HTMLMediaElement.prototype.play = playSpy as any;
    window.HTMLMediaElement.prototype.pause = pauseSpy as any;
  });

  it('renders correctly in initial paused state with duration', () => {
    render(
      <VoiceNotePlayer
        mediaUrl="https://example.com/audio.webm"
        mediaDurationSeconds={25}
        isMe={false}
      />
    );

    const playBtn = screen.getByTestId('voice-note-play-btn');
    expect(playBtn).toBeDefined();
    expect(playBtn.textContent).toBe('▶');
    expect(screen.getByText('0:25')).toBeDefined();
  });

  it('toggles play/pause state when clicked', async () => {
    render(
      <VoiceNotePlayer
        mediaUrl="https://example.com/audio.webm"
        mediaDurationSeconds={10}
        isMe={true}
      />
    );

    const playBtn = screen.getByTestId('voice-note-play-btn');

    await act(async () => {
      fireEvent.click(playBtn);
    });

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(playBtn.textContent).toBe('❚❚');

    await act(async () => {
      fireEvent.click(playBtn);
    });

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(playBtn.textContent).toBe('▶');
  });

  it('handles playback ended event cleanly', async () => {
    const { container } = render(
      <VoiceNotePlayer
        mediaUrl="https://example.com/audio.webm"
        mediaDurationSeconds={15}
        isMe={false}
      />
    );

    const playBtn = screen.getByTestId('voice-note-play-btn');

    await act(async () => {
      fireEvent.click(playBtn);
    });

    const audioEl = container.querySelector('audio');
    expect(audioEl).not.toBeNull();

    if (audioEl) {
      await act(async () => {
        fireEvent.ended(audioEl);
      });
    }

    expect(playBtn.textContent).toBe('▶');
  });
});
