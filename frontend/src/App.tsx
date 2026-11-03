import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { OtpVerifyPage } from './pages/OtpVerifyPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
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
import { SettingsPage } from './pages/SettingsPage';
import { NewCirclePage, NewGroupPage } from './pages/NewCirclePage';
import { InfoPage } from './pages/InfoPage';
import { NewCompanionPage } from './pages/NewCompanionPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/otp" element={<OtpVerifyPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/a" element={<SentinelHomePage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/confirm-email" element={<ConfirmEmailChangePage />} />

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
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:alertId" element={<HistoryPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:userId" element={<ConversationPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/info" element={<InfoPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
