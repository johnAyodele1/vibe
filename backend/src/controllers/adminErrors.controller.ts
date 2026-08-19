import { Response, Request } from 'express';
import { AppError } from '../models/AppError.model';
import { emitToAdmins } from '../sockets';

// GET /admin/errors
export const listErrors = async (req: Request, res: Response) => {
  try {
    const { priority, zone, category, resolved = 'false', page = 1, limit = 50 } = req.query;

    const filter: any = { resolved: resolved === 'true' };
    if (priority && priority !== 'all')  filter.priority = priority;
    if (zone     && zone     !== 'all')  filter.zone     = zone;
    if (category && category !== 'all')  filter.category = category;

    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 50;

    // Database-level priority-weighted pagination
    const pipeline: any[] = [
      { $match: filter },
      {
        $addFields: {
          priorityWeight: {
            $switch: {
              branches: [
                { case: { $eq: ['$priority', 'critical'] }, then: 4 },
                { case: { $eq: ['$priority', 'high'] }, then: 3 },
                { case: { $eq: ['$priority', 'medium'] }, then: 2 },
                { case: { $eq: ['$priority', 'low'] }, then: 1 }
              ],
              default: 0
            }
          }
        }
      },
      { $sort: { priorityWeight: -1, createdAt: -1 } },
      { $skip: (pageNum - 1) * limitNum },
      { $limit: limitNum },
      { $project: { stack: 0, priorityWeight: 0 } }
    ];

    const [errors, countsArray] = await Promise.all([
      AppError.aggregate(pipeline),
      AppError.aggregate([
        { $match: { resolved: false } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ])
    ]);

    const counts = Object.fromEntries(countsArray.map(({ _id, count }) => [_id, count]));

    // Ensure all priority fields are present
    for (const level of ['critical', 'high', 'medium', 'low']) {
      if (!(level in counts)) {
        counts[level] = 0;
      }
    }

    return res.json({ success: true, errors, counts, page: pageNum, hasMore: errors.length === limitNum });
  } catch (error: any) {
    console.error('listErrors error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /admin/errors/:errorId
export const getError = async (req: Request, res: Response) => {
  try {
    const err = await AppError.findOne({ errorId: req.params.errorId }).select('+stack');
    if (!err) return res.status(404).json({ success: false, error: 'Not found' });
    return res.json({ success: true, errorRecord: err, data: err });
  } catch (error: any) {
    console.error('getError error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// PUT /admin/errors/:errorId/resolve
export const resolveError = async (req: Request, res: Response) => {
  try {
    const { note } = req.body;
    // Extract decoded userId if any (authenticated admin)
    const rawUserId = (req as any).user?.sub || (req as any).user?._id || (req as any).user?.id || null;
    const adminUserId = (rawUserId && typeof rawUserId === 'string' && rawUserId.length === 24) ? rawUserId : null;

    const err = await AppError.findOneAndUpdate(
      { errorId: req.params.errorId },
      {
        $set: {
          resolved:       true,
          resolvedAt:     new Date(),
          resolvedBy:     adminUserId,
          resolutionNote: note || '',
        }
      },
      { new: true }
    );
    if (!err) return res.status(404).json({ success: false, error: 'Not found' });
    emitToAdmins('admin:error_resolved', { errorId: err.errorId });
    return res.json({ success: true, message: 'Resolved successfully' });
  } catch (error: any) {
    console.error('resolveError error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// DELETE /admin/errors/resolved
export const clearResolvedErrors = async (req: Request, res: Response) => {
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = await AppError.deleteMany({ resolved: true, resolvedAt: { $lt: cutoff } });
    return res.json({ success: true, deleted: result.deletedCount });
  } catch (error: any) {
    console.error('clearResolvedErrors error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
