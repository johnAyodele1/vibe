import { Request, Response } from 'express';
import mongoose from 'mongoose';
import RewardTask from '../models/RewardTask';
import UserTask from '../models/UserTask';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import { socketService } from '../services/socketService';

// helper to get today's midnight in local/server time
const getTodayMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getTomorrowMidnight = () => {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
};

// @desc    Get user rewards tasks
// @access  Private/Member
export const getUserTasks = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    // Ensure at least a default daily check-in task exists so things work
    let checkinTask = await RewardTask.findOne({ type: 'daily_checkin' });
    if (!checkinTask) {
      checkinTask = await RewardTask.create({
        title: 'Daily Check-in',
        description: 'Come back every day',
        reward: 10,
        type: 'daily_checkin',
        isActive: true,
        sortOrder: -1,
      });
    }

    const tasks = await RewardTask.find({ isActive: true }).sort({ sortOrder: 1 });
    const todayMidnight = getTodayMidnight();
    const tomorrowMidnight = getTomorrowMidnight();

    // Fetch user completions today
    const completionsToday = await UserTask.find({
      userId: user._id,
      completedAt: { $gte: todayMidnight }
    });

    const completionMap = new Set(completionsToday.map(c => c.taskId.toString()));

    const mappedTasks = tasks.map(task => ({
      id: task._id.toString(),
      title: task.title,
      description: task.description || '',
      reward: task.reward,
      actionUrl: task.actionUrl || '',
      type: task.type,
      isCompleted: completionMap.has(task._id.toString()),
      canResetAt: tomorrowMidnight,
    }));

    const checkedInToday = completionMap.has(checkinTask._id.toString());

    return res.json({
      success: true,
      tasks: mappedTasks,
      checkedInToday,
    });
  } catch (error: any) {
    console.error('Error in getUserTasks:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Complete a task
// @access  Private/Member
export const completeTask = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    const { taskId } = req.params;
    const task = await RewardTask.findOne({ _id: taskId, isActive: true });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Active reward task not found' });
    }

    const todayMidnight = getTodayMidnight();
    const existingCompletion = await UserTask.findOne({
      userId: user._id,
      taskId: task._id,
      completedAt: { $gte: todayMidnight }
    });

    if (existingCompletion) {
      return res.status(409).json({ success: false, message: 'Already completed today' });
    }

    // Award credits atomically
    const freshUser = await AdultUser.findByIdAndUpdate(
      user._id,
      { $inc: { credits: task.reward } },
      { new: true }
    );

    if (!freshUser) {
      return res.status(500).json({ success: false, message: 'Failed to update user wallet' });
    }

    // Create UserTask record
    await UserTask.create({
      userId: user._id,
      taskId: task._id,
      completedAt: new Date(),
      creditsAwarded: task.reward,
      resetDate: getTomorrowMidnight(),
    });

    // Create CreditTransaction
    await CreditTransaction.create({
      userId: user._id,
      type: 'reward',
      amount: task.reward,
      usdAmount: 0,
      description: `Reward: ${task.title}`,
      status: 'completed',
    });

    // Emit socket update
    socketService.emitToUser(user._id.toString(), 'wallet:updated', { balance: freshUser.credits });

    return res.json({
      success: true,
      creditsAwarded: task.reward,
      newBalance: freshUser.credits,
      taskTitle: task.title,
    });
  } catch (error: any) {
    console.error('Error in completeTask:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Daily check-in shortcut
// @access  Private/Member
export const dailyCheckin = async (req: Request, res: Response) => {
  try {
    const user = req.adultUser;
    if (!user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }

    let task = await RewardTask.findOne({ type: 'daily_checkin' });
    if (!task) {
      task = await RewardTask.create({
        title: 'Daily Check-in',
        description: 'Come back every day',
        reward: 10,
        type: 'daily_checkin',
        isActive: true,
        sortOrder: -1,
      });
    }

    const todayMidnight = getTodayMidnight();
    const existingCompletion = await UserTask.findOne({
      userId: user._id,
      taskId: task._id,
      completedAt: { $gte: todayMidnight }
    });

    if (existingCompletion) {
      return res.status(409).json({ success: false, message: 'Already checked in today. Come back tomorrow!' });
    }

    // Award credits atomically
    const freshUser = await AdultUser.findByIdAndUpdate(
      user._id,
      { $inc: { credits: task.reward } },
      { new: true }
    );

    if (!freshUser) {
      return res.status(500).json({ success: false, message: 'Failed to update user wallet' });
    }

    // Create UserTask record
    await UserTask.create({
      userId: user._id,
      taskId: task._id,
      completedAt: new Date(),
      creditsAwarded: task.reward,
      resetDate: getTomorrowMidnight(),
    });

    // Create CreditTransaction
    await CreditTransaction.create({
      userId: user._id,
      type: 'reward',
      amount: task.reward,
      usdAmount: 0,
      description: `Reward: ${task.title}`,
      status: 'completed',
    });

    // Emit socket update
    socketService.emitToUser(user._id.toString(), 'wallet:updated', { balance: freshUser.credits });

    return res.json({
      success: true,
      creditsAwarded: task.reward,
      newBalance: freshUser.credits,
      taskTitle: task.title,
    });
  } catch (error: any) {
    console.error('Error in dailyCheckin:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// ADMIN REWARD TASK CRUD CONTROLLERS
// ==========================================

// @desc    List all reward tasks (active and inactive)
// @access  Private/Admin
export const adminGetTasks = async (req: Request, res: Response) => {
  try {
    const tasks = await RewardTask.find().sort({ sortOrder: 1 });
    return res.json({ success: true, data: tasks });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Create a reward task
// @access  Private/Admin
export const adminCreateTask = async (req: Request, res: Response) => {
  try {
    const { title, description, type, reward, actionUrl, sortOrder, isActive } = req.body;
    if (!title || !type || !reward) {
      return res.status(400).json({ success: false, message: 'Title, type, and reward are required' });
    }

    const task = await RewardTask.create({
      title,
      description,
      type,
      reward,
      actionUrl,
      sortOrder: sortOrder || 0,
      isActive: isActive !== undefined ? isActive : true,
    });

    return res.status(210).json({ success: true, data: task }); // Using standard HTTP success code or 201/200
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update a reward task
// @access  Private/Admin
export const adminUpdateTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, type, reward, actionUrl, sortOrder, isActive } = req.body;

    const task = await RewardTask.findByIdAndUpdate(
      id,
      {
        title,
        description,
        type,
        reward,
        actionUrl,
        sortOrder,
        isActive,
      },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({ success: false, message: 'Reward task not found' });
    }

    return res.json({ success: true, data: task });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Delete a reward task
// @access  Private/Admin
export const adminDeleteTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const task = await RewardTask.findByIdAndDelete(id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Reward task not found' });
    }

    return res.json({ success: true, message: 'Reward task deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get completion stats per task
// @access  Private/Admin
export const adminGetStats = async (req: Request, res: Response) => {
  try {
    const stats = await UserTask.aggregate([
      {
        $group: {
          _id: '$taskId',
          completionsCount: { $sum: 1 },
          totalCreditsAwarded: { $sum: '$creditsAwarded' },
        }
      },
      {
        $lookup: {
          from: 'rewardtasks',
          localField: '_id',
          foreignField: '_id',
          as: 'taskInfo',
        }
      },
      {
        $unwind: '$taskInfo'
      },
      {
        $project: {
          _id: 1,
          completionsCount: 1,
          totalCreditsAwarded: 1,
          title: '$taskInfo.title',
          type: '$taskInfo.type',
        }
      }
    ]);

    return res.json({ success: true, data: stats });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
