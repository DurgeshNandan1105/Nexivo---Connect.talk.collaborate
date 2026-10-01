import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import styles from "../styles/videoComponent.module.css";
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import SentimentSatisfiedAltIcon from "@mui/icons-material/SentimentSatisfiedAlt";
import CloseIcon from "@mui/icons-material/Close";
import server from "../environment";

const server_url = server;

let connections = {};

const peerConfigConnections = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export default function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();
  const localVideoref = useRef();
  const iceCandidatesQueue = useRef({});

  const [video, setVideo] = useState(true);
  const [audio, setAudio] = useState(true);
  const [screen, setScreen] = useState();
  const [showModal, setModal] = useState(false);
  const [screenAvailable, setScreenAvailable] = useState();
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");

  const [showReactions, setShowReactions] = useState(false);
  const [activeReactions, setActiveReactions] = useState([]);
  const [mediaStates, setMediaStates] = useState({});

  const [videos, setVideos] = useState([]);

  // Normalize room path across any host, port or trailing slashes
  const getRoomPath = () => {
    try {
      return window.location.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    } catch (e) {
      return window.location.pathname || "/";
    }
  };

  // Request permissions once on mount
  useEffect(() => {
    getPermissions();

    return () => {
      for (let id in connections) {
        try {
          connections[id].close();
        } catch (e) {}
      }
      connections = {};
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch (e) {}
      }
    };
  }, []);

  const getPermissions = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        setScreenAvailable(true);
      } else {
        setScreenAvailable(false);
      }

      // If active stream already exists and has live tracks, reuse it
      if (
        window.localStream &&
        window.localStream.active &&
        window.localStream.getTracks().some((t) => t.readyState === "live")
      ) {
        if (localVideoref.current && localVideoref.current.srcObject !== window.localStream) {
          localVideoref.current.srcObject = window.localStream;
        }
        return window.localStream;
      }

      let userMediaStream = null;
      try {
        userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } catch (err) {
        console.warn("Could not get both video and audio, trying individual tracks:", err);
        let vidStream = null;
        try {
          vidStream = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (e) {}

        let audStream = null;
        try {
          audStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {}

        if (vidStream && audStream) {
          userMediaStream = new MediaStream([
            ...vidStream.getVideoTracks(),
            ...audStream.getAudioTracks(),
          ]);
        } else if (vidStream) {
          userMediaStream = vidStream;
        } else if (audStream) {
          userMediaStream = audStream;
        }
      }

      if (userMediaStream) {
        window.localStream = userMediaStream;
        if (localVideoref.current) {
          localVideoref.current.srcObject = userMediaStream;
        }
      }
      return userMediaStream;
    } catch (error) {
      console.error("Error in getPermissions:", error);
      return null;
    }
  };

  const handleRemoteStream = (id, stream) => {
    setVideos((prevVideos) => {
      const videoExists = prevVideos.find((v) => v.socketId === id);
      if (videoExists) {
        return prevVideos.map((v) =>
          v.socketId === id ? { ...v, stream } : v
        );
      } else {
        return [
          ...prevVideos,
          {
            socketId: id,
            stream,
            autoplay: true,
            playsinline: true,
          },
        ];
      }
    });
  };

  const addTracksToPeer = (pc) => {
    if (!window.localStream) return;
    try {
      const senders = pc.getSenders ? pc.getSenders() : [];
      window.localStream.getTracks().forEach((track) => {
        const alreadyAdded = senders.some((s) => s.track && s.track.id === track.id);
        if (!alreadyAdded) {
          pc.addTrack(track, window.localStream);
        }
      });
    } catch (e) {
      try {
        pc.addStream(window.localStream);
      } catch (err) {}
    }
  };

  const sendReaction = (emoji) => {
    if (socketRef.current) {
      socketRef.current.emit("send-reaction", emoji, username || "Guest");
    }
    setShowReactions(false);
  };

  const handleIncomingReaction = (emoji, sender) => {
    const reactionId = Date.now() + Math.random();
    const leftPos = `${15 + Math.random() * 70}%`;
    const newReaction = { id: reactionId, emoji, sender, left: leftPos };

    setActiveReactions((prev) => [...prev, newReaction]);

    setTimeout(() => {
      setActiveReactions((prev) => prev.filter((r) => r.id !== reactionId));
    }, 2500);
  };

  const broadcastMediaState = (nextVid, nextAud) => {
    if (socketRef.current) {
      socketRef.current.emit("user-media-state", {
        video: nextVid,
        audio: nextAud,
      });
    }

    for (let id in connections) {
      if (id === socketIdRef.current) continue;
      try {
        if (socketRef.current) {
          socketRef.current.emit(
            "signal",
            id,
            JSON.stringify({ mediaState: { video: nextVid, audio: nextAud } })
          );
        }
      } catch (e) {}
    }
  };

  let handleVideo = () => {
    let nextVideo = !video;
    setVideo(nextVideo);
    if (window.localStream) {
      window.localStream.getVideoTracks().forEach((track) => {
        track.enabled = nextVideo;
      });
    }
    if (localVideoref.current && localVideoref.current.srcObject) {
      localVideoref.current.srcObject.getVideoTracks().forEach((track) => {
        track.enabled = nextVideo;
      });
    }
    broadcastMediaState(nextVideo, audio);
  };

  let handleAudio = () => {
    let nextAudio = !audio;
    setAudio(nextAudio);
    if (window.localStream) {
      window.localStream.getAudioTracks().forEach((track) => {
        track.enabled = nextAudio;
      });
    }
    if (localVideoref.current && localVideoref.current.srcObject) {
      localVideoref.current.srcObject.getAudioTracks().forEach((track) => {
        track.enabled = nextAudio;
      });
    }
    broadcastMediaState(video, nextAudio);
  };

  let getDislayMedia = () => {
    if (screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices
          .getDisplayMedia({ video: true, audio: true })
          .then(getDislayMediaSuccess)
          .catch((e) => console.log(e));
      }
    }
  };

  const sendOffer = (peerId) => {
    const pc = connections[peerId];
    if (!pc) return;
    addTracksToPeer(pc);
    pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    })
      .then((description) => pc.setLocalDescription(description))
      .then(() => {
        if (socketRef.current) {
          socketRef.current.emit(
            "signal",
            peerId,
            JSON.stringify({ sdp: pc.localDescription })
          );
        }
      })
      .catch((e) => console.log("sendOffer error:", e));
  };

  let getDislayMediaSuccess = (stream) => {
    try {
      if (window.localStream) {
        window.localStream.getTracks().forEach((track) => track.stop());
      }
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    if (localVideoref.current) {
      localVideoref.current.srcObject = stream;
    }

    Object.keys(connections).forEach((id) => {
      if (id === socketIdRef.current) return;
      addTracksToPeer(connections[id]);
      sendOffer(id);
    });

    stream.getTracks().forEach((track) => {
      track.onended = () => {
        setScreen(false);
        getPermissions().then((camStream) => {
          if (camStream) {
            Object.keys(connections).forEach((id) => {
              if (id === socketIdRef.current) return;
              addTracksToPeer(connections[id]);
              sendOffer(id);
            });
          }
        });
      };
    });
  };

  useEffect(() => {
    if (screen !== undefined) {
      getDislayMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  let handleScreen = () => {
    setScreen(!screen);
  };

  const createPeerConnection = (id) => {
    if (connections[id]) {
      addTracksToPeer(connections[id]);
      return connections[id];
    }

    const pc = new RTCPeerConnection(peerConfigConnections);
    connections[id] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate != null && socketRef.current) {
        socketRef.current.emit(
          "signal",
          id,
          JSON.stringify({ ice: event.candidate })
        );
      }
    };

    // Modern WebRTC track listener
    pc.ontrack = (event) => {
      console.log("Remote track received for id: ", id, event.track.kind);
      const remoteStream = event.streams && event.streams[0]
        ? event.streams[0]
        : new MediaStream([event.track]);
      handleRemoteStream(id, remoteStream);
    };

    // Legacy fallback listener
    pc.onaddstream = (event) => {
      console.log("Remote stream added for id: ", id);
      handleRemoteStream(id, event.stream);
    };

    addTracksToPeer(pc);

    return pc;
  };

  const gotMessageFromServer = (fromId, message) => {
    try {
      const signal = JSON.parse(message);

      if (fromId !== socketIdRef.current) {
        if (signal.mediaState) {
          setMediaStates((prev) => ({
            ...prev,
            [fromId]: signal.mediaState,
          }));
        }

        if (signal.sdp) {
          const pc = connections[fromId] || createPeerConnection(fromId);
          addTracksToPeer(pc);

          pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
            .then(() => {
              // Flush any queued ICE candidates that arrived before setRemoteDescription resolved
              if (iceCandidatesQueue.current[fromId] && iceCandidatesQueue.current[fromId].length > 0) {
                const queue = iceCandidatesQueue.current[fromId];
                iceCandidatesQueue.current[fromId] = [];
                queue.forEach((candidate) => {
                  pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) =>
                    console.log("addQueuedCandidate error:", e)
                  );
                });
              }

              if (signal.sdp.type === "offer") {
                pc.createAnswer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: true,
                })
                  .then((description) => {
                    pc.setLocalDescription(description)
                      .then(() => {
                        if (socketRef.current) {
                          socketRef.current.emit(
                            "signal",
                            fromId,
                            JSON.stringify({
                              sdp: pc.localDescription,
                            })
                          );
                        }
                      })
                      .catch((e) => console.log(e));
                  })
                  .catch((e) => console.log(e));
              }
            })
            .catch((e) => console.log("setRemoteDescription error:", e));
        }

        if (signal.ice) {
          const pc = connections[fromId];
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            pc.addIceCandidate(new RTCIceCandidate(signal.ice)).catch((e) =>
              console.log("addIceCandidate error:", e)
            );
          } else {
            if (!iceCandidatesQueue.current[fromId]) {
              iceCandidatesQueue.current[fromId] = [];
            }
            iceCandidatesQueue.current[fromId].push(signal.ice);
          }
        }
      }
    } catch (e) {
      console.error("Error parsing signal message:", e);
    }
  };

  const connectToSocketServer = () => {
    if (socketRef.current) return;

    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("signal", gotMessageFromServer);

    socketRef.current.on("connect", () => {
      const roomPath = getRoomPath();
      socketRef.current.emit("join-call", roomPath);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("chat-message", addMessage);
      socketRef.current.on("reaction", handleIncomingReaction);

      socketRef.current.on("user-media-state", (data) => {
        setMediaStates((prev) => ({
          ...prev,
          [data.socketId]: { video: data.video, audio: data.audio },
        }));
      });

      socketRef.current.on("user-left", (id) => {
        if (connections[id]) {
          try {
            connections[id].close();
          } catch (e) {}
          delete connections[id];
        }
        delete iceCandidatesQueue.current[id];
        setVideos((videos) => videos.filter((video) => video.socketId !== id));
        setMediaStates((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      });

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach((socketListId) => {
          if (socketListId === socketIdRef.current) return;
          if (connections[socketListId]) return;

          createPeerConnection(socketListId);
        });

        // Broadcast current media state based on actual live tracks
        const curVid = window.localStream
          ? window.localStream.getVideoTracks().some((t) => t.enabled)
          : true;
        const curAud = window.localStream
          ? window.localStream.getAudioTracks().some((t) => t.enabled)
          : true;
        broadcastMediaState(curVid, curAud);

        if (id === socketIdRef.current) {
          Object.keys(connections).forEach((id2) => {
            if (id2 !== socketIdRef.current) {
              sendOffer(id2);
            }
          });
        }
      });
    });
  };

  const handleEndCall = () => {
    try {
      if (window.localStream) {
        window.localStream.getTracks().forEach((track) => track.stop());
      }
      if (localVideoref.current && localVideoref.current.srcObject) {
        localVideoref.current.srcObject.getTracks().forEach((track) => track.stop());
      }
    } catch (e) {}

    for (let id in connections) {
      try {
        connections[id].close();
      } catch (e) {}
    }
    connections = {};

    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    window.location.href = "/";
  };

  const handleMessage = (e) => {
    setMessage(e.target.value);
  };

  const addMessage = (data, sender, socketIdSender) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { sender: sender, data: data },
    ]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages((prevNewMessages) => prevNewMessages + 1);
    }
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    if (socketRef.current) {
      socketRef.current.emit("chat-message", message, username);
    }
    setMessage("");
  };

  const connect = async () => {
    let stream = window.localStream;
    if (!stream || !stream.active) {
      stream = await getPermissions();
    }
    const hasVideo = !!stream?.getVideoTracks().some((track) => track.readyState === "live");
    const hasAudio = !!stream?.getAudioTracks().some((track) => track.readyState === "live");
    setVideo(hasVideo);
    setAudio(hasAudio);
    setAskForUsername(false);
    connectToSocketServer();
  };

  return (
    <div>
      {askForUsername === true ? (
        <div className={styles.lobbyContainer}>
          <div className={styles.lobbyCard}>
            <div className={styles.lobbyHeader}>
              <h2>Enter into Lobby</h2>
              <p>Check your video preview & enter your display name to join</p>
            </div>

            <div className={styles.lobbyVideoWrapper}>
              <video
                ref={(el) => {
                  localVideoref.current = el;
                  if (el && window.localStream && el.srcObject !== window.localStream) {
                    el.srcObject = window.localStream;
                  }
                }}
                autoPlay
                muted
                playsInline
                className={styles.lobbyVideo}
                style={{ display: video ? "block" : "none" }}
              ></video>
              {!video && (
                <div className={styles.lobbyVideoPlaceholder}>
                  <VideocamOffIcon sx={{ fontSize: 44, color: "#64748b" }} />
                  <span>Camera is turned off</span>
                </div>
              )}
            </div>

            <div className={styles.lobbyForm}>
              <TextField
                id="outlined-basic"
                label="Enter Your Name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && username.trim()) {
                    connect();
                  }
                }}
                variant="outlined"
                fullWidth
                sx={{
                  "& .MuiOutlinedInput-root": {
                    color: "#f8fafc",
                    borderRadius: "12px",
                    backgroundColor: "rgba(15, 23, 42, 0.6)",
                    "& fieldset": { borderColor: "rgba(255, 255, 255, 0.2)" },
                    "&:hover fieldset": { borderColor: "rgba(255, 255, 255, 0.4)" },
                    "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                  },
                  "& .MuiInputLabel-root": { color: "#94a3b8" },
                  "& .MuiInputLabel-root.Mui-focused": { color: "#818cf8" },
                }}
              />
              <Button
                variant="contained"
                onClick={connect}
                className={styles.connectBtn}
                disabled={!username.trim()}
              >
                Connect to Call
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          {showModal ? (
            <div className={styles.chatRoom}>
              <div className={styles.chatContainer}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
                  <h1 style={{ margin: 0, padding: 0, border: "none", fontSize: "1.25rem", color: "#f8fafc" }}>Meeting Chat</h1>
                  <IconButton onClick={() => setModal(false)} size="small" style={{ color: "#94a3b8" }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </div>

                <div className={styles.chattingDisplay}>
                  {messages.length !== 0 ? (
                    messages.map((item, index) => {
                      return (
                        <div
                          style={{
                            marginBottom: "12px",
                            background: "rgba(255,255,255,0.06)",
                            padding: "10px 14px",
                            borderRadius: "12px",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }}
                          key={index}
                        >
                          <p
                            style={{
                              fontWeight: "600",
                              fontSize: "0.85rem",
                              color: "#818cf8",
                              margin: "0 0 4px 0",
                            }}
                          >
                            {item.sender}
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: "0.95rem",
                              color: "#f8fafc",
                              wordBreak: "break-word",
                            }}
                          >
                            {item.data}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <p style={{ color: "#64748b", textAlign: "center", marginTop: "40px" }}>
                      No messages yet
                    </p>
                  )}
                </div>

                <div className={styles.chattingArea}>
                  <TextField
                    value={message}
                    onChange={handleMessage}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    id="outlined-basic"
                    label="Send a message..."
                    variant="outlined"
                    fullWidth
                    size="small"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        color: "#f8fafc",
                        borderRadius: "10px",
                        backgroundColor: "rgba(15, 23, 42, 0.6)",
                        "& fieldset": { borderColor: "rgba(255, 255, 255, 0.2)" },
                        "&:hover fieldset": { borderColor: "rgba(255, 255, 255, 0.4)" },
                        "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                      },
                      "& .MuiInputLabel-root": { color: "#94a3b8" },
                      "& .MuiInputLabel-root.Mui-focused": { color: "#818cf8" },
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={sendMessage}
                    sx={{
                      background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                      borderRadius: "10px",
                      textTransform: "none",
                      fontWeight: 600,
                    }}
                  >
                    Send
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <></>
          )}

          <div className={styles.buttonContainers}>
            <IconButton onClick={handleVideo} style={{ color: video ? "#38bdf8" : "#ef4444" }}>
              {video === true ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton
              onClick={handleEndCall}
              style={{ color: "white", backgroundColor: "#ef4444" }}
            >
              <CallEndIcon />
            </IconButton>
            <IconButton onClick={handleAudio} style={{ color: audio ? "#38bdf8" : "#ef4444" }}>
              {audio === true ? <MicIcon /> : <MicOffIcon />}
            </IconButton>

            {screenAvailable === true ? (
              <IconButton onClick={handleScreen} style={{ color: screen ? "#38bdf8" : "white" }}>
                {screen === true ? <ScreenShareIcon /> : <StopScreenShareIcon />}
              </IconButton>
            ) : (
              <></>
            )}

            <Badge badgeContent={newMessages} max={999} color="primary">
              <IconButton
                onClick={() => {
                  let nextModal = !showModal;
                  setModal(nextModal);
                  if (nextModal) {
                    setNewMessages(0);
                  }
                }}
                style={{ color: "white" }}
              >
                <ChatIcon />
              </IconButton>
            </Badge>

            <IconButton
              onClick={() => setShowReactions(!showReactions)}
              style={{ color: showReactions ? "#38bdf8" : "white" }}
            >
              <SentimentSatisfiedAltIcon />
            </IconButton>
          </div>

          {showReactions && (
            <div className={styles.reactionPicker}>
              {["👍", "❤️", "👏", "😂", "🔥", "🎉"].map((emoji) => (
                <button
                  key={emoji}
                  className={styles.reactionBtn}
                  onClick={() => sendReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {activeReactions.map((r) => (
            <div
              key={r.id}
              className={styles.floatingEmoji}
              style={{ left: r.left }}
            >
              <span>{r.emoji}</span>
              <span className={styles.floatingSender}>{r.sender}</span>
            </div>
          ))}

          <div className={styles.meetUserVideoWrapper}>
            <video
              ref={(el) => {
                localVideoref.current = el;
                if (el && window.localStream && el.srcObject !== window.localStream) {
                  el.srcObject = window.localStream;
                }
              }}
              autoPlay
              muted
              playsInline
              className={styles.meetUserVideo}
              style={{ display: video ? "block" : "none" }}
            ></video>
            {!video && (
              <div className={styles.meetUserVideoPlaceholder}>
                <VideocamOffIcon sx={{ fontSize: 36, color: "#ef4444" }} />
                <span style={{ color: "#cbd5e1", fontSize: "0.8rem", marginTop: "4px", fontWeight: "600" }}>
                  Camera Off
                </span>
              </div>
            )}
          </div>

          <div className={styles.conferenceView}>
            {videos.length === 0 ? (
              <div className={styles.mainVideoTile}>
                <div className={styles.waitingContainer}>
                  <div className={styles.waitingPulse}>
                    <VideocamIcon sx={{ fontSize: 44, color: "#818cf8" }} />
                  </div>
                  <h3 className={styles.waitingTitle}>Waiting for your friend to join...</h3>
                  <p className={styles.waitingSubtitle}>
                    Share this room link with your friend to start the video call
                  </p>
                </div>
              </div>
            ) : (
              videos.map((videoItem) => {
                const peerState = mediaStates[videoItem.socketId];
                const isVideoOn = peerState ? peerState.video : true;
                const isAudioOn = peerState ? peerState.audio : true;

                return (
                  <div key={videoItem.socketId} className={styles.mainVideoTile}>
                    <video
                      data-socket={videoItem.socketId}
                      ref={(ref) => {
                        if (ref && videoItem.stream) {
                          if (ref.srcObject !== videoItem.stream) {
                            ref.srcObject = videoItem.stream;
                          }
                          ref.play().catch((err) => console.log("Auto-play error:", err));
                        }
                      }}
                      autoPlay
                      playsInline
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    ></video>
                    {!isVideoOn && (
                      <div className={styles.blackScreenTile}>
                        <VideocamOffIcon sx={{ fontSize: 56, color: "#ef4444" }} />
                        <span style={{ color: "#f8fafc", marginTop: "8px", fontWeight: "600" }}>Camera Off</span>
                      </div>
                    )}
                    {!isAudioOn && (
                      <div className={styles.peerMutedBadge}>
                        <MicOffIcon sx={{ fontSize: 18, color: "#ffffff" }} />
                        <span>Muted</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
