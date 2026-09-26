
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import './App.css';
import LandingPage from './pages/landing';
import Authentication from './pages/authentication';
import { AuthProvider } from './contexts/AuthContext';
import VideoMeetComponent from './pages/videoMeet';


function App() {
  return (
    <div className='App'>
   <>
   <Router>
    <AuthProvider>
    <Routes>
      {/* <Route path="/home" element=/>  */}
      <Route path='/' element={<LandingPage/>} />
      <Route path='/auth' element={<Authentication/>} />
      <Route path='/:url' element={<VideoMeetComponent />} />

    </Routes>
    </AuthProvider>
   </Router>
   </>
   </div>
  );
}

export default App;
