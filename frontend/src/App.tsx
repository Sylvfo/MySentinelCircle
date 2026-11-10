import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { OtpVerifyPage } from './pages/OtpVerifyPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { RecoverPhonePage } from './pages/RecoverPhonePage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ConfirmEmailChangePage } from './pages/ConfirmEmailChangePage';
import { WelcomePage } from './pages/WelcomePage';
import { NewPasswordPage } from './pages/NewPasswordPage';
import { SentinelHomePage } from './pages/SentinelHomePage';
import { DashboardPage } from './pages/DashboardPage';
import { CirclesPage } from './pages/CirclesPage';
import { CompanionsPage } from './pages/CompanionsPage';
import { AlertsPage } from './pages/AlertsPage';
import { RunningAlertPage } from './pages/RunningAlertPage';
import { HistoryPage } from './pages/HistoryPage';
import { ConversationPage } from './pages/ConversationPage';
import { MessagesPage } from './pages/MessagesPage';
import { AlertChatPage, AlertChatRedirect } from './pages/AlertChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { NewCirclePage, NewGroupPage } from './pages/NewCirclePage';
import { InfoPage } from './pages/InfoPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { PersonPage } from './pages/PersonPage';
import { LegalPage } from './pages/legal/LegalPage';
import { PlansPage } from './pages/PlansPage';
import { NewCompanionPage } from './pages/NewCompanionPage';
import { AdminPage } from './pages/AdminPage';
import { WatchModePage } from './pages/watch/WatchModePage';
import { NewTripPage } from './pages/watch/NewTripPage';
import { TripPage } from './pages/watch/TripPage';
import { ValidateStepPage } from './pages/watch/ValidateStepPage';
import { AllGoodPage } from './pages/watch/AllGoodPage';
import { EndTripPage } from './pages/watch/EndTripPage';
import { ConnectPage } from './pages/connect/ConnectPage';
import { ConnectPersonPage } from './pages/connect/ConnectPersonPage';
import { LabPage } from './pages/lab/LabPage';
import { LabFramePage } from './pages/lab/LabFramePage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/otp" element={<OtpVerifyPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/a" element={<SentinelHomePage />} />
        {/* Test lab (dev only: its backend routes exist only then). */}
        <Route path="/lab" element={<LabPage />} />
        <Route path="/lab/frame" element={<LabFramePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/recover-phone" element={<RecoverPhonePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/confirm-email" element={<ConfirmEmailChangePage />} />
        <Route path="/privacy" element={<LegalPage doc="privacy" />} />
        <Route path="/terms" element={<LegalPage doc="terms" />} />
        <Route path="/legal-notice" element={<LegalPage doc="legal" />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/new-password" element={<NewPasswordPage />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/circles" element={<CirclesPage />} />
            <Route path="/circles/new" element={<NewCirclePage />} />
            <Route path="/circles/new-group" element={<NewGroupPage />} />
            <Route path="/circles/:circleId" element={<CirclesPage />} />
            <Route path="/companions" element={<CompanionsPage />} />
            <Route path="/companions/new" element={<NewCompanionPage />} />
            <Route path="/companions/:linkId" element={<CompanionsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/alerts/:kind" element={<AlertsPage />} />
            <Route path="/running-alert" element={<RunningAlertPage />} />
            <Route path="/running-alert/:alertId" element={<RunningAlertPage />} />
            {/* The alert's chats live in Messages now: old links redirect. */}
            <Route path="/running-alert/:alertId/chat" element={<AlertChatRedirect />} />
            {/* Watch Mode: a trip or an All Good Check. */}
            <Route path="/watch" element={<WatchModePage />} />
            <Route path="/watch/trip/new" element={<NewTripPage />} />
            <Route path="/watch/all-good" element={<AllGoodPage />} />
            <Route path="/watch/:watchId" element={<TripPage />} />
            <Route path="/watch/:watchId/validate" element={<ValidateStepPage />} />
            <Route path="/watch/:watchId/end" element={<EndTripPage />} />
            {/* Code QR: add someone (my code, scan, or a number). */}
            <Route path="/connect" element={<ConnectPage />} />
            <Route path="/connect/:code" element={<ConnectPersonPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:alertId" element={<HistoryPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/alert/:conversationId" element={<AlertChatPage />} />
            <Route path="/messages/:userId" element={<ConversationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/info" element={<InfoPage />} />
            <Route path="/feedback" element={<FeedbackPage />} />
            <Route path="/people/:userId" element={<PersonPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
