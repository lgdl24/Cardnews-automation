import { Outlet, ScrollRestoration } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';

export function Layout() {
  return (
    <div className="app">
      <Header />
      <main className="app-main" id="main">
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  );
}
