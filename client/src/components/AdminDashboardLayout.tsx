import { AdminSidebar } from "./AdminSidebar";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Lock } from "lucide-react";

interface AdminDashboardLayoutProps {
  children: React.ReactNode;
}

export function AdminDashboardLayout({ children }: AdminDashboardLayoutProps) {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('adminAuthenticated') === 'true';
    }
    return false;
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setIsPasswordDialogOpen(true);
    }
  }, [isAuthenticated]);

  const handlePasswordSubmit = () => {
    if (password === "mycotalab") {
      setIsAuthenticated(true);
      localStorage.setItem('adminAuthenticated', 'true');
      setIsPasswordDialogOpen(false);
      setPassword("");
      setPasswordError("");
    } else {
      setPasswordError("Incorrect password. Please try again.");
      setPassword("");
    }
  };

  const handleClose = () => {
    setIsPasswordDialogOpen(false);
    setPassword("");
    setPasswordError("");
    window.location.href = '/dashboard';
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Dialog open={isPasswordDialogOpen} onOpenChange={(open) => {
          if (!open) handleClose();
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Admin Access Required
              </DialogTitle>
              <DialogDescription>
                Please enter the admin password to access the admin panel and its features.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePasswordSubmit();
                    }
                  }}
                  placeholder="Enter admin password"
                  autoFocus
                  data-testid="input-admin-password"
                />
                {passwordError && (
                  <p className="text-sm text-red-600">{passwordError}</p>
                )}
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={handleClose}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handlePasswordSubmit}
                  data-testid="button-access-admin"
                >
                  Access Admin
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto relative">
        {children}
      </main>
    </div>
  );
}
