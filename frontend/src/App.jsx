import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Students, { StudentDetail } from './pages/Students.jsx'
import Directory, { UpazilaDetail } from './pages/Directory.jsx'
import Heritage, { HeritageDetail } from './pages/Heritage.jsx'
import { About, Blog, BlogPost, Contact, Gallery, NotFound } from './pages/Content.jsx'
import Auth, { Verify } from './pages/Auth.jsx'
import { Admin, Dashboard } from './pages/Dashboards.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="directory" element={<Directory />} />
        <Route path="directory/:slug" element={<UpazilaDetail />} />
        <Route path="heritage" element={<Heritage />} />
        <Route path="heritage/:slug" element={<HeritageDetail />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:slug" element={<BlogPost />} />
        <Route path="gallery" element={<Gallery />} />
        <Route path="contact" element={<Contact />} />
        <Route path="login" element={<Auth mode="login" />} />
        <Route path="register" element={<Auth mode="register" />} />
        <Route path="forgot-password" element={<Auth mode="forgot" />} />
        <Route path="reset-password" element={<Auth mode="reset" />} />
        <Route path="verify-email" element={<Verify />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
