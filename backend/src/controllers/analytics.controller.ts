import { Request, Response } from 'express';
import VisitorStat from '../models/VisitorStat';

export const trackVisit = async (req: Request, res: Response): Promise<Response> => {
  try {
    const stat = await VisitorStat.findOneAndUpdate(
      { key: 'site_visits' },
      { $inc: { count: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      data: { visits: stat.count },
    });
  } catch (error) {
    console.error('Track visit error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while tracking visit',
    });
  }
};
