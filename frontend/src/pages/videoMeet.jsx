import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { Badge, IconButton, TextField } from "@mui/material";
import { Button } from "@mui/material";
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
import { ALL_LANGUAGES } from "../utils/languages";
import server from "../environment";

const server_url = server ;

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

  const [mySpeakingLang, setMySpeakingLang] = useState("hi-IN");
  const [myListeningLang, setMyListeningLang] = useState("original");
  const [liveCaption, setLiveCaption] = useState(null);

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;

    let shouldListen = true;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = mySpeakingLang;

    recognition.onresult = (event) => {
      const lastIndex = event.results.length - 1;
      const transcript = event.results[lastIndex][0].transcript;
      if (socketRef.current && transcript.trim()) {
        socketRef.current.emit("send-speech-chunk", {
          text: transcript,
          sourceLang: mySpeakingLang.split("-")[0],
          sender: username || "Guest"
        });
      }
    };

    recognition.onend = () => {
      if (shouldListen) {
        try {
          recognition.start();
        } catch (e) {}
      }
    };

    recognition.onerror = () => {
      if (shouldListen) {
        try {
          recognition.start();
        } catch (e) {}
      }
    };

    try {
      recognition.start();
    } catch (e) {}

    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }

    return () => {
      shouldListen = false;
      try {
        recognition.stop();
      } catch (e) {}
    };
  }, [mySpeakingLang, username]);

  const handleIncomingSpeechChunk = (data) => {
    if (data.socketIdSender === socketIdRef.current) return;

    if (myListeningLang === "original") {
      setLiveCaption({ sender: data.sender, text: data.text });
      setTimeout(() => setLiveCaption(null), 4000);
    } else {
      const selectedLangObj = ALL_LANGUAGES.find((l) => l.code === myListeningLang);
      if (selectedLangObj && socketRef.current) {
        socketRef.current.emit("request-translation", {
          text: data.text,
          sourceLang: data.sourceLang,
          targetLang: selectedLangObj.iso
        });
      }
    }
  };

  const handleDeliverTranslatedVoice = (data) => {
    setLiveCaption({ sender: "Translation", text: data.translatedText });
    setTimeout(() => setLiveCaption(null), 4000);

    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}

      const utterance = new SpeechSynthesisUtterance(data.translatedText);
      const selectedLangObj = ALL_LANGUAGES.find((l) => l.iso === data.targetLang);
      const targetCode = selectedLangObj ? selectedLangObj.code : "en-US";
      utterance.lang = targetCode;

      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(
        (v) => v.lang === targetCode || v.lang.startsWith(data.targetLang)
      );
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
      utterance.rate = 1.0;

      const remoteVideos = document.querySelectorAll("video[data-socket]");
      remoteVideos.forEach((v) => { v.volume = 0.2; });

      const restoreVolume = () => {
        remoteVideos.forEach((v) => { v.volume = 1.0; });
      };
      utterance.onend = restoreVolume;
      utterance.onerror = restoreVolume;

      window.speechSynthesis.speak(utterance);
    }
  };

  const videoRef = useRef([]);

  let [videos, setVideos] = useState([]);

  // TODO
  // if(isChrome() === false) {

  // }

  useEffect(() => {
    console.log("HELLO");
    getPermissions();
  });

  let getDislayMedia = () => {
    if (screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices
          .getDisplayMedia({ video: true, audio: true })
          .then(getDislayMediaSuccess)
          .then((stream) => {})
          .catch((e) => console.log(e));
      }
    }
  };

  const getPermissions = async () => {
    try {
      const videoPermission = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      if (videoPermission) {
        setVideoAvailable(true);
        console.log("Video permission granted");
      } else {
        setVideoAvailable(false);
        console.log("Video permission denied");
      }

      const audioPermission = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (audioPermission) {
        setAudioAvailable(true);
        console.log("Audio permission granted");
      } else {
        setAudioAvailable(false);
        console.log("Audio permission denied");
      }

      if (navigator.mediaDevices.getDisplayMedia) {
        setScreenAvailable(true);
      } else {
        setScreenAvailable(false);
      }

      if (videoAvailable || audioAvailable) {
        const userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoAvailable,
          audio: audioAvailable,
        });
        if (userMediaStream) {
          window.localStream = userMediaStream;
          if (localVideoref.current) {
            localVideoref.current.srcObject = userMediaStream;
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    if (video !== undefined && audio !== undefined) {
      // getUserMedia();
      console.log("SET STATE HAS ", video, audio);
    }
  }, [video, audio]);
  let getMedia = () => {
    setVideo(videoAvailable);
    setAudio(audioAvailable);
    connectToSocketServer();
  };

  let getUserMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    localVideoref.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      connections[id].addStream(window.localStream);

      connections[id].createOffer().then((description) => {
        console.log(description);
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            socketRef.current.emit(
              "signal",
              id,
              JSON.stringify({ sdp: connections[id].localDescription }),
            );
          })
          .catch((e) => console.log(e));
      });
    }

    stream.getTracks().forEach(
      (track) =>
        (track.onended = () => {
          setVideo(false);
          setAudio(false);

          try {
            let tracks = localVideoref.current.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
          } catch (e) {
            console.log(e);
          }

          let blackSilence = (...args) =>
            new MediaStream([black(...args), silence()]);
          window.localStream = blackSilence();
          localVideoref.current.srcObject = window.localStream;

          for (let id in connections) {
            connections[id].addStream(window.localStream);

            connections[id].createOffer().then((description) => {
              connections[id]
                .setLocalDescription(description)
                .then(() => {
                  socketRef.current.emit(
                    "signal",
                    id,
                    JSON.stringify({ sdp: connections[id].localDescription }),
                  );
                })
                .catch((e) => console.log(e));
            });
          }
        }),
    );
  };

  let getUserMedia = () => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices
        .getUserMedia({ video: video, audio: audio })
        .then(getUserMediaSuccess)
        .then((stream) => {})
        .catch((e) => console.log(e));
    } else {
      try {
        let tracks = localVideoref.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      } catch (e) {}
    }
  };

  let getDislayMediaSuccess = (stream) => {
    console.log("HERE");
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    localVideoref.current.srcObject = stream;

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      connections[id].addStream(window.localStream);

      connections[id].createOffer().then((description) => {
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            socketRef.current.emit(
              "signal",
              id,
              JSON.stringify({ sdp: connections[id].localDescription }),
            );
          })
          .catch((e) => console.log(e));
      });
    }

    stream.getTracks().forEach(
      (track) =>
        (track.onended = () => {
          setScreen(false);

          try {
            let tracks = localVideoref.current.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
          } catch (e) {
            console.log(e);
          }

          let blackSilence = (...args) =>
            new MediaStream([black(...args), silence()]);
          window.localStream = blackSilence();
          localVideoref.current.srcObject = window.localStream;

          getUserMedia();
        }),
    );
  };

  let gotMessageFromServer = (fromId, message) => {
    var signal = JSON.parse(message);

    if (fromId !== socketIdRef.current) {
      if (signal.sdp) {
        connections[fromId]
          .setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .then(() => {
            if (signal.sdp.type === "offer") {
              connections[fromId]
                .createAnswer()
                .then((description) => {
                  connections[fromId]
                    .setLocalDescription(description)
                    .then(() => {
                      socketRef.current.emit(
                        "signal",
                        fromId,
                        JSON.stringify({
                          sdp: connections[fromId].localDescription,
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
        connections[fromId]
          .addIceCandidate(new RTCIceCandidate(signal.ice))
          .catch((e) => console.log(e));
      }
    }
  };

  let connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("signal", gotMessageFromServer);

    socketRef.current.on("connect", () => {
      socketRef.current.emit("join-call", window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("chat-message", addMessage);
      socketRef.current.on("reaction", handleIncomingReaction);
      socketRef.current.on("receive-speech-chunk", handleIncomingSpeechChunk);
      socketRef.current.on("deliver-translated-voice", handleDeliverTranslatedVoice);

      socketRef.current.on("user-left", (id) => {
        setVideos((videos) => videos.filter((video) => video.socketId !== id));
      });

      socketRef.current.on("user-joined", (id, clients) => {
        clients.forEach((socketListId) => {
          if (socketListId === socketIdRef.current) return;

          connections[socketListId] = new RTCPeerConnection(
            peerConfigConnections,
          );
          // Wait for their ice candidate
          connections[socketListId].onicecandidate = function (event) {
            if (event.candidate != null) {
              socketRef.current.emit(
                "signal",
                socketListId,
                JSON.stringify({ ice: event.candidate }),
              );
            }
          };

          // Wait for their video stream
          connections[socketListId].onaddstream = (event) => {
            console.log("BEFORE:", videoRef.current);
            console.log("FINDING ID: ", socketListId);

            let videoExists = videoRef.current.find(
              (video) => video.socketId === socketListId,
            );

            if (videoExists) {
              console.log("FOUND EXISTING");

              // Update the stream of the existing video
              setVideos((videos) => {
                const updatedVideos = videos.map((video) =>
                  video.socketId === socketListId
                    ? { ...video, stream: event.stream }
                    : video,
                );
                videoRef.current = updatedVideos;
                return updatedVideos;
              });
            } else {
              // Create a new video
              console.log("CREATING NEW");
              let newVideo = {
                socketId: socketListId,
                stream: event.stream,
                autoplay: true,
                playsinline: true,
              };

              setVideos((videos) => {
                const updatedVideos = [...videos, newVideo];
                videoRef.current = updatedVideos;
                return updatedVideos;
              });
            }
          };

          // Add the local video stream
          if (window.localStream !== undefined && window.localStream !== null) {
            connections[socketListId].addStream(window.localStream);
          } else {
            let blackSilence = (...args) =>
              new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            connections[socketListId].addStream(window.localStream);
          }
        });

        if (id === socketIdRef.current) {
          for (let id2 in connections) {
            if (id2 === socketIdRef.current) continue;

            try {
              connections[id2].addStream(window.localStream);
            } catch (e) {}

            connections[id2].createOffer().then((description) => {
              connections[id2]
                .setLocalDescription(description)
                .then(() => {
                  socketRef.current.emit(
                    "signal",
                    id2,
                    JSON.stringify({ sdp: connections[id2].localDescription }),
                  );
                })
                .catch((e) => console.log(e));
            });
          }
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
  };

  useEffect(() => {
    if (screen !== undefined) {
      getDislayMedia();
    }
  }, [screen]);
  let handleScreen = () => {
    setScreen(!screen);
  };

  let handleEndCall = () => {
    try {
      let tracks = localVideoref.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    } catch (e) {}
    window.location.href = "/";
  };

  let openChat = () => {
    setModal(true);
    setNewMessages(0);
  };
  let closeChat = () => {
    setModal(false);
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
    console.log(socketRef.current);
    socketRef.current.emit("chat-message", message, username);
    setMessage("");

    // this.setState({ message: "", sender: username })
  };

  let connect = () => {
    setAskForUsername(false);
    getMedia();
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
                  if (el && window.localStream) {
                    el.srcObject = window.localStream;
                  }
                }}
                autoPlay
                muted
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
                <h1>Meeting Chat</h1>

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
                    onChange={(e) => setMessage(e.target.value)}
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
                if (el && window.localStream) {
                  el.srcObject = window.localStream;
                }
              }}
              autoPlay
              muted
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
                const hasVideoTrack =
                  videoItem.stream &&
                  videoItem.stream.getVideoTracks().length > 0 &&
                  videoItem.stream.getVideoTracks()[0].enabled;

                return (
                  <div key={videoItem.socketId} className={styles.mainVideoTile}>
                    <video
                      data-socket={videoItem.socketId}
                      ref={(ref) => {
                        if (ref && videoItem.stream) {
                          ref.srcObject = videoItem.stream;
                        }
                      }}
                      autoPlay
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: hasVideoTrack ? "block" : "none",
                      }}
                    ></video>
                    {!hasVideoTrack && (
                      <div className={styles.blackScreenTile}>
                        <VideocamOffIcon sx={{ fontSize: 56, color: "#ef4444" }} />
                        <span style={{ color: "#f8fafc", marginTop: "8px", fontWeight: "600" }}>Camera Off</span>
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
