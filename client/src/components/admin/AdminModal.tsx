import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileUpload } from "./FileUpload";
import { UploadHistory } from "./UploadHistory";
import { ProcessingStatus } from "./ProcessingStatus";
import { RedListUpload } from "./RedListUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface AdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AdminModal({ open, onOpenChange }: AdminModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl">Admin Panel</DialogTitle>
              <p className="text-slate-600">Manage data uploads and system settings</p>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <FileUpload />
          <UploadHistory />
          <ProcessingStatus />
        </div>

        {/* Red List Management */}
        <div className="mt-8">
          <RedListUpload />
        </div>

        {/* System Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Database Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                <span className="text-sm text-slate-700">Healthy</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">Last backup: 2 hours ago</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Storage Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="flex-1 bg-slate-200 rounded-full h-2 mr-3">
                  <div className="bg-primary h-2 rounded-full w-[65%]"></div>
                </div>
                <span className="text-sm text-slate-700">65%</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">2.8GB of 4.3GB used</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">API Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                <span className="text-sm text-slate-700">Operational</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">Response time: 245ms</p>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
