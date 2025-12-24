import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminDashboardLayout } from "@/components/AdminDashboardLayout";
import HomePage from "@/pages/HomePage";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import CMSPage from "@/pages/CMSPage";
import MycoBlitzPage from "@/pages/MycoBlitzPage";
import NetworkPage from "@/pages/NetworkPage";
import HabitatPage from "@/pages/HabitatPage";
import ProtocolsPage from "@/pages/ProtocolsPage";
import TempCodeGuidelinesPage from "@/pages/TempCodeGuidelinesPage";
import MembershipPage from "@/pages/MembershipPage";
import Dashboard from "@/pages/Dashboard";
import ActivityFeed from "@/pages/ActivityFeed";
import ForagingMap from "@/pages/ForagingMap";
import FitnessTracker from "@/pages/FitnessTracker";
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
import AdminValidation from "@/pages/admin/AdminValidation";
import BioRecordManagement from "@/pages/admin/BioRecordManagement";
import AdminUpload from "@/pages/admin/AdminUpload";
import AdminRedList from "@/pages/admin/AdminRedList";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminCMSPage from "@/pages/admin/AdminCMSPage";
import ForagingLists from "@/pages/admin/ForagingLists";
import AdminShipmentsPage from "@/pages/admin/AdminShipmentsPage";
import AdminShipmentDetailPage from "@/pages/admin/AdminShipmentDetailPage";
import AdminRunsPage from "@/pages/admin/AdminRunsPage";
import AdminRunDetailPage from "@/pages/admin/AdminRunDetailPage";
import AdminPlateEditorPage from "@/pages/admin/AdminPlateEditorPage";
import AdminPendingPlatesPage from "@/pages/admin/AdminPendingPlatesPage";
import AdminPendingPlateEditorPage from "@/pages/admin/AdminPendingPlateEditorPage";
import AdminIndexManagementPage from "@/pages/admin/AdminIndexManagementPage";
import AdminPrimerManagementPage from "@/pages/admin/AdminPrimerManagementPage";
import AdminBioinformaticsPage from "@/pages/admin/AdminBioinformaticsPage";
import AdminShippingOptionsPage from "@/pages/admin/AdminShippingOptionsPage";
import AdminFungariumOverview from "@/pages/admin/AdminFungariumOverview";
import AdminSpecimensPage from "@/pages/admin/AdminSpecimensPage";
import AdminSpecimenRequestsPage from "@/pages/admin/AdminSpecimenRequestsPage";
import AdminMenuManager from "@/pages/admin/AdminMenuManager";
import FieldGuides from "@/pages/FieldGuides";
import FieldGuideCreate from "@/pages/FieldGuideCreate";
import FieldGuideDetail from "@/pages/FieldGuideDetail";
import SpeciesImageGallery from "@/pages/SpeciesImageGallery";
import ApiDocumentation from "@/pages/ApiDocumentation";
import NotFound from "@/pages/not-found";
import ProfilePage from "@/pages/ProfilePage";
import ShipmentPage from "@/pages/ShipmentPage";
import FungariumAbout from "@/pages/FungariumAbout";
import FungariumSearch from "@/pages/FungariumSearch";
import FungariumRequest from "@/pages/FungariumRequest";

const publicPaths = [
  '/', '/network', '/mycoblitz', '/habitat', '/protocols', '/temp-code-guidelines', '/join',
  '/about', '/partners', '/contact', '/edna', '/barcoding', '/profile', '/shipment',
  '/fungarium', '/fungarium/about', '/fungarium/search', '/fungarium/request'
];

const networkSubpages = ['/network/ac', '/network/bc', '/network/ca', '/network/mi'];

function AppRouter() {
  const [location] = useLocation();
  const isPublicRoute = publicPaths.includes(location) || 
    networkSubpages.some(path => location.startsWith(path)) ||
    location.startsWith('/network/') ||
    location.startsWith('/shipment');
  const isAdminRoute = location.startsWith('/admin');

  if (isPublicRoute) {
    return (
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/network/:region">{(params) => <CMSPage slug={`network-${params.region}`} />}</Route>
        <Route path="/network" component={NetworkPage} />
        <Route path="/mycoblitz" component={MycoBlitzPage} />
        <Route path="/habitat" component={HabitatPage} />
        <Route path="/protocols" component={ProtocolsPage} />
        <Route path="/temp-code-guidelines" component={TempCodeGuidelinesPage} />
        <Route path="/join" component={MembershipPage} />
        <Route path="/about"><CMSPage slug="about" /></Route>
        <Route path="/partners"><CMSPage slug="partners" /></Route>
        <Route path="/contact"><CMSPage slug="contact" /></Route>
        <Route path="/edna"><CMSPage slug="edna" /></Route>
        <Route path="/barcoding"><CMSPage slug="barcoding" /></Route>
        <Route path="/profile" component={ProfilePage} />
        <Route path="/shipment/:id?" component={ShipmentPage} />
        <Route path="/fungarium/about" component={FungariumAbout} />
        <Route path="/fungarium/search" component={FungariumSearch} />
        <Route path="/fungarium/request" component={FungariumRequest} />
        <Route path="/fungarium" component={FungariumAbout} />
      </Switch>
    );
  }

  if (isAdminRoute) {
    return (
      <AdminDashboardLayout>
        <Switch>
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/validation" component={AdminValidation} />
          <Route path="/admin/biorecords" component={BioRecordManagement} />
          <Route path="/admin/upload" component={AdminUpload} />
          <Route path="/admin/redlist" component={AdminRedList} />
          <Route path="/admin/settings" component={AdminSettings} />
          <Route path="/admin/cms" component={AdminCMSPage} />
          <Route path="/admin/foraging-lists" component={ForagingLists} />
          <Route path="/admin/shipments" component={AdminShipmentsPage} />
          <Route path="/admin/shipments/:id" component={AdminShipmentDetailPage} />
          <Route path="/admin/pending-plates" component={AdminPendingPlatesPage} />
          <Route path="/admin/pending-plates/:id" component={AdminPendingPlateEditorPage} />
          <Route path="/admin/runs" component={AdminRunsPage} />
          <Route path="/admin/runs/:id" component={AdminRunDetailPage} />
          <Route path="/admin/plates/:id" component={AdminPlateEditorPage} />
          <Route path="/admin/index-management" component={AdminIndexManagementPage} />
          <Route path="/admin/primer-management" component={AdminPrimerManagementPage} />
          <Route path="/admin/bioinformatics" component={AdminBioinformaticsPage} />
          <Route path="/admin/shipping-options" component={AdminShippingOptionsPage} />
          <Route path="/admin/fungarium" component={AdminFungariumOverview} />
          <Route path="/admin/specimens" component={AdminSpecimensPage} />
          <Route path="/admin/specimen-requests" component={AdminSpecimenRequestsPage} />
          <Route path="/admin/menu" component={AdminMenuManager} />
          <Route component={NotFound} />
        </Switch>
      </AdminDashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/activity" component={ActivityFeed} />
        <Route path="/activity-feed" component={ActivityFeed} />
        <Route path="/foraging-map" component={ForagingMap} />
        <Route path="/fitness-tracker" component={FitnessTracker} />
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
