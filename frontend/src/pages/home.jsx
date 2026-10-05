import React, { useContext, useState } from 'react';
import withAuth from '../utils/withAuth';
import { useNavigate } from 'react-router-dom';
import "../App.css";
import { Button, TextField } from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import LogoutIcon from '@mui/icons-material/Logout';
import { AuthContext } from '../contexts/AuthContext';

function HomeComponent() {
    let navigate = useNavigate();
    const [meetingCode, setMeetingCode] = useState("");

    const { addToUserHistory } = useContext(AuthContext);

    const handleJoinVideoCall = async (codeToJoin) => {
        const code = (codeToJoin || meetingCode || "").trim();
        if (!code) return;

        try {
            await addToUserHistory(code);
        } catch (err) {
            console.error("Could not add meeting to history:", err);
        }
        navigate(`/${code}`);
    };

    const handleStartNewMeeting = () => {
        // Generate a random clean room code (e.g. nex-8492)
        const randomCode = `nex-${Math.random().toString(36).substring(2, 7)}`;
        handleJoinVideoCall(randomCode);
    };

    return (
        <div className="homePageWrapper">
            <header className="homeNavBar">
                <div className="homeBrand" onClick={() => navigate("/home")}>
                    <img
                        src="/logo.png"
                        alt="Nexivo"
                        className="homeBrandLogo"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <h2>Nexivo Video Call</h2>
                </div>

                <div className="homeNavActions">
                    <button
                        className="homeNavActionBtn"
                        onClick={() => navigate("/history")}
                        title="View Past Meetings"
                    >
                        <RestoreIcon sx={{ fontSize: 18 }} />
                        <span>History</span>
                    </button>

                    <button
                        className="homeNavLogoutBtn"
                        onClick={() => {
                            localStorage.removeItem("token");
                            navigate("/auth");
                        }}
                        title="Sign Out"
                    >
                        <LogoutIcon sx={{ fontSize: 16, mr: 0.5, display: { xs: 'inline-block', sm: 'none' } }} />
                        <span>Logout</span>
                    </button>
                </div>
            </header>

            <main className="meetContainer">
                <div className="leftPanel">
                    <div className="meetHeroCard">
                        <span className="meetBadge">Real-Time Video Collaboration</span>
                        <h1 className="meetTitle">Connecting People, Bridging Distances.</h1>
                        <p className="meetSubtitle">
                            Experience crystal clear video calls with live subtitles, instant translation, and multi-language voice dubbing.
                        </p>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleJoinVideoCall();
                            }}
                            className="meetJoinForm"
                        >
                            <TextField
                                value={meetingCode}
                                onChange={(e) => setMeetingCode(e.target.value)}
                                id="outlined-basic"
                                label="Meeting Code"
                                placeholder="Enter code (e.g. team-sync)"
                                variant="outlined"
                                fullWidth
                                size="medium"
                                sx={{
                                    "& .MuiOutlinedInput-root": {
                                        borderRadius: "12px",
                                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                                        color: "#f8fafc",
                                        "& fieldset": { borderColor: "rgba(255, 255, 255, 0.18)" },
                                        "&:hover fieldset": { borderColor: "rgba(255, 255, 255, 0.35)" },
                                        "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                                    },
                                    "& .MuiInputLabel-root": { color: "#94a3b8" },
                                    "& .MuiInputLabel-root.Mui-focused": { color: "#818cf8" },
                                }}
                            />
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={!meetingCode.trim()}
                                className="meetJoinBtn"
                            >
                                Join
                            </Button>
                        </form>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }}></div>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>or</span>
                            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }}></div>
                        </div>

                        <Button
                            variant="outlined"
                            onClick={handleStartNewMeeting}
                            startIcon={<VideoCallIcon />}
                            sx={{
                                color: "#cbd5e1",
                                borderColor: "rgba(255, 255, 255, 0.2)",
                                borderRadius: "12px",
                                padding: "10px 20px",
                                textTransform: "none",
                                fontSize: "0.95rem",
                                fontWeight: 600,
                                "&:hover": {
                                    borderColor: "#818cf8",
                                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                                    color: "#ffffff"
                                }
                            }}
                        >
                            Create Instant Meeting
                        </Button>
                    </div>
                </div>

                <div className="rightPanel">
                    <img
                        src="/logo3.png"
                        alt="Nexivo Video Communication"
                        className="homeIllustration"
                        onError={(e) => {
                            e.currentTarget.src = "/mobile.png";
                        }}
                    />
                </div>
            </main>
        </div>
    );
}

export default withAuth(HomeComponent);