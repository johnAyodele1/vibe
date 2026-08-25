import React from 'react';
import AdminAnalytics from './AdminAnalytics';
import AdminAnalyticsAccountingSection from './AdminAnalyticsAccountingSection';

const AdminAnalyticsWithAccounting: React.FC = () => (
  <div className="bg-[#0d040a] text-white">
    <AdminAnalytics />
    <div className="px-6 md:px-8 pb-12 font-sans">
      <AdminAnalyticsAccountingSection />
    </div>
  </div>
);

export default AdminAnalyticsWithAccounting;
