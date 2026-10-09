import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectPage from './pages/ProjectPage';
import WorkflowPage from './pages/WorkflowPage';
import SeriesPage from './pages/SeriesPage';
import BubbleTestPage from './pages/BubbleTestPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import FaqPage from './pages/FaqPage';
import PacketsPage from './pages/PacketsPage';
import LandingPage from './pages/LandingPage';
import ViewerPage from './pages/ViewerPage';
import AdminPage from './pages/AdminPage';
import InquiryListPage from './pages/InquiryListPage';
import InquiryNewPage from './pages/InquiryNewPage';
import InquiryDetailPage from './pages/InquiryDetailPage';
import SettingsPage from './pages/SettingsPage';
import AuthorPage from './pages/AuthorPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import NotificationsPage from './pages/NotificationsPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">로딩 중...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/my" replace /> : <LoginPage />} />
      <Route path="/login/callback/:provider" element={<OAuthCallbackPage />} />
      <Route path="/bubble-test" element={<BubbleTestPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/view/:shareToken" element={<ViewerPage />} />
      <Route path="/u/:nickname" element={<AuthorPage />} />
      <Route path="/admin/*" element={<AdminPage />} />

      {/* 랜딩 = 로그인 여부와 무관한 공개 홈(추천·전체 갤러리). 내 작품 대시보드는 /my */}
      <Route path="/" element={<LandingPage />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/my" element={<DashboardPage />} />
        <Route path="/subscriptions" element={<SubscriptionsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/projects/:projectId" element={<ProjectPage />} />
        <Route path="/projects/:projectId/episodes/:episodeId/workflow" element={<WorkflowPage />} />
        <Route path="/projects/:projectId/series/:seriesId" element={<SeriesPage />} />
        <Route path="/packets" element={<PacketsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/inquiries" element={<InquiryListPage />} />
        <Route path="/inquiries/new" element={<InquiryNewPage />} />
        <Route path="/inquiries/:inquiryId" element={<InquiryDetailPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/WEBTOON">
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
