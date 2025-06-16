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
import Conservation from "@/pages/Conservation";
import Species from "@/pages/Species";
import SpeciesDetail from "@/pages/SpeciesDetail";
import Records from "@/pages/Records";
import Updates from "@/pages/Updates";
import StatesGlobalFirsts from "@/pages/StatesGlobalFirsts";
import ContributorsGlobalFirsts from "@/pages/ContributorsGlobalFirsts";
import ContributorsStateFirsts from "@/pages/ContributorsStateFirsts";
import MostObservations from "@/pages/MostObservations";
import MostSpecies from "@/pages/MostSpecies";
import PhylumDetail from "@/pages/PhylumDetail";
import FamilyDetail from "@/pages/FamilyDetail";
import ClassDetail from "@/pages/ClassDetail";
import OrderDetail from "@/pages/OrderDetail";
import GenusDetail from "@/pages/GenusDetail";
import Admin from "@/pages/Admin";
import AdminValidation from "@/pages/admin/AdminValidation";
import BioRecordManagement from "@/pages/admin/BioRecordManagement";
import AdminUpload from "@/pages/admin/AdminUpload";
import AdminRedList from "@/pages/admin/AdminRedList";
import AdminSettings from "@/pages/admin/AdminSettings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/activity" component={ActivityFeed} />
      <Route path="/activity-feed" component={ActivityFeed} />
      <Route path="/geospatial" component={Geospatial} />
      <Route path="/temporal" component={Temporal} />
      <Route path="/taxonomic" component={Taxonomic} />
      <Route path="/taxonomic/phylum" component={PhylumDetail} />
      <Route path="/taxonomic/family" component={FamilyDetail} />
      <Route path="/taxonomic/class" component={ClassDetail} />
      <Route path="/taxonomic/order" component={OrderDetail} />
      <Route path="/taxonomic/genus" component={GenusDetail} />
      <Route path="/conservation" component={Conservation} />
      <Route path="/contributors" component={Contributors} />
      <Route path="/records" component={Records} />
      <Route path="/records/states-global-firsts" component={StatesGlobalFirsts} />
      <Route path="/records/contributors-global-firsts" component={ContributorsGlobalFirsts} />
      <Route path="/records/contributors-state-firsts" component={ContributorsStateFirsts} />
      <Route path="/records/most-observations" component={MostObservations} />
      <Route path="/records/most-species" component={MostSpecies} />
      <Route path="/updates" component={Updates} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/validation" component={AdminValidation} />
      <Route path="/admin/biorecords" component={BioRecordManagement} />
      <Route path="/admin/upload" component={AdminUpload} />
      <Route path="/admin/redlist" component={AdminRedList} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/species/:name" component={SpeciesDetail} />
      <Route path="/species" component={Species} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex flex-col lg:flex-row h-screen bg-slate-50">
          <Sidebar />
          <main className="flex-1 overflow-y-auto relative">
            <Router />
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
