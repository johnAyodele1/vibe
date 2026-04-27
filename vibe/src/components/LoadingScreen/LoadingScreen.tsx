import React from 'react';
import styles from './LoadingScreen.module.css';

const LoadingScreen: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.loaderContent}>
        <div className={styles.spinner}></div>
        <h1 className={styles.logo}>VIBE</h1>
      </div>
    </div>
  );
};

export default LoadingScreen;
