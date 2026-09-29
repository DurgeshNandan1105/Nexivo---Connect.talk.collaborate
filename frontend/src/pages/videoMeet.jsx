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
import { ALL_LANGUAGES } from "../utils/languages";
import server from "../environment";

const server_url = server;

var connections = {};

const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function VideoMeetComponent() {
  var socketRef = useRef();
  let socketIdRef = useRef();
  let localVideoref = useRef();

  let [videoAvailable, setVideoAvailable] = useState(true);
  let [audioAvailable, setAudioAvailable] = useState(true);
  let [video, setVideo] = useState(true);
  let [audio, setAudio] = useState(true);
  let [screen, setScreen] = useState();
  let [showModal, setModal] = useState(true);
  let [screenAvailable, setScreenAvailable] = useState();
  let [messages, setMessages] = useState([]);
  let [message, setMessage] = useState("");
  let [newMessages, setNewMessages] = useState(0);
  let [askForUsername, setAskForUsername] = useState(true);
  let [username, setUsername] = useState("");

  const [showReactions, setShowReactions] = useState(false);
  const [activeReactions, setActiveReactions] = useState([]);
  const [mediaStates, setMediaStates] = useState({}); // { [socketId]: { video: boolean, audio: boolean } }

  const [mySpeakingLang, setMySpeakingLang] = useState("en-US");
  const [myListeningLang, setMyListeningLang] = useState("original");
  const [liveCaption, setLiveCaption] = useState(null);

  const videoRef = useRef([]);
  let [videos, setVideos] = useState([]);
  const recognitionRef = useRef(null);

  // Preload speech synthesis voices on mount
  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  // Request permissions once on mount
  useEffect(() => {
    getPermissions();

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
    };
  }, []);

  const getPermissions = async () => {
    try {
      if (navigator.mediaDevices.getDisplayMedia) {
        setScreenAvailable(true);
      } else {
        setScreenAvailable(false);
      }

      // If active stream already exists, reuse it
      if (
        window.localStream &&
        window.localStream.active &&
        window.localStream.getTracks().some((t) => t.readyState === "live")
      ) {
        if (localVideoref.current && localVideoref.current.srcObject !== window.localStream) {
          localVideoref.current.srcObject = window.localStream;
        }
        return;
      }

      let userMediaStream = null;
      try {
        userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setVideoAvailable(true);
        setAudioAvailable(true);
      } catch (err) {
        console.warn("Could not get both video and audio, trying individual tracks:", err);
        let vidStream = null;
        try {
          vidStream = await navigator.mediaDevices.getUserMedia({ video: true });
          setVideoAvailable(true);
        } catch (e) {
          setVideoAvailable(false);
        }

        let audStream = null;
        try {
          audStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setAudioAvailable(true);
        } catch (e) {
          setAudioAvailable(false);
        }

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
    } catch (error) {
      console.error("Error in getPermissions:", error);
    }
  };

  // Live Speech Recognition for Voice Translation
  useEffect(() => {
    // Only listen when in-call and unmuted
    if (askForUsername || !audio) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
        recognitionRef.current = null;
      }
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    let active = true;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = mySpeakingLang;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.trim();
          if (transcript && socketRef.current) {
            // Show feedback on speaker's own screen
            setLiveCaption({ sender: "You", text: transcript });
            setTimeout(() => setLiveCaption(null), 4000);

            socketRef.current.emit("send-speech-chunk", {
              text: transcript,
              sourceLang: mySpeakingLang.split("-")[0],
              sender: username || "Guest",
            });
          }
        }
      }
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        active = false;
      }
    };

    recognition.onend = () => {
      if (active) {
        setTimeout(() => {
          if (active && recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch (e) {}
          }
        }, 300);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.warn("Could not start speech recognition:", e);
    }

    return () => {
      active = false;
      try {
        recognition.abort();
      } catch (e) {}
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };
  }, [askForUsername, audio, mySpeakingLang, username]);

  const handleIncomingSpeechChunk = (data) => {
    if (data.socketIdSender === socketIdRef.current) return;

    if (myListeningLang === "original") {
      setLiveCaption({ sender: data.sender, text: data.text });
      setTimeout(() => setLiveCaption(null), 5000);
    } else {
      const selectedLangObj = ALL_LANGUAGES.find((l) => l.code === myListeningLang);
      const targetLang = selectedLangObj ? selectedLangObj.iso : "en";
      if (socketRef.current) {
        socketRef.current.emit("request-translation", {
          text: data.text,
          sourceLang: data.sourceLang || "auto",
          targetLang: targetLang,
        });
      }
    }
  };

  const handleDeliverTranslatedVoice = async (data) => {
    let textToSpeak = data.translatedText;

    // Fallback translation if server returned identical text but different target
    if (data.targetLang && data.targetLang !== "en" && data.translatedText === data.originalText) {
      try {
        const res = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(data.originalText)}&langpair=autodetect|${data.targetLang}`
        );
        const json = await res.json();
        if (json && json.responseData && json.responseData.translatedText) {
          textToSpeak = json.responseData.translatedText;
        }
      } catch (e) {}
    }

    setLiveCaption({ sender: "Translation", text: textToSpeak });
    setTimeout(() => setLiveCaption(null), 5000);

    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
      } catch (e) {}

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      const selectedLangObj = ALL_LANGUAGES.find((l) => l.iso === data.targetLang);
      const targetCode = selectedLangObj ? selectedLangObj.code : "en-US";
      utterance.lang = targetCode;

      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(
        (v) =>
          v.lang === targetCode ||
          v.lang.replace("_", "-").toLowerCase().startsWith(data.targetLang.toLowerCase())
      );
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      utterance.rate = 1.0;

      // Lower remote audio during synthesized speech
      const remoteVideos = document.querySelectorAll("video[data-socket]");
      remoteVideos.forEach((v) => {
        v.volume = 0.15;
      });

      const restoreVolume = () => {
        remoteVideos.forEach((v) => {
          v.volume = 1.0;
        });
        window.activeSpeechUtterance = null;
      };

      utterance.onend = restoreVolume;
      utterance.onerror = restoreVolume;

      window.activeSpeechUtterance = utterance;
      window.speechSynthesis.speak(utterance);
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

  let broadcastMediaState = (nextVid, nextAud) => {
    // 1. Direct socket event
    if (socketRef.current) {
      socketRef.current.emit("user-media-state", {
        video: nextVid,
        audio: nextAud,
      });
    }

    // 2. Dual relay via signal to all peers
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
      let videoTrack = window.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = nextVideo;
      }
    }
    if (localVideoref.current && localVideoref.current.srcObject) {
      let videoTrack = localVideoref.current.srcObject.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = nextVideo;
      }
    }
    broadcastMediaState(nextVideo, audio);
  };

  let handleAudio = () => {
    let nextAudio = !audio;
    setAudio(nextAudio);
    if (window.localStream) {
      let audioTrack = window.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = nextAudio;
      }
    }
    if (localVideoref.current && localVideoref.current.srcObject) {
      let audioTrack = localVideoref.current.srcObject.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = nextAudio;
      }
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
    pc.createOffer()
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
      .catch((e) => console.log(e));
  };

  let getDislayMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    if (localVideoref.current) {
      localVideoref.current.srcObject = stream;
    }

    Object.keys(connections).forEach((id) => {
      if (id === socketIdRef.current) return;
      try {
        connections[id].addStream(window.localStream);
      } catch (e) {}
      sendOffer(id);
    });

    stream.getTracks().forEach((track) => {
      track.onended = () => {
        setScreen(false);
        getPermissions();
      };
    });
  };

  useEffect(() => {
    if (screen !== undefined) {
      getDislayMedia();
    }
  }, [screen]);

  let handleScreen = () => {
    setScreen(!screen);
  };

  const createPeerConnection = (id) => {
    if (connections[id]) return connections[id];

    const pc = new RTCPeerConnection(peerConfigConnections);
    connections[id] = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate != null && socketRef.current) {
        socketRef.current.emit(
          "signal",
          id,
          JSON.stringify({ ice: event.candidate }),
        );
      }
    };

    pc.onaddstream = (event) => {
      console.log("Remote stream added for id: ", id);
      setVideos((prevVideos) => {
        const videoExists = prevVideos.find((v) => v.socketId === id);
        if (videoExists) {
          const updated = prevVideos.map((v) =>
            v.socketId === id ? { ...v, stream: event.stream } : v
          );
          videoRef.current = updated;
          return updated;
        } else {
          const newVideo = {
            socketId: id,
            stream: event.stream,
            autoplay: true,
            playsinline: true,
          };
          const updated = [...prevVideos, newVideo];
          videoRef.current = updated;
          return updated;
        }
      });
    };

    if (window.localStream) {
      pc.addStream(window.localStream);
    } else {
      let blackSilence = (...args) =>
        new MediaStream([black(...args), silence()]);
      window.localStream = blackSilence();
      pc.addStream(window.localStream);
    }

    return pc;
  };

  let gotMessageFromServer = (fromId, message) => {
    try {
      var signal = JSON.parse(message);

      if (fromId !== socketIdRef.current) {
        if (signal.mediaState) {
          setMediaStates((prev) => ({
            ...prev,
            [fromId]: signal.mediaState,
          }));
        }

        if (signal.sdp) {
          const pc = connections[fromId] || createPeerConnection(fromId);
          pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
            .then(() => {
              if (signal.sdp.type === "offer") {
                pc.createAnswer()
                  .then((description) => {
                    pc.setLocalDescription(description)
                      .then(() => {
                        socketRef.current.emit(
                          "signal",
                          fromId,
                          JSON.stringify({
                            sdp: pc.localDescription,
                          }),
                        );
                      })
                      .catch((e) => console.log(e));
                  })
                  .catch((e) => console.log(e));
              }
            })
            .catch((e) => console.log(e));
        }

        if (signal.ice) {
          const pc = connections[fromId];
          if (pc) {
            pc.addIceCandidate(new RTCIceCandidate(signal.ice))
              .catch((e) => console.log(e));
          }
        }
      }
    } catch (e) {
      console.error("Error parsing signal message:", e);
    }
  };

  let connectToSocketServer = () => {
    if (socketRef.current) return;

    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("signal", gotMessageFromServer);

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("chat-message", addMessage);
      socketRef.current.on("reaction", handleIncomingReaction);
      socketRef.current.on("receive-speech-chunk", handleIncomingSpeechChunk);
      socketRef.current.on("deliver-translated-voice", handleDeliverTranslatedVoice);

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

        // Broadcast current media state
        broadcastMediaState(video, audio);

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

  let silence = () => {
    let ctx = new AudioContext();
    let oscillator = ctx.createOscillator();
    let dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };

  let black = ({ width = 640, height = 480 } = {}) => {
    let canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    canvas.getContext("2d").fillRect(0, 0, width, height);
    let stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };

  let handleEndCall = () => {
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

  let handleMessage = (e) => {
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

  let sendMessage = () => {
    if (!message.trim()) return;
    if (socketRef.current) {
      socketRef.current.emit("chat-message", message, username);
    }
    setMessage("");
  };

  let connect = () => {
    setAskForUsername(false);
    setVideo(videoAvailable);
    setAudio(audioAvailable);
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

            <select
              value={mySpeakingLang}
              onChange={(e) => setMySpeakingLang(e.target.value)}
              className={styles.langSelect}
              title="Select language you speak"
            >
              {ALL_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  Speak: {lang.label}
                </option>
              ))}
            </select>

            <select
              value={myListeningLang}
              onChange={(e) => setMyListeningLang(e.target.value)}
              className={styles.langSelect}
              title="Select voice language you want to hear"
            >
              <option value="original">Listen: Original Voice</option>
              {ALL_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  Listen: {lang.label} Voice
                </option>
              ))}
            </select>
          </div>

          {liveCaption && (
            <div className={styles.liveCaptionOverlay}>
              <span className={styles.captionSender}>{liveCaption.sender}:</span>
              <span className={styles.captionText}>{liveCaption.text}</span>
            </div>
          )}

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
                const peerState = mediaStates[videoItem.socketId] ?? { video: true, audio: true };
                const isVideoOn = peerState.video;
                const isAudioOn = peerState.audio;

                return (
                  <div key={videoItem.socketId} className={styles.mainVideoTile}>
                    <video
                      data-socket={videoItem.socketId}
                      ref={(ref) => {
                        if (ref && videoItem.stream) {
                          if (ref.srcObject !== videoItem.stream) {
                            ref.srcObject = videoItem.stream;
                          }
                          ref.play().catch(() => {});
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
