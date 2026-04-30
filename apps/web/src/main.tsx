import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "sonner";
import "./index.css";
import { ThemeProvider } from "@/lib/theme-provider";
import { queryClient } from "@/lib/query-client";
import { Spinner } from "@/components/ui/spinner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageContainer } from "./components/page-container";
import { Button } from "@/components/ui/button";
import { ErrorFallback } from "@/components/error-fallback";
import { RouteProtector } from "@/components/route-protector";

const RootLayout = lazy(async () => ({
  default: (await import("@/components/root-layout")).RootLayout,
}));

const LoginPage = lazy(async () => ({
  default: (await import("@/page/login")).LoginPage,
}));

const TodayPage = lazy(async () => ({
  default: (await import("@/page/today")).TodayPage,
}));

const WeekPage = lazy(async () => ({
  default: (await import("@/page/week")).WeekPage,
}));

const CalendarPage = lazy(async () => ({
  default: (await import("@/page/calendar")).CalendarPage,
}));

const LogsPage = lazy(async () => ({
  default: (await import("@/page/logs")).LogsPage,
}));

const ProfileIntegrationPopupPage = lazy(async () => ({
  default: (await import("@/page/profile-integration-popup")).ProfileIntegrationPopupPage,
}));

const ProfilePage = lazy(async () => ({
  default: (await import("@/page/profile")).ProfilePage,
}));

const AdminPage = lazy(async () => ({
  default: (await import("@/page/admin")).AdminPage,
}));

const ReportsPage = lazy(async () => ({
  default: (await import("@/page/reports")).ReportsPage,
}));

const TeamReportsPage = lazy(async () => ({
  default: (await import("@/page/team-reports")).TeamReportsPage,
}));
const NotFoundPage = () => {
  return (
    <PageContainer className="min-h-screen min-w-screen flex justify-center items-center gap-5 text-4xl">
      <>
        Page could not be found
        <Button>
          <Link to="/">Go Home</Link>
        </Button>
      </>
    </PageContainer>
  );
};

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: undefined,
  };
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary
    FallbackComponent={ErrorFallback}
    onReset={() => window.location.reload()}
    onError={(error, info) => {
      const errorDetails = getErrorDetails(error);
      console.error("Error caught by boundary:", {
        ...errorDetails,
        componentStack: info.componentStack,
      });
    }}
  >
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <BrowserRouter>
            <Toaster position="top-center" richColors />
            <Suspense
              fallback={
                <PageContainer className="grid place-items-center min-h-screen">
                  <Spinner />
                </PageContainer>
              }
            >
              <Routes>
                <Route path="/" element={<RootLayout />}>
                  <Route index element={<LoginPage />} />
                  <Route element={<RouteProtector />}>
                    <Route path="calendar" element={<CalendarPage />} />
                    <Route path="today" element={<TodayPage />} />
                    <Route path="week" element={<WeekPage />} />
                    <Route path="logs" element={<LogsPage />} />
                    <Route
                      path="profile/integration-popup"
                      element={<ProfileIntegrationPopupPage />}
                    />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="admin" element={<AdminPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route
                      element={
                        <RouteProtector allowedRoles={["manager", "admin"]} />
                      }
                    >
                      <Route path="reports/team" element={<TeamReportsPage />} />
                    </Route>
                    <Route
                      path="dashboard"
                      element={<Navigate to="/today" replace />}
                    />
                  </Route>
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>,
);
