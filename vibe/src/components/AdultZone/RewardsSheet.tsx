import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';
import { useAdultAuth } from '../../contexts/AdultAuthContext';
import { toast } from 'sonner';
import { formatAmount } from '../../lib/pricing';

interface RewardTask {
  id: string;
  title: string;
  description: string;
  reward: number;
  actionUrl: string;
  type: string;
  isCompleted: boolean;
  canResetAt: string;
}

interface RewardsSheetProps {
  onClose: () => void;
}

export const RewardsSheet: React.FC<RewardsSheetProps> = ({ onClose }) => {
  const { updateCredits, isAuthenticated } = useAdultAuth();
  const [tasks, setTasks] = useState<RewardTask[]>([]);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  const fetchTasks = async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rewards/tasks`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adultAccessToken')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setTasks(data.tasks || []);
        setCheckedInToday(data.checkedInToday || false);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [isAuthenticated]);

  const handleCheckin = async () => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }
    setCompleting('checkin');
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rewards/checkin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adultAccessToken')}`
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success(`Check-in successful! Earned 💎 ${formatAmount(data.creditsAwarded)} Credits! 🎁`);
        if (data.newBalance !== undefined) {
          updateCredits(data.newBalance);
        }
        fetchTasks();
      } else {
        toast.info(data.message || 'Already checked in today. Come back tomorrow!');
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not complete check-in');
    } finally {
      setCompleting(null);
    }
  };

  const handleTaskComplete = async (taskId: string) => {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
      return;
    }
    setCompleting(taskId);
    try {
      const response = await fetch(`${API_BASE_URL}/v1/adult/rewards/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adultAccessToken')}`
        }
      });
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success(`Task completed! Earned 💎 ${formatAmount(data.creditsAwarded)} Credits! 🎉`);
        if (data.newBalance !== undefined) {
          updateCredits(data.newBalance);
        }
        fetchTasks();
      } else {
        toast.error(data.message || 'Could not complete task');
      }
    } catch {
      toast.error('Could not complete task');
    } finally {
      setCompleting(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="rewards-sheet__backdrop" onClick={onClose} />

      {/* Sheet — slides up from bottom, NOT full screen */}
      <div className="rewards-sheet text-[var(--az-text-primary)]">
        {/* Drag handle */}
        <div className="rewards-sheet__handle" />

        {/* Header */}
        <div className="rewards-sheet__header">
          <div>
            <h2 className="rewards-sheet__title">Free Rewards 🎁</h2>
            <p className="rewards-sheet__subtitle">Complete tasks to earn credits</p>
          </div>
          <button className="rewards-sheet__close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-[var(--az-text-muted)] italic">
            Gathering daily tasks...
          </div>
        ) : !isAuthenticated ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--az-text-secondary)] mb-4">Please log in to participate in daily check-ins and tasks!</p>
            <button
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent('open-adult-auth-modal'));
              }}
              className="px-6 py-2 bg-[var(--az-accent-primary)] text-white text-xs font-bold uppercase tracking-widest rounded-full"
            >
              Login Now
            </button>
          </div>
        ) : (
          <>
            {/* Daily Check-in card — always first */}
            {(() => {
              const checkinTaskObj = tasks.find(t => t.type === 'daily_checkin');
              return (
                <div className="rewards-checkin-card shadow-md">
                  <div className="rewards-checkin-card__left">
                    <span className="rewards-checkin-card__icon">☀️</span>
                    <div>
                      <p className="rewards-checkin-card__title">{checkinTaskObj?.title || 'Daily Check-in'}</p>
                      <p className="rewards-checkin-card__desc">{checkinTaskObj?.description || 'Come back every day'}</p>
                    </div>
                  </div>
                  <button
                    className="rewards-checkin-card__btn"
                    onClick={handleCheckin}
                    disabled={completing === 'checkin' || checkedInToday}
                  >
                    {checkedInToday ? '✓ Done' : completing === 'checkin' ? '...' : `💎 +${checkinTaskObj?.reward || 10}`}
                  </button>
                </div>
              );
            })()}

            {/* Task list */}
            <div className="rewards-task-list">
              {tasks.filter(t => t.type !== 'daily_checkin').map(task => (
                <div key={task.id} className={`rewards-task shadow-sm ${task.isCompleted ? 'rewards-task--done' : ''}`}>
                  <div className="rewards-task__left">
                    <span className="rewards-task__reward">💎 +{task.reward}</span>
                    <p className="rewards-task__title">{task.title}</p>
                    {task.description && (
                      <p className="rewards-task__desc">{task.description}</p>
                    )}
                  </div>
                  <div className="rewards-task__right">
                    {task.isCompleted ? (
                      <span className="rewards-task__done-badge">✓</span>
                    ) : (
                      <a
                        href={task.actionUrl || '#'}
                        className="rewards-task__go-btn"
                        onClick={(e) => {
                          if (!task.actionUrl) {
                            e.preventDefault();
                          }
                          handleTaskComplete(task.id);
                          onClose();
                        }}
                      >
                        GO →
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {tasks.filter(t => t.type !== 'daily_checkin').length === 0 && (
                <div className="py-6 text-center text-xs text-[var(--az-text-muted)] italic">
                  No additional tasks active today. Check back later!
                </div>
              )}
            </div>
          </>
        )}

        {/* Bottom note */}
        <p className="rewards-sheet__note">Tasks reset every day at midnight</p>
      </div>
    </>
  );
};

export default RewardsSheet;
