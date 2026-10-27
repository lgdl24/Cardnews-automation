import { Outlet, ScrollRestoration } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';
import { StudioJobBar } from '../screens/studio/StudioJobBar';

export function Layout() {
  return (
    <div className="app">
      <Header />
      <StudioJobBar />
      <main className="app-main" id="main">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
