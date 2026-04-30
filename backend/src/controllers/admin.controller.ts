import { Response, Request } from 'express';
import User from '../models/User';
import Report from '../models/Report';
import Conversation from '../models/Conversation';
import VisitorStat from '../models/VisitorStat';
import { IExpressRequest } from '../types/express';
import mongoose from 'mongoose';
import { generateAccessToken } from '../middleware/auth';

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
