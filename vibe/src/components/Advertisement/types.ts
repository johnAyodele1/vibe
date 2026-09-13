export interface EligibleAdvertisement {
  id: string;
  title: string;
  description?: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl?: string | null;
  clickUrl?: string | null;
  displayDurationSeconds: number;
  closeAfterSeconds: number;
}
