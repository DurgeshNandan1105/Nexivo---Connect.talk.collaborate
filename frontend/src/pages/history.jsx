import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VideoCallIcon from '@mui/icons-material/VideoCall';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckIcon from '@mui/icons-material/Check';
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff';
import { Button, IconButton, Tooltip, Snackbar } from '@mui/material';
import "../App.css";

export default function History() {
    const { getHistoryOfUser } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([]);
    const [copiedCode, setCopiedCode] = useState(null);
    const [loading, setLoading] = useState(true);

    const navigate = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                setLoading(true);
                const history = await getHistoryOfUser();
                if (Array.isArray(history)) {
                    // Sort latest first if date is present
                    setMeetings([...history].reverse());
                } else {
                    setMeetings([]);
                }
            } catch (err) {
                console.error("Failed to fetch meeting history:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const formatDate = (dateString) => {
        if (!dateString) return "Recent";
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (e) {
            return dateString;
        }
    };

    const handleCopy = (code) => {
        if (navigator.clipboard && code) {
            navigator.clipboard.writeText(code);
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 2500);
        }
    };

    return (
        <div className="historyPageContainer">
            <header className="historyHeader">
                <div className="historyHeaderLeft">
                    <IconButton
                        onClick={() => navigate("/home")}
                        sx={{
                            color: "#f8fafc",
                            backgroundColor: "rgba(255, 255, 255, 0.08)",
                            "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.18)" },
                        }}
                        title="Back to Home"
                    >
                        <ArrowBackIcon />
                    </IconButton>
                    <h2>Meeting History</h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                        style={{
                            background: "rgba(99, 102, 241, 0.2)",
                            border: "1px solid rgba(129, 140, 248, 0.4)",
                            color: "#c7d2fe",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            padding: "4px 12px",
                            borderRadius: "16px",
                        }}
                    >
                        {meetings.length} {meetings.length === 1 ? "Call" : "Calls"}
                    </span>
                </div>
            </header>

            {loading ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
                    Loading meeting history...
                </div>
            ) : meetings.length > 0 ? (
                <div className="historyGrid">
                    {meetings.map((e, i) => (
                        <div key={i} className="historyCard">
                            <div>
                                <div className="historyCardCode">
                                    <span>{e.meetingCode}</span>
                                    <Tooltip title={copiedCode === e.meetingCode ? "Copied!" : "Copy Code"}>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleCopy(e.meetingCode)}
                                            sx={{ color: copiedCode === e.meetingCode ? "#10b981" : "#94a3b8" }}
                                        >
                                            {copiedCode === e.meetingCode ? (
                                                <CheckIcon fontSize="small" />
                                            ) : (
                                                <ContentCopyIcon fontSize="small" />
                                            )}
                                        </IconButton>
                                    </Tooltip>
                                </div>

                                <div className="historyCardDate" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                                    <CalendarMonthIcon sx={{ fontSize: 16, color: '#64748b' }} />
                                    <span>{formatDate(e.date)}</span>
                                </div>
                            </div>

                            <Button
                                variant="contained"
                                size="small"
                                onClick={() => navigate(`/${e.meetingCode}`)}
                                startIcon={<VideoCallIcon />}
                                sx={{
                                    mt: 1,
                                    textTransform: "none",
                                    borderRadius: "10px",
                                    fontWeight: 600,
                                    fontSize: "0.88rem",
                                    background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
                                }}
                            >
                                Rejoin Meeting
                            </Button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="historyEmptyState">
                    <HistoryToggleOffIcon sx={{ fontSize: 56, color: "#64748b" }} />
                    <h3 style={{ margin: 0, color: "#f8fafc", fontSize: "1.2rem" }}>No past meetings yet</h3>
                    <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.9rem", maxWidth: "340px" }}>
                        Calls you join or host will show up here so you can easily rejoin or review later.
                    </p>
                    <Button
                        variant="contained"
                        onClick={() => navigate("/home")}
                        sx={{
                            mt: 1,
                            borderRadius: "12px",
                            textTransform: "none",
                            fontWeight: 600,
                            background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
                        }}
                    >
                        Start or Join a Call
                    </Button>
                </div>
            )}

            <Snackbar
                open={!!copiedCode}
                autoHideDuration={2000}
                message={`Meeting code "${copiedCode}" copied to clipboard`}
            />
        </div>
    );
}