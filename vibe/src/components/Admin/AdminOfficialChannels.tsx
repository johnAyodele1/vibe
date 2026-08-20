import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../config';
import { toast } from 'sonner';

interface OfficialNotification {
  _id: string;
  title: string;
  content: string;
  targetAudience: 'users' | 'providers' | 'both';
  createdAt: string;
}

interface SupportConversation {
  conversationId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role: string;
  } | null;
  status: 'open' | 'closed' | 'resolved';
  tags: string[];
  issueContext?: any;
  lastMessage?: {
    content: string;
    sentAt: string;
  };
  updatedAt: string;
}

export const AdminOfficialChannels: React.FC = () => {
  const token = localStorage.getItem('adminToken') || '';
  const [searchParams] = useSearchParams();
  const conversationParam = searchParams.get('conversation');
  const [activeTab, setActiveTab] = useState<'notifications' | 'support' | 'settings'>('support');

  // Notifications state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetAudience, setTargetAudience] = useState<'users' | 'providers' | 'both'>('both');
  const [notifications, setNotifications] = useState<OfficialNotification[]>([]);
  const [isSendingNotif, setIsSendingNotif] = useState(false);

  // Support inbox state
  const [supportQueue, setSupportQueue] = useState<SupportConversation[]>([]);
  const [selectedQueueConv, setSelectedQueueConv] = useState<SupportConversation | null>(null);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [isReplying, setIsSendingReply] = useState(false);

  // Config state
  const [config, setConfig] = useState<any>({
    notifications: { avatarUrl: '/icons/icon-192x192.png', badge: 'official', badgeType: 'blue', enabled: true },
    support: { avatarUrl: '/icons/icon-192x192.png', badge: 'official', badgeType: 'blue', enabled: true },
  });
  const [isUploadingNotifAvatar, setIsUploadingNotifAvatar] = useState(false);
  const [isUploadingSupportAvatar, setIsUploadingSupportAvatar] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/official-notifications`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSupportQueue = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/support/conversations`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setSupportQueue(data.conversations);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/official-channels/config`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSupportMessages = async (convId: string) => {
    setIsLoadingMessages(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/support/conversations/${convId}/messages`, { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setSupportMessages(data.messages);
      }
    } catch (err) {
      console.error('Error fetching support messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchSupportQueue();
    fetchConfig();
  }, []);

  useEffect(() => {
    if (conversationParam) {
      setActiveTab('support');
      if (supportQueue.length > 0) {
        const matchingConv = supportQueue.find(
          c => c.conversationId === conversationParam || c.conversationId === `support_${conversationParam}`
        );
        if (matchingConv) {
          setSelectedQueueConv(matchingConv);
        }
      }
    }
  }, [conversationParam, supportQueue]);

  useEffect(() => {
    if (selectedQueueConv?.conversationId) {
      fetchSupportMessages(selectedQueueConv.conversationId);
    } else {
      setSupportMessages([]);
    }
  }, [selectedQueueConv?.conversationId]);

  const handleCreateNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error('Please enter both title and message content');
      return;
    }

    setIsSendingNotif(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/official-notifications`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ title, content, targetAudience }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Official notification broadcasted successfully!');
        setTitle('');
        setContent('');
        fetchNotifications();
      } else {
        toast.error(data.error || 'Failed to send notification');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setIsSendingNotif(false);
    }
  };

  const handleSendSupportReply = async () => {
    if (!selectedQueueConv || !replyText.trim() || isReplying) return;

    setIsSendingReply(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/support/conversations/${selectedQueueConv.conversationId}/messages`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ content: replyText }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Support response sent');
        setReplyText('');
        fetchSupportMessages(selectedQueueConv.conversationId);
        fetchSupportQueue();
      } else {
        toast.error(data.error || 'Failed to send reply');
      }
    } catch (err) {
      toast.error('Failed to send support reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleAddTag = async () => {
    if (!selectedQueueConv || !tagInput.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/support/conversations/${selectedQueueConv.conversationId}/tags`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ action: 'add', tags: [tagInput.trim()] }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Tag added');
        setTagInput('');
        setSelectedQueueConv(prev => prev ? { ...prev, tags: data.tags } : null);
        fetchSupportQueue();
      }
    } catch (err) {
      toast.error('Failed to add tag');
    }
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>, channel: 'notifications' | 'support') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const setUploading = channel === 'notifications' ? setIsUploadingNotifAvatar : setIsUploadingSupportAvatar;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE_URL}/admin/official-channels/upload-avatar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        setConfig((prev: any) => ({
          ...prev,
          [channel]: { ...prev[channel], avatarUrl: data.url }
        }));
        toast.success(`${channel === 'notifications' ? 'Notifications' : 'Support'} avatar uploaded successfully!`);
      } else {
        toast.error(data.error || 'Failed to upload image');
      }
    } catch (err) {
      toast.error('Avatar upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/official-channels/config`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(data.data || config);
        toast.success('Official Channel identities saved successfully!');
      } else {
        toast.error(data.error || 'Failed to save config');
      }
    } catch (err) {
      toast.error('Failed to update config');
    } finally {
      setIsSavingConfig(false);
    }
  };

  return (
    <div className="p-6 bg-[#0f0810] text-gray-100 min-h-screen">
      <div className="flex items-center justify-between border-b border-pink-500/20 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-serif italic text-pink-500 flex items-center gap-2">
            <span>🔵</span> Official Channels Management
          </h1>
          <p className="text-xs text-gray-400 mt-1">Manage Official Notifications, Customer Support inbox, and channel badges</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('support')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'support' ? 'bg-pink-600 text-white' : 'bg-[#180a14] text-gray-400 border border-pink-500/20'
            }`}
          >
            🎧 Support Queue ({supportQueue.length})
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'notifications' ? 'bg-pink-600 text-white' : 'bg-[#180a14] text-gray-400 border border-pink-500/20'
            }`}
          >
            📢 Broadcast Composer
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'settings' ? 'bg-pink-600 text-white' : 'bg-[#180a14] text-gray-400 border border-pink-500/20'
            }`}
          >
            ⚙️ Official Identity Settings
          </button>
        </div>
      </div>

      {activeTab === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#140b13] border border-pink-500/20 rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-lg font-bold text-pink-400 flex items-center gap-2">
              <span>📢</span> Create Official Notification
            </h2>

            <form onSubmit={handleCreateNotification} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">Target Audience</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetAudience('users')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      targetAudience === 'users' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-[#180d16] border-gray-700 text-gray-400'
                    }`}
                  >
                    Members Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetAudience('providers')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      targetAudience === 'providers' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-[#180d16] border-gray-700 text-gray-400'
                    }`}
                  >
                    Providers Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetAudience('both')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      targetAudience === 'both' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-[#180d16] border-gray-700 text-gray-400'
                    }`}
                  >
                    Both (Everyone)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">Notification Title</label>
                <input
                  type="text"
                  placeholder="e.g., Welcome to Vibe!"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#1b0d19] border border-pink-500/30 rounded-lg p-2.5 text-xs text-gray-100 outline-none focus:border-pink-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-300 block mb-1">Message Content</label>
                <textarea
                  rows={5}
                  placeholder="Type the official platform notice..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-[#1b0d19] border border-pink-500/30 rounded-lg p-2.5 text-xs text-gray-100 outline-none focus:border-pink-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSendingNotif}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
              >
                {isSendingNotif ? 'Broadcasting...' : 'Broadcast Official Notification'}
              </button>
            </form>
          </div>

          <div className="bg-[#140b13] border border-pink-500/20 rounded-xl p-5 flex flex-col gap-4">
            <h2 className="text-lg font-bold text-pink-400">Broadcast History</h2>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {notifications.map((n) => (
                <div key={n._id} className="p-3.5 bg-[#1a0e18] border border-pink-500/10 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="font-bold text-xs text-gray-200">{n.title}</h4>
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-mono uppercase">
                      Audience: {n.targetAudience}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 whitespace-pre-wrap">{n.content}</p>
                  <span className="text-[9px] text-gray-500 mt-2 block">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inbox List */}
          <div className="bg-[#140b13] border border-pink-500/20 rounded-xl p-4 flex flex-col gap-3">
            <h2 className="text-sm font-bold text-pink-400 uppercase tracking-wider">Support Inbox Queue</h2>
            <div className="space-y-2 overflow-y-auto max-h-[600px]">
              {supportQueue.map((conv) => {
                const isSelected = selectedQueueConv?.conversationId === conv.conversationId;
                return (
                  <div
                    key={conv.conversationId}
                    onClick={() => setSelectedQueueConv(conv)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected ? 'bg-pink-950/40 border-pink-500' : 'bg-[#1a0e18] border-pink-500/10 hover:border-pink-500/30'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-xs text-gray-200">
                        {conv.user?.displayName || conv.user?.username || 'User'}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mb-2">
                      {conv.lastMessage?.content || 'No messages'}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {conv.tags.map((t) => (
                        <span key={t} className="text-[9px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded font-bold">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conversation Detail & Reply */}
          <div className="lg:col-span-2 bg-[#140b13] border border-pink-500/20 rounded-xl p-5 flex flex-col justify-between h-[650px]">
            {selectedQueueConv ? (
              <>
                <div className="flex flex-col gap-4 overflow-y-auto flex-grow pr-2">
                  <div className="border-b border-pink-500/20 pb-3 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-base text-gray-100 flex items-center gap-2">
                        <span>{selectedQueueConv.user?.displayName}</span>
                        <span className="text-xs text-gray-400">({selectedQueueConv.user?.role})</span>
                      </h3>
                      <p className="text-xs text-gray-400">ID: {selectedQueueConv.conversationId}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Add tag..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        className="bg-[#1b0d19] border border-pink-500/30 rounded px-2 py-1 text-xs text-gray-200 outline-none"
                      />
                      <button onClick={handleAddTag} className="px-2.5 py-1 bg-pink-600 text-white rounded text-xs font-bold">
                        + Tag
                      </button>
                    </div>
                  </div>

                  {/* Issue Context Card if originated from report */}
                  {selectedQueueConv.issueContext && (
                    <div className="p-4 bg-red-950/20 border-l-4 border-red-500 rounded-lg flex flex-col gap-1 text-xs">
                      <div className="font-bold text-red-400 flex justify-between">
                        <span>⚠️ Reported Paid Service Context</span>
                        <span>Amount: 💎 {selectedQueueConv.issueContext.serviceAmount}</span>
                      </div>
                      <p className="text-gray-300"><strong>Provider:</strong> {selectedQueueConv.issueContext.providerStageName}</p>
                      <p className="text-gray-300"><strong>Reason:</strong> {selectedQueueConv.issueContext.reason}</p>
                      <p className="text-gray-300"><strong>User Report Details:</strong> {selectedQueueConv.issueContext.userReportText || 'None'}</p>
                      <p className="text-gray-400 text-[10px] mt-1">Report ID: {selectedQueueConv.issueContext.reportId}</p>
                    </div>
                  )}

                  <div className="p-4 bg-[#180d16] rounded-lg border border-pink-500/10 flex-grow overflow-y-auto space-y-3">
                    {isLoadingMessages ? (
                      <p className="text-xs text-gray-400 italic text-center py-4">Loading conversation history...</p>
                    ) : supportMessages.length === 0 ? (
                      <p className="text-xs text-gray-400 italic text-center py-4">No messages in this support conversation yet.</p>
                    ) : (
                      supportMessages.map((msg) => {
                        const isUserSender = msg.senderId === selectedQueueConv.user?.id;
                        const isSystem = msg.mediaType === 'system';
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${
                              isSystem ? 'items-center my-2' : isUserSender ? 'items-start' : 'items-end'
                            }`}
                          >
                            {isSystem ? (
                              <div className="px-3 py-1.5 bg-blue-950/40 border border-blue-500/30 rounded-lg text-center text-xs text-blue-300 max-w-md">
                                <span className="font-bold text-[10px] uppercase text-blue-400 block mb-0.5">Official System Notice</span>
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                              </div>
                            ) : (
                              <div className="max-w-[80%]">
                                <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1 font-semibold">
                                  <span>{isUserSender ? (selectedQueueConv.user?.displayName || 'User') : '🎧 Official Support'}</span>
                                  <span className="text-[9px] text-gray-500 font-mono">
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <div
                                  className={`p-3 rounded-xl text-xs leading-relaxed break-words ${
                                    isUserSender
                                      ? 'bg-[#1e0e1b] border border-pink-500/20 text-gray-200 rounded-tl-none'
                                      : 'bg-blue-600 text-white rounded-tr-none'
                                  }`}
                                >
                                  {msg.content}
                                  {msg.mediaUrl && (
                                    <div className="mt-2">
                                      {msg.mediaType === 'image' ? (
                                        <img src={msg.mediaUrl} alt="attachment" className="max-h-48 rounded object-cover" />
                                      ) : msg.mediaType === 'video' ? (
                                        <video src={msg.mediaUrl} controls className="max-h-48 rounded object-cover" />
                                      ) : (
                                        <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="underline text-blue-200">
                                          View Attachment
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-pink-500/20 flex gap-2">
                  <input
                    type="text"
                    placeholder="Type official support reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendSupportReply()}
                    className="flex-grow bg-[#1b0d19] border border-pink-500/30 rounded-lg p-2.5 text-xs text-gray-100 outline-none"
                  />
                  <button
                    onClick={handleSendSupportReply}
                    disabled={isReplying}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg"
                  >
                    Send Reply
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs">
                <span>🎧 Select a support conversation from the inbox queue to respond.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-2xl bg-[#140b13] border border-pink-500/20 rounded-xl p-6 flex flex-col gap-6">
          <h2 className="text-lg font-bold text-pink-400">Official Channel Identity Settings</h2>

          <div className="space-y-4">
            {/* Official Notifications Channel */}
            <div className="p-4 bg-[#1a0e18] border border-pink-500/10 rounded-lg flex flex-col gap-3">
              <h3 className="font-bold text-sm text-blue-400">Official Notifications Channel</h3>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-blue-500/40 shrink-0 bg-[#0f0810] flex items-center justify-center">
                  <img
                    src={config.notifications?.avatarUrl || '/icons/icon-192x192.png'}
                    alt="Notifications Avatar"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLElement).setAttribute('src', '/icons/icon-192x192.png'); }}
                  />
                </div>
                <div className="flex flex-col gap-1 flex-grow text-xs">
                  <span className="font-semibold text-gray-300">Avatar Image</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Paste image URL..."
                      value={config.notifications?.avatarUrl || ''}
                      onChange={(e) => setConfig((prev: any) => ({
                        ...prev,
                        notifications: { ...prev.notifications, avatarUrl: e.target.value }
                      }))}
                      className="flex-grow bg-[#1b0d19] border border-pink-500/30 rounded p-2 text-xs text-gray-200 outline-none"
                    />
                    <label className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold cursor-pointer transition-all shrink-0 flex items-center justify-center">
                      {isUploadingNotifAvatar ? 'Uploading...' : '📁 Upload'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadAvatar(e, 'notifications')}
                        disabled={isUploadingNotifAvatar}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-gray-400 block mb-1">Badge Type</label>
                  <select
                    value={config.notifications?.badgeType || 'blue'}
                    onChange={(e) => setConfig((prev: any) => ({
                      ...prev,
                      notifications: { ...prev.notifications, badgeType: e.target.value }
                    }))}
                    className="w-full bg-[#1b0d19] border border-pink-500/30 rounded p-2 text-xs text-gray-100 outline-none"
                  >
                    <option value="blue">🔵 Blue Official Check</option>
                    <option value="gold">🟡 Gold Official Badge</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Official Customer Support Channel */}
            <div className="p-4 bg-[#1a0e18] border border-pink-500/10 rounded-lg flex flex-col gap-3">
              <h3 className="font-bold text-sm text-blue-400">Official Customer Support Channel</h3>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-blue-500/40 shrink-0 bg-[#0f0810] flex items-center justify-center">
                  <img
                    src={config.support?.avatarUrl || '/icons/icon-192x192.png'}
                    alt="Support Avatar"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLElement).setAttribute('src', '/icons/icon-192x192.png'); }}
                  />
                </div>
                <div className="flex flex-col gap-1 flex-grow text-xs">
                  <span className="font-semibold text-gray-300">Avatar Image</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Paste image URL..."
                      value={config.support?.avatarUrl || ''}
                      onChange={(e) => setConfig((prev: any) => ({
                        ...prev,
                        support: { ...prev.support, avatarUrl: e.target.value }
                      }))}
                      className="flex-grow bg-[#1b0d19] border border-pink-500/30 rounded p-2 text-xs text-gray-200 outline-none"
                    />
                    <label className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold cursor-pointer transition-all shrink-0 flex items-center justify-center">
                      {isUploadingSupportAvatar ? 'Uploading...' : '📁 Upload'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadAvatar(e, 'support')}
                        disabled={isUploadingSupportAvatar}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-gray-400 block mb-1">Badge Type</label>
                  <select
                    value={config.support?.badgeType || 'blue'}
                    onChange={(e) => setConfig((prev: any) => ({
                      ...prev,
                      support: { ...prev.support, badgeType: e.target.value }
                    }))}
                    className="w-full bg-[#1b0d19] border border-pink-500/30 rounded p-2 text-xs text-gray-100 outline-none"
                  >
                    <option value="blue">🔵 Blue Official Check</option>
                    <option value="gold">🟡 Gold Official Badge</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleSaveConfig}
            disabled={isSavingConfig}
            className="py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-2"
          >
            {isSavingConfig ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Saving Channel Identities...</span>
              </>
            ) : (
              'Save Channel Identities'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminOfficialChannels;
