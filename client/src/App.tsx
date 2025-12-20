import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import HomePage from "@/pages/HomePage";
import CMSPage from "@/pages/CMSPage";
import MycoBlitzPage from "@/pages/MycoBlitzPage";
import NetworkPage from "@/pages/NetworkPage";
import HabitatPage from "@/pages/HabitatPage";
import ProtocolsPage from "@/pages/ProtocolsPage";
import MembershipPage from "@/pages/MembershipPage";
import Dashboard from "@/pages/Dashboard";
import ActivityFeed from "@/pages/ActivityFeed";
import Geospatial from "@/pages/Geospatial";
import TopProspects from "@/pages/TopProspects";
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
import FieldGuides from "@/pages/FieldGuides";
import FieldGuideCreate from "@/pages/FieldGuideCreate";
import FieldGuideDetail from "@/pages/FieldGuideDetail";
import SpeciesImageGallery from "@/pages/SpeciesImageGallery";
import ApiDocumentation from "@/pages/ApiDocumentation";
import NotFound from "@/pages/not-found";

const publicPaths = [
  '/', '/network', '/mycoblitz', '/habitat', '/protocols', '/membership',
  '/about', '/partners', '/contact', '/edna', '/barcoding', '/join'
];

const networkSubpages = ['/network/ac', '/network/bc', '/network/ca', '/network/mi'];

function AppRouter() {
  const [location] = useLocation();
  const isPublicRoute = publicPaths.includes(location) || 
    networkSubpages.some(path => location.startsWith(path)) ||
    location.startsWith('/network/');

  if (isPublicRoute) {
    return (
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/network/:region">{(params) => <CMSPage slug={`network-${params.region}`} />}</Route>
        <Route path="/network" component={NetworkPage} />
        <Route path="/mycoblitz" component={MycoBlitzPage} />
        <Route path="/habitat" component={HabitatPage} />
        <Route path="/protocols" component={ProtocolsPage} />
        <Route path="/membership" component={MembershipPage} />
        <Route path="/about"><CMSPage slug="about" /></Route>
        <Route path="/partners"><CMSPage slug="partners" /></Route>
        <Route path="/contact"><CMSPage slug="contact" /></Route>
        <Route path="/edna"><CMSPage slug="edna" /></Route>
        <Route path="/barcoding"><CMSPage slug="barcoding" /></Route>
        <Route path="/join"><CMSPage slug="join" /></Route>
      </Switch>
    );
  }

  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/activity" component={ActivityFeed} />
        <Route path="/activity-feed" component={ActivityFeed} />
        <Route path="/geospatial" component={Geospatial} />
        <Route path="/geospatial/top-prospects" component={TopProspects} />
        <Route path="/field-guides" component={FieldGuides} />
        <Route path="/field-guides/create" component={FieldGuideCreate} />
        <Route path="/field-guides/:id/species/:scientificName" component={SpeciesImageGallery} />
        <Route path="/field-guides/:id" component={FieldGuideDetail} />
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
        <Route path="/api-docs" component={ApiDocumentation} />
        <Route path="/species/:name" component={SpeciesDetail} />
        <Route path="/species" component={Species} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppRouter />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
