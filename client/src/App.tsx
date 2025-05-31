import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/ui/sidebar";
import { useState } from "react";
import Dashboard from "@/pages/Dashboard";
import ActivityFeed from "@/pages/ActivityFeed";
import Geospatial from "@/pages/Geospatial";
import Temporal from "@/pages/Temporal";
import Taxonomic from "@/pages/Taxonomic";
import Contributors from "@/pages/Contributors";
import Species from "@/pages/Species";
import SpeciesDetail from "@/pages/SpeciesDetail";
import Records from "@/pages/Records";
import StatesGlobalFirsts from "@/pages/StatesGlobalFirsts";
import ContributorsGlobalFirsts from "@/pages/ContributorsGlobalFirsts";
import MostObservations from "@/pages/MostObservations";
import MostSpecies from "@/pages/MostSpecies";
import AdminModal from "@/components/admin/AdminModal";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/activity" component={ActivityFeed} />
      <Route path="/geospatial" component={Geospatial} />
      <Route path="/temporal" component={Temporal} />
      <Route path="/taxonomic" component={Taxonomic} />
      <Route path="/contributors" component={Contributors} />
      <Route path="/records" component={Records} />
      <Route path="/records/states-global-firsts" component={StatesGlobalFirsts} />
      <Route path="/records/contributors-global-firsts" component={ContributorsGlobalFirsts} />
      <Route path="/records/most-observations" component={MostObservations} />
      <Route path="/records/most-species" component={MostSpecies} />
      <Route path="/species/:name" component={SpeciesDetail} />
      <Route path="/species" component={Species} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
          <Sidebar onOpenAdmin={() => setAdminModalOpen(true)} />
          <main className="flex-1 overflow-hidden">
            <Router />
          </main>
          <AdminModal 
            open={adminModalOpen} 
            onOpenChange={setAdminModalOpen} 
          />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
