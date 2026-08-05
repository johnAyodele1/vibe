import { create } from 'zustand';

export interface ProfileStepData {
  bio: string;
  gender: string;
  dateOfBirth: string;
}

export interface PhotosStepData {
  photos: string[];
  videoPreview: string;
  videoPreviewUrl?: string;
}

export interface ServicesStepData {
  servicesOffered: string[];
}

export interface PricingStepData {
  pricing: {
    perMinuteRate: number;
    tonightRate: number;
  };
  tipMenu: Array<{ amount: number; action: string }>;
}

export interface LocationStepData {
  location: {
    country?: { code: string; name: string };
    state?: { code: string; name: string };
    city?: { name: string; lat: number; lng: number };
  };
  coverageArea: string;
}

export interface PayoutStepData {
  payoutMethod: string;
  payoutDetails?: any;
  bankDetails?: any;
  paypalEmail?: string;
  crypto?: { currency: string; address: string };
}

export interface OnboardingState {
  currentStep: number;
  completedSteps: number[];
  isComplete: boolean;
  stepData: {
    1: ProfileStepData | null;
    2: PhotosStepData | null;
    3: ServicesStepData | null;
    4: PricingStepData | null;
    5: LocationStepData | null;
    6: PayoutStepData | null;
  };
  setStepData: (stepNumber: number, data: any) => void;
  setCurrentStep: (step: number) => void;
  setCompletedSteps: (steps: number[]) => void;
  setIsComplete: (isComplete: boolean) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currentStep: 1,
  completedSteps: [],
  isComplete: false,
  stepData: {
    1: null,
    2: null,
    3: null,
    4: null,
    5: null,
    6: null,
  },
  setStepData: (stepNumber, data) => set((state) => ({
    stepData: {
      ...state.stepData,
      [stepNumber]: data,
    }
  })),
  setCurrentStep: (currentStep) => set({ currentStep }),
  setCompletedSteps: (completedSteps) => set({ completedSteps }),
  setIsComplete: (isComplete) => set({ isComplete }),
  reset: () => set({
    currentStep: 1,
    completedSteps: [],
    isComplete: false,
    stepData: {
      1: null,
      2: null,
      3: null,
      4: null,
      5: null,
      6: null,
    }
  }),
}));
