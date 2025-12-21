import { PublicLayout } from "@/components/PublicLayout";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { User, Settings, FlaskConical, Mail, Shield, Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearch } from "wouter";

export default function ProfilePage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const initialTab = params.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    const newTab = params.get('tab') || 'profile';
    setActiveTab(newTab);
  }, [searchString]);

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-myco-green"></div>
        </div>
      </PublicLayout>
    );
  }

  if (!user) {
    return null;
  }

  const userInitials = user.firstName && user.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user.email?.[0]?.toUpperCase() || 'U';

  const displayName = user.firstName && user.lastName 
    ? `${user.firstName} ${user.lastName}`
    : user.email || 'User';

  return (
    <PublicLayout>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center gap-4 mb-8">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.profileImageUrl || undefined} alt={displayName} />
              <AvatarFallback className="bg-myco-green text-white text-2xl">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold text-myco-brown" data-testid="text-profile-name">
                {displayName}
              </h1>
              <p className="text-gray-600">{user.email}</p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile" className="flex items-center gap-2" data-testid="tab-profile">
                <User className="h-4 w-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2" data-testid="tab-settings">
                <Settings className="h-4 w-4" />
                Account Settings
              </TabsTrigger>
              <TabsTrigger value="specimens" className="flex items-center gap-2" data-testid="tab-specimens">
                <FlaskConical className="h-4 w-4" />
                Specimen Submission
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-myco-green" />
                    Profile Information
                  </CardTitle>
                  <CardDescription>
                    Your public profile information visible to other members
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input 
                        id="firstName" 
                        defaultValue={user.firstName || ''} 
                        data-testid="input-firstname"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input 
                        id="lastName" 
                        defaultValue={user.lastName || ''} 
                        data-testid="input-lastname"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      defaultValue={user.email || ''} 
                      disabled
                      className="bg-gray-100"
                      data-testid="input-email"
                    />
                    <p className="text-sm text-gray-500">Email is managed through your Replit account</p>
                  </div>
                  
                  <Separator />
                  
                  <h3 className="text-lg font-semibold text-myco-brown">Community Platform Usernames</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Link your accounts from other mycology platforms to connect your observations
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="iNaturalistUsername">iNaturalist Username</Label>
                      <Input 
                        id="iNaturalistUsername" 
                        placeholder="Your iNaturalist username"
                        defaultValue={user.iNaturalistUsername || ''} 
                        data-testid="input-inaturalist-username"
                      />
                      <p className="text-xs text-gray-500">e.g., naturalist_jane</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mushroomObserverUsername">Mushroom Observer Username</Label>
                      <Input 
                        id="mushroomObserverUsername" 
                        placeholder="Your Mushroom Observer username"
                        defaultValue={user.mushroomObserverUsername || ''} 
                        data-testid="input-mushroom-observer-username"
                      />
                      <p className="text-xs text-gray-500">e.g., fungi_finder</p>
                    </div>
                  </div>
                  
                  <Separator />
                  <Button className="bg-myco-green hover:bg-myco-green/90" data-testid="button-save-profile">
                    Save Profile
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-myco-green" />
                    Account Settings
                  </CardTitle>
                  <CardDescription>
                    Manage your account preferences and privacy settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Bell className="h-5 w-5 text-myco-brown" />
                        <div>
                          <p className="font-medium">Email Notifications</p>
                          <p className="text-sm text-gray-500">Receive updates about your specimens and network activity</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" data-testid="button-notifications">
                        Manage
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-myco-brown" />
                        <div>
                          <p className="font-medium">Privacy Settings</p>
                          <p className="text-sm text-gray-500">Control who can see your profile and contributions</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" data-testid="button-privacy">
                        Manage
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-myco-brown" />
                        <div>
                          <p className="font-medium">Newsletter Preferences</p>
                          <p className="text-sm text-gray-500">Manage your subscription to MycoMap newsletters</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" data-testid="button-newsletter">
                        Manage
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="pt-4">
                    <h3 className="text-lg font-semibold text-red-600 mb-2">Danger Zone</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Irreversible actions that affect your account
                    </p>
                    <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" data-testid="button-delete-account">
                      Delete Account
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="specimens">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-myco-green" />
                    Specimen Submission
                  </CardTitle>
                  <CardDescription>
                    Submit fungal specimens for DNA barcoding analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <FlaskConical className="h-16 w-16 text-myco-green/30 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-myco-brown mb-2">
                      Specimen Submission Coming Soon
                    </h3>
                    <p className="text-gray-600 max-w-md mx-auto mb-6">
                      We're building a streamlined process for you to submit specimens for DNA barcoding. 
                      This feature will allow you to track your submissions, view sequencing results, 
                      and contribute to the MycoMap Network database.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <Button variant="outline" asChild data-testid="link-protocols">
                        <a href="/protocols">View Collection Protocols</a>
                      </Button>
                      <Button className="bg-myco-green hover:bg-myco-green/90" asChild data-testid="link-join">
                        <a href="/join">Become a Supporter</a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PublicLayout>
  );
}
