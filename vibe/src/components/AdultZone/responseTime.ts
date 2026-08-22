export interface ResponseBadge {
  label: string;
  color: string;
}

export const getResponseBadge = (averageResponseMinutes: number | null | undefined): ResponseBadge | null => {
  if (averageResponseMinutes === null || averageResponseMinutes === undefined || !Number.isFinite(averageResponseMinutes)) {
    return null;
  }

  if (averageResponseMinutes < 5) return { label: 'Responds in minutes', color: '#22c55e' };
  if (averageResponseMinutes < 60) return { label: 'Responds within 1 hr', color: '#22c55e' };
  if (averageResponseMinutes < 240) return { label: 'Responds within 4 hrs', color: '#c9a84c' };
  if (averageResponseMinutes < 1440) return { label: 'Responds same day', color: '#f97316' };
  return { label: 'Responds slowly', color: '#a08898' };
};
