import { Routes, Route } from "react-router-dom";
import Onboarding from "../Onboarding/Onboarding";
import ProfileCreation from "../ProfileCreation/ProfileCreation";
import Auth from "../Auth/Auth";
import UserProfileView from "../UserProfileView/UserProfileView";
import Settings from "../Settings/Settings";
import ChatInterface from "../ChatInterface/ChatInterface";
import DirectMessage from "../DirectMessage/DirectMessage";
import Discovery from "../Discovery/Discovery";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Onboarding />} />
      <Route path="/profile" element={<ProfileCreation />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/discovery" element={<Discovery />} />
      <Route path="/my-profile" element={<UserProfileView />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/chat" element={<ChatInterface />} />
      <Route path="/direct-message" element={<DirectMessage />} />
    </Routes>
  );
}

export default App;
