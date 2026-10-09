import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import MyCerts from './pages/MyCerts.jsx';
import Profile from './pages/Profile.jsx';
import Overview from './pages/Overview.jsx';
import AdminCerts from './pages/AdminCerts.jsx';
import People from './pages/People.jsx';
import ImportSheet from './pages/ImportSheet.jsx';
import { Modal } from './components/ui.jsx';
import PasswordForm from './components/PasswordForm.jsx';

function Shell() {
  const { user, setUser, logout } = useAuth();
  const isAdmin = user.role === 'admin';
  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand"><span className="mark" aria-hidden="true">✓</span><span>Certification tracker</span></div>
        <nav aria-label="Main">
          {isAdmin && (
            <>
              <p className="nav-group">Admin</p>
              <NavLink to="/admin" end>Overview</NavLink>
              <NavLink to="/admin/certs">All certifications</NavLink>
              <NavLink to="/admin/people">People</NavLink>
              <NavLink to="/admin/import">Import spreadsheet</NavLink>
              <p className="nav-group">Mine</p>
            </>
          )}
          <NavLink to="/my">My certifications</NavLink>
          <NavLink to="/profile">Profile and password</NavLink>
        </nav>
        <div className="who">
          <div>
            <strong>{user.name}</strong>
            <span className="muted small">Emp ID {user.empId}{isAdmin ? ', admin' : ''}</span>
          </div>
          <button className="btn small" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
      {user.mustChangePassword && (
        <Modal title="Choose your own password">
          <p className="muted" style={{ marginTop: 0 }}>You're signed in with a starting password. Set a new one to continue.</p>
          <PasswordForm currentLabel="Starting password" submitLabel="Set password and continue" onDone={setUser} />
        </Modal>
      )}
    </div>
  );
}

function Guard({ admin }) {
  const { user } = useAuth();
  if (user === undefined) return <div className="boot" aria-busy="true">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/my" replace />;
  return <Outlet />;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'admin' ? '/admin' : '/my'} replace />;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<Guard />}>
        <Route element={user ? <Shell /> : null}>
          <Route index element={<Home />} />
          <Route path="my" element={<MyCerts />} />
          <Route path="profile" element={<Profile />} />
          <Route element={<Guard admin />}>
            <Route path="admin" element={<Overview />} />
            <Route path="admin/certs" element={<AdminCerts />} />
            <Route path="admin/people" element={<People />} />
            <Route path="admin/import" element={<ImportSheet />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
