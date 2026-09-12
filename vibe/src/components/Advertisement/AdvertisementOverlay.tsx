import React from 'react';
import styles from './Advertisement.module.css';
import { AdvertisementCard, AdvertisementCardProps } from './AdvertisementCard';

export const AdvertisementOverlay: React.FC<AdvertisementCardProps> = (props) => {
  return (
    <div
      className={styles.overlay}
      data-testid="advertisement-overlay"
    >
      <AdvertisementCard {...props} />
    </div>
  );
};

export default AdvertisementOverlay;
