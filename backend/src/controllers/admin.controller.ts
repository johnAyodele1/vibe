import { Response, Request } from 'express';
import User from '../models/User';
import Report from '../models/Report';
import ContentViolation from '../models/ContentViolation';
import Conversation from '../models/Conversation';
import VisitorStat from '../models/VisitorStat';
import AdultUser from '../models/AdultUser';
import CreditTransaction from '../models/CreditTransaction';
import AdultMessage from '../models/AdultMessage';
import PlatformEarning from '../models/PlatformEarning';
import DailyStat from '../models/DailyStat';
import { getDauCount } from '../middleware/trackDailyActive';
import { IExpressRequest } from '../types/express';
import mongoose from 'mongoose';
import { generateAccessToken } from '../middleware/auth';
import AppConfig from '../models/AppConfig';
import { getDiamondNairaRate } from '../shared/pricing';
import { deleteCache } from '../config/redisFallback';
import jwt from 'jsonwebtoken';

// @desc    Admin login
// @access  Public
export const adminLogin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@vibe.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (email === adminEmail && password === adminPassword) {
      // Use a special ID for the admin user
      const token = generateAccessToken('admin_user_id', true);
      return res.json({
        success: true,
        message: 'Admin login successful',
        data: { token },
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getAnalyticsOverview = async (req: Request, res: Response) => {
  try {
    const rate = await getDiamondNairaRate();

    // 1. Total Members & Providers
    const [totalMembers, totalProviders] = await Promise.all([
      AdultUser.countDocuments({ role: 'user' }),
      AdultUser.countDocuments({ role: 'provider' }),
    ]);

    // 2. Active Today
    const todayStr = new Date().toISOString().slice(0, 10);
    const activeToday = await getDauCount(todayStr);

    // 3. Registered Today
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const newToday = await AdultUser.countDocuments({
      createdAt: { $gte: startOfToday }
    });

    // 4. Online Now
    const onlineNow = await AdultUser.countDocuments({
      isOnline: true
    });

    // 5. Earnings metrics
    const allTimePlatformFeesSum = await PlatformEarning.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' }, totalNaira: { $sum: '$nairaValue' } } }
    ]);
    const totalPlatformFees = allTimePlatformFeesSum[0]?.total || 0;
    const totalPlatformNaira = allTimePlatformFeesSum[0]?.totalNaira || (totalPlatformFees * rate);

    const payoutsSum = await CreditTransaction.aggregate([
      { $match: { type: 'payout', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const paidOut = Math.abs(payoutsSum[0]?.total || 0);

    const providersWalletSum = await AdultUser.aggregate([
      { $match: { role: 'provider' } },
      { $group: { _id: null, total: { $sum: '$credits' } } }
    ]);
    const pendingPayouts = providersWalletSum[0]?.total || 0;
    const pendingPayoutsNaira = pendingPayouts * rate;

    const sourceBreakdowns = await PlatformEarning.aggregate([
      { $group: { _id: '$source', total: { $sum: '$amount' } } }
    ]);
    const breakdown: Record<string, number> = {
      tips: 0,
      gifts: 0,
      calls: 0,
      service: 0,
      paidMedia: 0,
      spinWheel: 0,
    };
    sourceBreakdowns.forEach(item => {
      const sourceKey = item._id === 'paid_media' ? 'paidMedia' : item._id === 'spin_wheel' ? 'spinWheel' : item._id;
      if (sourceKey in breakdown) {
        breakdown[sourceKey] = item.total;
      }
    });

    // 6. Content metrics
    let activeCamSessions = 0;
    let totalCamSessions = 0;
    try {
      activeCamSessions = await mongoose.model('CamSession').countDocuments({ status: 'live' });
      totalCamSessions = await mongoose.model('CamSession').countDocuments();
    } catch (e) {}

    const totalMessages = await AdultMessage.countDocuments();
    const totalTransactions = await CreditTransaction.countDocuments();

    return res.json({
      success: true,
      users: {
        totalMembers,
        totalProviders,
        activeToday,
        newToday,
        onlineNow,
      },
      earnings: {
        totalPlatformFees,
        totalPlatformNaira,
        pendingPayouts,
        pendingPayoutsNaira,
        paidOut,
        breakdown,
      },
      content: {
        activeCamSessions,
        totalCamSessions,
        totalMessages,
        totalTransactions,
      }
    });
  } catch (error: any) {
    console.error('getAnalyticsOverview error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getDailyUsers = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const query: any = {};
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = String(from);
      if (to) query.date.$lte = String(to);
    }

    const stats = await DailyStat.find(query).sort({ date: 1 });

    const formatted = stats.map(s => ({
      date: s.date,
      newMembers: s.newMembers || 0,
      newProviders: s.newProviders || 0,
      activeUsers: s.uniqueActiveUsers || 0,
      uniqueLogins: s.uniqueActiveUsers || 0,
    }));

    return res.json({ success: true, data: formatted });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getDailyEarnings = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const query: any = {};
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = String(from);
      if (to) query.date.$lte = String(to);
    }

    const stats = await DailyStat.find(query).sort({ date: 1 });

    const formatted = stats.map(s => {
      const fees = s.platformEarnings || 0;
      const memberSpend = Math.round(fees / 0.15);
      const providerEarnings = memberSpend - fees;

      return {
        date: s.date,
        platformFees: fees,
        memberSpend,
        providerEarnings,
      };
    });

    return res.json({ success: true, data: formatted });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getEarningsBreakdown = async (req: Request, res: Response) => {
  try {
    const breakdowns = await PlatformEarning.aggregate([
      { $group: { _id: '$source', total: { $sum: '$amount' } } }
    ]);

    const MAP: Record<string, string> = {
      tip: 'Tips',
      gift: 'Gifts',
      call: 'Calls',
      service: 'Service',
      paid_media: 'Paid Media',
      spin_wheel: 'Spin Wheel',
    };

    const data = breakdowns.map(b => ({
      name: MAP[b._id] || b._id,
      value: b.total,
    }));

    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getTopProviders = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);

    const topEarnings = await CreditTransaction.aggregate([
      {
        $match: {
          type: { $in: ['tip_received', 'tip', 'call_earning', 'service_payment_received', 'paid_media_unlock', 'spin_wheel'] },
          amount: { $gt: 0 },
          createdAt: { $gte: startOfMonth },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$userId',
          totalEarned: { $sum: '$amount' }
        }
      },
      { $sort: { totalEarned: -1 } },
      { $limit: limit }
    ]);

    const results = [];
    for (const item of topEarnings) {
      const provider = await AdultUser.findById(item._id).select('displayName providerProfile profilePhoto');
      if (provider) {
        results.push({
          id: provider._id,
          stageName: provider.providerProfile?.stageName || provider.displayName || 'Provider',
          profilePhoto: provider.profilePhoto || '/placeholder.svg',
          earnings: item.totalEarned,
        });
      }
    }

    return res.json({ success: true, data: results });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getUserRetention = async (req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      day1: 45,
      day7: 22,
      day30: 12,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getRecentTransactions = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    const txs = await CreditTransaction.find()
      .populate('userId', 'username displayName')
      .populate('relatedUserId', 'username displayName')
      .sort({ createdAt: -1 })
      .limit(limit);

    const formatted = txs.map(tx => {
      let fromName = 'Member';
      let toName = 'Provider';

      if (tx.userId) {
        fromName = (tx.userId as any).displayName || (tx.userId as any).username || 'Member';
      }
      if (tx.relatedUserId) {
        toName = (tx.relatedUserId as any).displayName || (tx.relatedUserId as any).username || 'Provider';
      }

      return {
        id: tx._id,
        type: tx.type,
        amount: Math.abs(tx.amount),
        fromName,
        toName,
        description: tx.description,
        createdAt: tx.createdAt,
      };
    });

    return res.json({ success: true, data: formatted });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get admin config diamond rate
// @access  Private/Admin
export const getAdminDiamondRate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const rate = await getDiamondNairaRate();
    const config = await AppConfig.findOne({ key: 'diamond_naira_rate' });
    return res.json({
      success: true,
      rate,
      history: config?.history || [],
      updatedAt: config?.updatedAt,
      updatedBy: config?.updatedBy,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Update admin config diamond rate
// @access  Private/Admin
export const updateAdminDiamondRate = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { rate } = req.body;

    if (rate === undefined || typeof rate !== 'number' || rate < 1 || rate > 100000) {
      return res.status(400).json({ success: false, message: 'Rate must be between 1 and 100,000' });
    }

    // Extract adminId from JWT token
    let adminId = 'admin_user_id';
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as any;
        if (decoded && decoded.userId) {
          adminId = decoded.userId;
        }
      } catch (err) {
        // Ignore JWT verification error here since middleware already verified it
      }
    }

    const config = await AppConfig.findOneAndUpdate(
      { key: 'diamond_naira_rate' },
      {
        $set: {
          value: rate,
          updatedBy: adminId,
          updatedAt: new Date(),
        },
        $push: {
          history: {
            value: rate,
            changedBy: adminId,
            changedAt: new Date(),
          },
        },
      },
      { upsert: true, new: true }
    );

    // Clear Redis cache immediately so new rate takes effect right away
    await deleteCache('config:diamond_naira_rate');

    return res.json({
      success: true,
      rate: config.value,
      message: 'Rate updated successfully',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get all content violations
// @access  Private/Admin
export const getViolations = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { reviewed, accountType, page = '1', limit = '20' } = req.query;

    const query: any = {};
    if (reviewed !== undefined) {
      query.reviewed = reviewed === 'true';
    }
    if (accountType) {
      query.accountType = accountType;
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skipNum = (pageNum - 1) * limitNum;

    const violations = await ContentViolation.find(query)
      .select('+messageContent')
      .populate('userId', 'displayName username email role')
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum);

    const total = await ContentViolation.countDocuments(query);

    return res.json({
      success: true,
      data: {
        violations,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    console.error('Get violations error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Take action on a content violation
// @access  Private/Admin
export const updateViolationAction = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'none' | 'warned' | 'suspended' | 'dismissed'

    if (!['none', 'warned', 'suspended', 'dismissed'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const violation = await ContentViolation.findById(id);
    if (!violation) {
      return res.status(404).json({ success: false, message: 'Violation not found' });
    }

    violation.reviewed = true;
    violation.actionTaken = action;
    violation.reviewedAt = new Date();

    const adminId = (req as any).user?.id || (req as any).user?._id;
    if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
      violation.reviewedBy = new mongoose.Types.ObjectId(adminId);
    }

    await violation.save();

    return res.json({
      success: true,
      message: 'Violation action recorded successfully',
      data: violation,
    });
  } catch (error: any) {
    console.error('Update violation action error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// @desc    Get admin analytics
// @access  Private/Admin
export const getAnalytics = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    const totalUsers = await User.countDocuments();
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    const activeMatches = await User.aggregate([
      { $unwind: '$matches' },
      { $match: { 'matches.isActive': true } },
      { $count: 'count' },
    ]);

    const visitStat = await VisitorStat.findOne({ key: 'site_visits' });

    return res.json({
      success: true,
      data: {
        totalUsers,
        totalReports,
        pendingReports,
        activeMatches: activeMatches[0]?.count || 0,
        siteVisits: visitStat?.count || 0,
      },
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get all reports
// @access  Private/Admin
export const getAllReports = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    const reports = await Report.find()
      .populate('reporter', 'firstName lastName email')
      .populate('reported', 'firstName lastName email isBlocked')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: { reports } });
  } catch (error) {
    console.error('Get all reports error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get all users
// @access  Private/Admin
export const getAllUsers = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    const users = await User.find()
      .select('firstName lastName email isBlocked createdAt lastActive')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: { users } });
  } catch (error) {
    console.error('Get all users error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Admin action (block/unblock/delete/resolve report)
// @access  Private/Admin
export const adminAction = async (req: IExpressRequest, res: Response): Promise<Response> => {
  try {
    const { action, targetId, reportId } = req.body;

    if (action === 'block' || action === 'unblock') {
      await User.findByIdAndUpdate(targetId, { isBlocked: action === 'block' });
      if (reportId) {
        await Report.findByIdAndUpdate(reportId, { status: 'resolved' });
      }
      return res.json({ success: true, message: `User ${action}ed successfully` });
    }

    if (action === 'delete') {
      await User.findByIdAndDelete(targetId);
      // Clean up reports and conversations
      await Report.deleteMany({ $or: [{ reporter: targetId }, { reported: targetId }] });
      await Conversation.deleteMany({ participants: targetId });
      return res.json({ success: true, message: 'User deleted successfully' });
    }

    if (action === 'dismiss_report' && reportId) {
      await Report.findByIdAndUpdate(reportId, { status: 'dismissed' });
      return res.json({ success: true, message: 'Report dismissed' });
    }

    return res.status(400).json({ success: false, message: 'Invalid action' });
  } catch (error) {
    console.error('Admin action error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
