import "@/App.css";
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { PlatformAuthProvider } from "@/context/PlatformAuthContext";
import TenantLayout from "@/context/TenantContext";
import Protected from "@/components/Protected";
import PlatformProtected from "@/components/PlatformProtected";

import Landing from "@/pages/Landing";
import Booking from "@/pages/Booking";
import ManageBooking from "@/pages/ManageBooking";
import Login from "@/pages/admin/Login";
import AdminLayout from "@/pages/admin/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import Bookings from "@/pages/admin/Bookings";
import Availability from "@/pages/admin/Availability";
import AppointmentTypes from "@/pages/admin/AppointmentTypes";
import Admins from "@/pages/admin/Admins";
import Settings from "@/pages/admin/Settings";
import Account from "@/pages/admin/Account";
import Customise from "@/pages/admin/Customise";
import Locations from "@/pages/admin/Locations";
import Branding from "@/pages/admin/Branding";
import Waitlist from "@/pages/admin/Waitlist";
import Analytics from "@/pages/admin/Analytics";
import Customers from "@/pages/admin/Customers";
import HelpGuide from "@/pages/admin/HelpGuide";

import PlatformLogin from "@/pages/platform/PlatformLogin";
import PlatformDashboard from "@/pages/platform/PlatformDashboard";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <PlatformAuthProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Landing />} />

              {/* Platform (SaaS owner) */}
              <Route path="/superadmin" element={<PlatformLogin />} />
              <Route path="/superadmin/app" element={<PlatformProtected><PlatformDashboard /></PlatformProtected>} />

              {/* Tenant space (path-based) */}
              <Route path="/:tenant" element={<TenantLayout />}>
                <Route index element={<Booking />} />
                <Route path="booking/:reference" element={<ManageBooking />} />
                <Route path="admin/login" element={<Login />} />
                <Route path="admin" element={<Protected><AdminLayout /></Protected>}>
                  <Route index element={<Dashboard />} />
                  <Route path="bookings" element={<Bookings />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="availability" element={<Availability />} />
                  <Route path="appointment-types" element={<AppointmentTypes />} />
                  <Route path="locations" element={<Locations />} />
                  <Route path="customise" element={<Customise />} />
                  <Route path="branding" element={<Branding />} />
                  <Route path="waitlist" element={<Waitlist />} />
                  <Route path="admins" element={<Admins />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="account" element={<Account />} />
                  <Route path="help" element={<HelpGuide />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </PlatformAuthProvider>
        <Toaster position="top-center" />
      </BrowserRouter>
    </div>
  );
}

export default App;
