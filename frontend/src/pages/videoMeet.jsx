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
import ClosedCaptionIcon from "@mui/icons-material/ClosedCaption";
import ClosedCaptionDisabledIcon from "@mui/icons-material/ClosedCaptionDisabled";
import TranslateIcon from "@mui/icons-material/Translate";
import server from "../environment";
import { SUPPORTED_LANGUAGES, INDIAN_LANGUAGES, INTERNATIONAL_LANGUAGES, translateText, speakTranslatedAudio, queueTranslatedAudio, clearAudioQueue } from "../utils/translationService";
import { streamingPlayer } from "../utils/streamingAudioPlayer";

const server_url = server;

let connections = {};

const peerConfigConnections = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.services.mozilla.com" },
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

  // Live Subtitles, Translation & Audio Dubbing States
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [spokenLanguage, setSpokenLanguage] = useState("en");
  const [captionLanguage, setCaptionLanguage] = useState("en");
  const [audioDubbing, setAudioDubbing] = useState(false);
  const [originalAudioVolume, setOriginalAudioVolume] = useState("ducked"); // "ducked" (20%), "muted" (0%), "normal" (100%)
  const [showCaptionSettings, setShowCaptionSettings] = useState(false);
  const [activeCaption, setActiveCaption] = useState(null);
  const [autoTranslateChat, setAutoTranslateChat] = useState(false);
  const [chatTranslations, setChatTranslations] = useState({});

  const getPeerAudioVolume = () => {
    if (!audioDubbing) return 1.0;
    if (originalAudioVolume === "muted") return 0.0;
    if (originalAudioVolume === "ducked") return 0.2;
    return 1.0;
  };

  // Dynamic volume adjustment for remote peer audio when voice dubbing is active
  useEffect(() => {
    const vol = getPeerAudioVolume();
    document.querySelectorAll("audio[data-remote='true']").forEach((audioEl) => {
      audioEl.volume = vol;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioDubbing, originalAudioVolume]);

  // Refs for async callbacks
  const recognitionRef = useRef(null);
  const captionsEnabledRef = useRef(false);
  const audioRef = useRef(true);
  const spokenLanguageRef = useRef("en");
  const captionLanguageRef = useRef("en");
  const audioDubbingRef = useRef(false);
  const autoTranslateChatRef = useRef(false);
  const captionTimeoutRef = useRef(null);
  const peerStreamsRef = useRef({});
  const dubbingTimeoutRef = useRef({});
  const peerWordsPointerRef = useRef({});

  // Auto-unmute and resume any blocked audio contexts on user click/interaction
  useEffect(() => {
    const unblockAudio = () => {
      document.querySelectorAll("audio, video").forEach((el) => {
        if (el.paused && el.srcObject && !el.muted) {
          el.play().catch(() => {});
        }
      });
      if (typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    };

    window.addEventListener("click", unblockAudio);
    window.addEventListener("keydown", unblockAudio);
    window.addEventListener("touchstart", unblockAudio);

    return () => {
      window.removeEventListener("click", unblockAudio);
      window.removeEventListener("keydown", unblockAudio);
      window.removeEventListener("touchstart", unblockAudio);
    };
  }, []);

  // Keep refs in sync with state for callbacks
  useEffect(() => {
    captionsEnabledRef.current = captionsEnabled;
    audioRef.current = audio;
    spokenLanguageRef.current = spokenLanguage;
    captionLanguageRef.current = captionLanguage;
    audioDubbingRef.current = audioDubbing;
    autoTranslateChatRef.current = autoTranslateChat;
  }, [captionsEnabled, audio, spokenLanguage, captionLanguage, audioDubbing, autoTranslateChat]);

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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
      if (captionTimeoutRef.current) {
        clearTimeout(captionTimeoutRef.current);
      }
      clearAudioQueue();
      streamingPlayer.stop();
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
    if (!stream) return;
    if (stream.getAudioTracks) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    }
    if (stream.getVideoTracks) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });
    }

    // Create fresh MediaStream reference with current tracks so DOM video/audio elements rebind
    const activeStream = new MediaStream(stream.getTracks());

    setVideos((prevVideos) => {
      const videoExists = prevVideos.find((v) => v.socketId === id);
      if (videoExists) {
        return prevVideos.map((v) =>
          v.socketId === id ? { ...v, stream: activeStream, version: Date.now() } : v
        );
      } else {
        return [
          ...prevVideos,
          {
            socketId: id,
            stream: activeStream,
            version: Date.now(),
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
      // Deterministic order: Always Audio first, then Video across ALL peers!
      const audioTracks = window.localStream.getAudioTracks();
      const videoTracks = window.localStream.getVideoTracks();
      const orderedTracks = [...audioTracks, ...videoTracks];

      orderedTracks.forEach((track) => {
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

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
  };

  const startSpeechRecognition = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API is not supported in this browser.");
      return;
    }

    stopSpeechRecognition();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      const langObj = SUPPORTED_LANGUAGES.find(
        (l) => l.code === spokenLanguageRef.current
      );
      recognition.lang = langObj ? langObj.speechCode : "en-US";

      recognition.onresult = (event) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += chunk;
          } else {
            interimTranscript += chunk;
          }
        }

        const captionText = (finalTranscript || interimTranscript).trim();
        const isFinal = Boolean(finalTranscript);

        if (captionText && socketRef.current) {
          socketRef.current.emit("live-speech-caption", {
            text: captionText,
            sender: username || "Guest",
            spokenLang: spokenLanguageRef.current,
            isFinal,
          });
        }
      };

      recognition.onerror = (event) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("Speech recognition error:", event.error);
        }
      };

      recognition.onend = () => {
        // Auto-restart if captions or dubbing and mic are still enabled
        if ((captionsEnabledRef.current || audioDubbingRef.current) && audioRef.current) {
          setTimeout(() => {
            try {
              if ((captionsEnabledRef.current || audioDubbingRef.current) && audioRef.current && recognitionRef.current) {
                recognitionRef.current.start();
              }
            } catch (e) {}
          }, 200);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn("Could not initialize SpeechRecognition:", err);
    }
  };

  // Manage speech recognition lifecycle
  useEffect(() => {
    if ((captionsEnabled || audioDubbing) && audio && !askForUsername) {
      startSpeechRecognition();
    } else {
      stopSpeechRecognition();
    }

    return () => {
      stopSpeechRecognition();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionsEnabled, audioDubbing, audio, spokenLanguage, askForUsername]);

  const handleIncomingSpeechCaption = async (captionData) => {
    if (!captionsEnabledRef.current && !audioDubbingRef.current) return;
    const { text, sender, spokenLang, isFinal, socketIdSender } = captionData;
    if (!text || !text.trim()) return;

    const myTargetLang = captionLanguageRef.current;
    let displayText = text;
    let fromLang = spokenLang || "auto";

    // If source language differs from my target caption language, translate!
    if (spokenLang !== myTargetLang) {
      try {
        const res = await translateText(
          text,
          myTargetLang,
          spokenLang,
          socketRef.current
        );
        if (res && res.translatedText) {
          displayText = res.translatedText;
          fromLang = res.from || spokenLang;
        }
      } catch (err) {
        displayText = text;
      }
    }

    const isMe = socketIdSender === socketIdRef.current;

    if (captionsEnabledRef.current) {
      setActiveCaption({
        text: displayText,
        originalText: text,
        sender: isMe ? "You" : sender,
        fromLang,
        toLang: myTargetLang,
        isFinal,
        isMe,
        id: Date.now() + Math.random(),
      });
    }

    // CONTINUOUS LIVE AUDIO DUBBING: Speaks streaming clauses in real-time as words are spoken!
    if (!isMe && audioDubbingRef.current) {
      const words = text.trim().split(/\s+/);
      const pointer = peerWordsPointerRef.current[socketIdSender] || 0;
      const newWordsCount = words.length - pointer;

      // Slice out completed clauses (every 3-4 words, on punctuation mark, or when finalized)
      const hasPunctuation = /[।!?,.]/.test(text.slice(-2));
      const shouldSpeakClause =
        newWordsCount >= 4 ||
        (hasPunctuation && newWordsCount >= 2) ||
        (isFinal && newWordsCount > 0);

      if (shouldSpeakClause) {
        const clauseToTranslate = words.slice(pointer, pointer + newWordsCount).join(" ");
        peerWordsPointerRef.current[socketIdSender] = words.length;

        if (spokenLang !== myTargetLang) {
          translateText(clauseToTranslate, myTargetLang, spokenLang, socketRef.current)
            .then((res) => {
              if (res && res.translatedText) {
                queueTranslatedAudio(res.translatedText, myTargetLang);
              }
            })
            .catch(() => {
              queueTranslatedAudio(clauseToTranslate, myTargetLang);
            });
        } else {
          queueTranslatedAudio(clauseToTranslate, myTargetLang);
        }
      }

      // Reset pointer when sentence is finalized
      if (isFinal) {
        peerWordsPointerRef.current[socketIdSender] = 0;
      }
    }

    // Auto-clear active caption after 4.5 seconds of silence
    if (captionTimeoutRef.current) {
      clearTimeout(captionTimeoutRef.current);
    }
    captionTimeoutRef.current = setTimeout(() => {
      setActiveCaption(null);
    }, 4500);
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
      if (!peerStreamsRef.current[id]) {
        peerStreamsRef.current[id] = new MediaStream();
      }
      const peerStream = peerStreamsRef.current[id];

      // Remove any existing track of the same kind to prevent conflicting duplicates
      peerStream.getTracks().forEach((existingTrack) => {
        if (existingTrack.kind === event.track.kind && existingTrack.id !== event.track.id) {
          peerStream.removeTrack(existingTrack);
        }
      });

      if (!peerStream.getTracks().some((t) => t.id === event.track.id)) {
        peerStream.addTrack(event.track);
      }
      event.track.enabled = true;

      handleRemoteStream(id, peerStream);
    };

    // Legacy fallback listener
    pc.onaddstream = (event) => {
      console.log("Remote stream added for id: ", id);
      if (!peerStreamsRef.current[id]) {
        peerStreamsRef.current[id] = new MediaStream();
      }
      const peerStream = peerStreamsRef.current[id];
      event.stream.getTracks().forEach((track) => {
        if (!peerStream.getTracks().some((t) => t.id === track.id)) {
          peerStream.addTrack(track);
        }
        track.enabled = true;
      });
      handleRemoteStream(id, peerStream);
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

          if (signal.sdp.type === "offer") {
            pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
              .then(() => {
                // Attach ordered local tracks so answer transceivers match the offer's m-line order
                addTracksToPeer(pc);

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

                return pc.createAnswer();
              })
              .then((description) => pc.setLocalDescription(description))
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
              .catch((e) => console.log("createAnswer / setRemote error:", e));
          } else if (signal.sdp.type === "answer") {
            // Guard: only apply answer if peer connection is expecting an answer
            if (pc.signalingState === "have-local-offer") {
              pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => {
                  if (iceCandidatesQueue.current[fromId] && iceCandidatesQueue.current[fromId].length > 0) {
                    const queue = iceCandidatesQueue.current[fromId];
                    iceCandidatesQueue.current[fromId] = [];
                    queue.forEach((candidate) => {
                      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) =>
                        console.log("addQueuedCandidate error:", e)
                      );
                    });
                  }
                })
                .catch((e) => console.log("setRemoteDescription answer error:", e));
            } else {
              console.log("Skipped answer because signalingState is:", pc.signalingState);
            }
          }
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
      socketRef.current.on("live-speech-caption", handleIncomingSpeechCaption);

      socketRef.current.on("stream-audio-translated", (data) => {
        if (audioDubbingRef.current && data?.audioData) {
          streamingPlayer.playPcmChunk(data.audioData);
        }
      });

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
        delete peerStreamsRef.current[id];
        delete peerWordsPointerRef.current[id];
        if (dubbingTimeoutRef.current[id]) {
          clearTimeout(dubbingTimeoutRef.current[id]);
          delete dubbingTimeoutRef.current[id];
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
    stopSpeechRecognition();
    streamingPlayer.stop();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
    if (captionTimeoutRef.current) {
      clearTimeout(captionTimeoutRef.current);
    }
    clearAudioQueue();
    peerWordsPointerRef.current = {};
    for (let id in dubbingTimeoutRef.current) {
      clearTimeout(dubbingTimeoutRef.current[id]);
    }
    dubbingTimeoutRef.current = {};
    for (let id in peerStreamsRef.current) {
      try {
        peerStreamsRef.current[id].getTracks().forEach((track) => track.stop());
      } catch (e) {}
    }
    peerStreamsRef.current = {};
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
    setMessages((prevMessages) => {
      const msgIndex = prevMessages.length;
      if (autoTranslateChatRef.current && socketIdSender !== socketIdRef.current) {
        translateText(data, captionLanguageRef.current, "auto", socketRef.current)
          .then((res) => {
            if (res && res.translatedText) {
              setChatTranslations((prev) => ({
                ...prev,
                [msgIndex]: res.translatedText,
              }));
            }
          })
          .catch(() => {});
      }
      return [
        ...prevMessages,
        { sender: sender, data: data, socketId: socketIdSender },
      ];
    });
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages((prevNewMessages) => prevNewMessages + 1);
    }
  };

  const handleTranslateChatMessage = async (idx, text) => {
    if (chatTranslations[idx]) {
      setChatTranslations((prev) => {
        const next = { ...prev };
        delete next[idx];
        return next;
      });
      return;
    }
    const res = await translateText(text, captionLanguageRef.current, "auto", socketRef.current);
    if (res && res.translatedText) {
      setChatTranslations((prev) => ({
        ...prev,
        [idx]: res.translatedText,
      }));
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

              {/* Language & Live Dubbing Card in Lobby */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.7)",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#818cf8",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  <TranslateIcon style={{ fontSize: "1rem" }} />
                  <span>Language & Live Translation</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.74rem",
                        color: "#94a3b8",
                        marginBottom: "4px",
                        fontWeight: 500,
                      }}
                    >
                      I will speak in (Mic)
                    </label>
                    <select
                      value={spokenLanguage}
                      onChange={(e) => setSpokenLanguage(e.target.value)}
                      className={styles.captionSelect}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        fontSize: "0.82rem",
                        borderRadius: "8px",
                      }}
                    >
                      <optgroup label="🇮🇳 Indian Regional Languages">
                        {INDIAN_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="🌍 International Languages">
                        {INTERNATIONAL_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.74rem",
                        color: "#94a3b8",
                        marginBottom: "4px",
                        fontWeight: 500,
                      }}
                    >
                      I want to hear & read in
                    </label>
                    <select
                      value={captionLanguage}
                      onChange={(e) => setCaptionLanguage(e.target.value)}
                      className={styles.captionSelect}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        fontSize: "0.82rem",
                        borderRadius: "8px",
                      }}
                    >
                      <optgroup label="🇮🇳 Indian Regional Languages">
                        {INDIAN_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="🌍 International Languages">
                        {INTERNATIONAL_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: "4px",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      cursor: "pointer",
                      color: "#f8fafc",
                      fontSize: "0.8rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={captionsEnabled}
                      onChange={(e) => setCaptionsEnabled(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: "#6366f1" }}
                    />
                    <span>Live Subtitles</span>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      cursor: "pointer",
                      color: "#f8fafc",
                      fontSize: "0.8rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={audioDubbing}
                      onChange={(e) => {
                        setAudioDubbing(e.target.checked);
                        if (e.target.checked) setCaptionsEnabled(true);
                      }}
                      style={{ width: 15, height: 15, accentColor: "#6366f1" }}
                    />
                    <span>🔊 Live Voice Dubbing</span>
                  </label>
                </div>
              </div>

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
                  <div>
                    <h1 style={{ margin: 0, padding: 0, border: "none", fontSize: "1.2rem", color: "#f8fafc" }}>Meeting Chat</h1>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                      Target: {SUPPORTED_LANGUAGES.find((l) => l.code === captionLanguage)?.name || captionLanguage}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => setAutoTranslateChat(!autoTranslateChat)}
                      title="Toggle auto-translation of incoming messages"
                      style={{
                        background: autoTranslateChat ? "rgba(99, 102, 241, 0.3)" : "rgba(255, 255, 255, 0.08)",
                        border: `1px solid ${autoTranslateChat ? "#818cf8" : "rgba(255, 255, 255, 0.15)"}`,
                        color: autoTranslateChat ? "#c7d2fe" : "#94a3b8",
                        borderRadius: "8px",
                        padding: "4px 8px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <TranslateIcon style={{ fontSize: "0.9rem" }} />
                      {autoTranslateChat ? "Auto ON" : "Auto OFF"}
                    </button>
                    <IconButton onClick={() => setModal(false)} size="small" style={{ color: "#94a3b8" }}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </div>
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
                          {chatTranslations[index] && (
                            <div className={styles.chatTranslatedBubble}>
                              <span className={styles.chatTranslatedTag}>
                                Translated ({captionLanguage.toUpperCase()}):
                              </span>
                              {chatTranslations[index]}
                            </div>
                          )}
                          <button
                            type="button"
                            className={styles.chatTranslateBtn}
                            onClick={() => handleTranslateChatMessage(index, item.data)}
                          >
                            <TranslateIcon style={{ fontSize: "0.8rem" }} />
                            {chatTranslations[index] ? "Hide Translation" : `Translate to ${captionLanguage.toUpperCase()}`}
                          </button>
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

            <IconButton
              onClick={() => setCaptionsEnabled(!captionsEnabled)}
              style={{
                color: captionsEnabled ? "#38bdf8" : "#94a3b8",
                backgroundColor: captionsEnabled ? "rgba(56, 189, 248, 0.2)" : undefined,
              }}
              title={captionsEnabled ? "Turn off live subtitles" : "Turn on live subtitles"}
            >
              {captionsEnabled ? <ClosedCaptionIcon /> : <ClosedCaptionDisabledIcon />}
            </IconButton>

            <IconButton
              onClick={() => setShowCaptionSettings(!showCaptionSettings)}
              style={{
                color: showCaptionSettings ? "#818cf8" : "white",
                backgroundColor: showCaptionSettings ? "rgba(129, 140, 248, 0.25)" : undefined,
              }}
              title="Translation & Audio Dubbing Settings"
            >
              <TranslateIcon />
            </IconButton>
          </div>

          {captionsEnabled && activeCaption && (
            <div className={styles.captionOverlayContainer}>
              <div className={styles.captionBox}>
                <div className={styles.captionHeader}>
                  <span className={styles.captionSpeaker}>
                    <span className={styles.captionDot}></span>
                    {activeCaption.sender}
                  </span>
                  {activeCaption.fromLang &&
                    activeCaption.toLang &&
                    activeCaption.fromLang !== activeCaption.toLang && (
                      <span className={styles.captionLangTag}>
                        {activeCaption.fromLang} → {activeCaption.toLang}
                      </span>
                    )}
                  {audioDubbing && !activeCaption.isMe && (
                    <span className={styles.captionDubbingTag}>
                      🔊 Voice Dubbing
                    </span>
                  )}
                </div>
                <div className={styles.captionText}>{activeCaption.text}</div>
                {activeCaption.fromLang !== activeCaption.toLang &&
                  activeCaption.originalText !== activeCaption.text && (
                    <div className={styles.captionOriginalSubtext}>
                      Original: "{activeCaption.originalText}"
                    </div>
                  )}
              </div>
            </div>
          )}

          {showCaptionSettings && (
            <div className={styles.captionSettingsModal}>
              <div className={styles.captionSettingsHeader}>
                <h3>
                  <TranslateIcon sx={{ fontSize: 20, color: "#818cf8" }} />
                  Live Audio & Translation
                </h3>
                <IconButton
                  onClick={() => setShowCaptionSettings(false)}
                  size="small"
                  style={{ color: "#94a3b8" }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </div>

              <div className={styles.captionSettingsBody}>
                <div className={styles.captionToggleRow}>
                  <div className={styles.captionToggleInfo}>
                    <span className={styles.captionToggleTitle}>
                      Live Subtitles (CC)
                    </span>
                    <span className={styles.captionToggleDesc}>
                      Show real-time speech captions
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={captionsEnabled}
                    onChange={(e) => setCaptionsEnabled(e.target.checked)}
                    style={{
                      width: 18,
                      height: 18,
                      cursor: "pointer",
                      accentColor: "#6366f1",
                    }}
                  />
                </div>

                <div className={styles.captionSelectGroup}>
                  <label className={styles.captionSelectLabel}>
                    My Spoken Language (Microphone)
                  </label>
                  <select
                    className={styles.captionSelect}
                    value={spokenLanguage}
                    onChange={(e) => setSpokenLanguage(e.target.value)}
                  >
                    <optgroup label="🇮🇳 Indian Regional Languages">
                      {INDIAN_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🌍 International Languages">
                      {INTERNATIONAL_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className={styles.captionSelectGroup}>
                  <label className={styles.captionSelectLabel}>
                    Translate Captions & Dubbing To
                  </label>
                  <select
                    className={styles.captionSelect}
                    value={captionLanguage}
                    onChange={(e) => setCaptionLanguage(e.target.value)}
                  >
                    <optgroup label="🇮🇳 Indian Regional Languages">
                      {INDIAN_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🌍 International Languages">
                      {INTERNATIONAL_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className={styles.captionToggleRow}>
                  <div className={styles.captionToggleInfo}>
                    <span className={styles.captionToggleTitle}>
                      🔊 Live Audio Dubbing
                    </span>
                    <span className={styles.captionToggleDesc}>
                      Speak translated speech out loud via TTS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={audioDubbing}
                    onChange={(e) => {
                      const nextVal = e.target.checked;
                      setAudioDubbing(nextVal);
                      if (nextVal) {
                        speakTranslatedAudio("Audio dubbing enabled", captionLanguage);
                      }
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      cursor: "pointer",
                      accentColor: "#6366f1",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      speakTranslatedAudio(
                        "Hello! Audio dubbing and speech translation are working in Nexivo.",
                        captionLanguage
                      );
                    }}
                    style={{
                      background: "rgba(99, 102, 241, 0.2)",
                      border: "1px solid rgba(129, 140, 248, 0.4)",
                      color: "#c7d2fe",
                      borderRadius: "8px",
                      padding: "6px 12px",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontWeight: 600,
                    }}
                  >
                    🔊 Test Voice / Audio
                  </button>
                </div>

                {audioDubbing && (
                  <div
                    className={styles.captionToggleRow}
                    style={{
                      padding: "8px 12px",
                      background: "rgba(255, 255, 255, 0.04)",
                      borderRadius: "10px",
                      border: "1px dashed rgba(255, 255, 255, 0.15)",
                    }}
                  >
                    <div className={styles.captionToggleInfo}>
                      <span className={styles.captionToggleTitle} style={{ fontSize: "0.82rem" }}>
                        Original Voice Volume
                      </span>
                      <span className={styles.captionToggleDesc} style={{ fontSize: "0.72rem" }}>
                        Hear original Hindi vs translated English
                      </span>
                    </div>
                    <select
                      value={originalAudioVolume}
                      onChange={(e) => setOriginalAudioVolume(e.target.value)}
                      className={styles.captionSelect}
                      style={{ padding: "4px 8px", fontSize: "0.78rem", width: "auto" }}
                    >
                      <option value="ducked">Ducked (20% Quiet)</option>
                      <option value="muted">Mute (0% English only)</option>
                      <option value="normal">Normal (100%)</option>
                    </select>
                  </div>
                )}

                <div className={styles.captionToggleRow}>
                  <div className={styles.captionToggleInfo}>
                    <span className={styles.captionToggleTitle}>
                      Auto-Translate Chat
                    </span>
                    <span className={styles.captionToggleDesc}>
                      Translate incoming chat messages
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoTranslateChat}
                    onChange={(e) => setAutoTranslateChat(e.target.checked)}
                    style={{
                      width: 18,
                      height: 18,
                      cursor: "pointer",
                      accentColor: "#6366f1",
                    }}
                  />
                </div>
              </div>
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
                const peerState = mediaStates[videoItem.socketId];
                const isVideoOn = peerState ? peerState.video : true;
                const isAudioOn = peerState ? peerState.audio : true;

                return (
                  <div key={videoItem.socketId} className={styles.mainVideoTile}>
                    {/* Dedicated remote audio element guarantees speech audio plays even if video is paused or camera is off */}
                    <audio
                      data-remote="true"
                      autoPlay
                      playsInline
                      ref={(audioEl) => {
                        if (audioEl && videoItem.stream) {
                          if (audioEl.srcObject !== videoItem.stream) {
                            audioEl.srcObject = videoItem.stream;
                          }
                          audioEl.volume = getPeerAudioVolume();
                          audioEl.play().catch((err) => {
                            console.warn("Audio element autoplay waiting for user gesture:", err);
                          });
                        }
                      }}
                    />
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
                      muted
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
