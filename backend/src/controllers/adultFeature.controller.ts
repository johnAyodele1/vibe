import { Request, Response } from 'express';
import AdultUser from '../models/AdultUser';

export const getProviders = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { category } = req.query;
    let query: any = { role: 'provider' };

    if (category && category !== 'All') {
      query['providerProfile.tags'] = category;
    }

    const providers = await AdultUser.find(query)
      .select('firstName lastName providerProfile photos gender lastActive isOnline role')
      .sort({ 'providerProfile.isLive': -1, lastActive: -1 });

    return res.json({ success: true, data: { providers } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
