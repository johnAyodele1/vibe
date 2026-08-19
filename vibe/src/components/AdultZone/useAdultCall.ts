import { useContext } from 'react';
import { AdultCallContext, AdultCallContextType } from './AdultCallContextDefinition';

export const useAdultCall = (): AdultCallContextType => {
  const context = useContext(AdultCallContext);
  if (!context) {
    throw new Error('useAdultCall must be used within an AdultCallProvider');
  }
  return context;
};
